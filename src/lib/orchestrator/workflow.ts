import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { monitorAgent } from "@/lib/agents/monitor";
import { MonitorOutput } from "@/lib/agents/monitor";
import { BottleneckOutput } from "@/lib/agents/bottleneck";
import { RedesignOutput } from "@/lib/agents/redesign";
import { RiskOutput } from "@/lib/agents/risk";
import {
  runHistoricalStressTest,
  computeVar,
  selectStressScenarioKeys,
} from "@/lib/agents/risk";
import {
	isStructuredOutputError,
	normalizeMonitorOutput,
	parseRawAgentText,
	recoverStructuredOutput,
} from "@/lib/agents/normalize-output";
import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { getBatchPrices, getHistory } from "@/lib/market";
import { computeCorrelationMatrix } from "@/lib/orchestrator/compute-correlation";
import { computePortfolioMetrics } from "@/lib/orchestrator/compute-metrics";
import { syncTickerMetadataForHoldings } from "@/lib/market/ticker-metadata";
import { assetClassForTicker } from "@/lib/agents/redesign";
import type { AssetClass } from "@/lib/types/visual";

// ── Memory context ──────────────────────────────────────────────────
// Per-agent thread IDs prevent schema contamination: shared memory ends
// with the last agent's output (e.g. Risk), so the next Monitor run sees
// Risk JSON in context and mirrors it. Separate threads give each agent
// its own history while still preserving cross-run continuity per agent.
const MEMORY_THREADS = {
  monitor: "portfolio-factory-monitor",
  bottleneck: "portfolio-factory-bottleneck",
  redesign: "portfolio-factory-redesign",
  risk: "portfolio-factory-risk",
} as const;
const MEMORY_RESOURCE_ID = "portfolio-factory";

const PreferencesSchema = z.object({
  sectorConstraint: z.enum(["same_sector", "diversify"]).default("same_sector"),
  maxTurnoverPct: z.number().default(30),
  excludedTickers: z.array(z.string()).default([]),
});

// ── Shared schemas ──────────────────────────────────────────────────

const PortfolioDataEntry = z.object({
  ticker: z.string(),
  assetClass: z.string(),
  quantity: z.number(),
  avgCost: z.number(),
  currentPrice: z.number().nullable(),
  marketValue: z.number().nullable(),
  pnlPct: z.number().nullable(),
});

const MarketSnapshotSchema = z.object({
  portfolioData: z.array(PortfolioDataEntry),
  totalValue: z.number(),
  totalCost: z.number(),
  tickers: z.array(z.string()),
  preferences: PreferencesSchema.default({ sectorConstraint: "same_sector", maxTurnoverPct: 30, excludedTickers: [] }),
});

const CorrelationPairSchema = z.object({
  with: z.string(),
  correlation: z.number(),
});

const CorrelationEntrySchema = z.object({
  ticker: z.string(),
  correlations: z.array(CorrelationPairSchema),
});

const CorrelationMatrixSchema = z.array(CorrelationEntrySchema);

/** Market snapshot + correlation matrix — passed between fetch → monitor */
const SnapshotWithCorrelationSchema = MarketSnapshotSchema.extend({
  correlationMatrix: CorrelationMatrixSchema,
});

const PortfolioMetricsSchema = z.object({
  sharpeRatio: z.number().nullable(),
  maxDrawdownPct: z.number(),
});

const SnapshotWithMetricsSchema = SnapshotWithCorrelationSchema.extend({
  portfolioMetrics: PortfolioMetricsSchema,
});

const WorkflowOutputSchema = z.object({
  monitor: MonitorOutput,
  bottleneck: BottleneckOutput.nullable(),
  redesign: RedesignOutput.nullable(),
  risk: RiskOutput.nullable(),
  correlationMatrix: CorrelationMatrixSchema,
});

type PortfolioPosition = {
  ticker: string;
  weight: number;
  assetClass: string;
  quantity?: number;
};

type StressTestResult = {
  stress_results: {
    scenario: string;
    simulated_drawdown_pct: number;
    simulated_return_pct?: number;
    data_coverage_pct?: number;
    skipped_assets?: string[];
    recovery_days: number | null;
  }[];
  error?: string;
};

type VarResult = {
  var_pct: number;
  var_dollar: number;
  portfolio_value: number;
  confidence_level: number;
  lookback_days: number;
  concentration_score: number;
  error?: string;
};

type RedesignProposalForRisk = z.infer<typeof RedesignOutput>["proposals"][number];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function scoreDelta(delta: number | null, multiplier: number) {
  if (delta == null || !Number.isFinite(delta)) return 50;
  return clamp(50 + delta * multiplier, 0, 100);
}

function confidenceScore(confidence: RedesignProposalForRisk["confidence"]) {
  if (confidence === "high") return 100;
  if (confidence === "medium") return 70;
  return 40;
}

function formatSigned(value: number, suffix = "") {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function computeProposalFit(params: {
  currentRiskScore: number;
  proposedRiskScore: number;
  currentExpectedReturn90d: number | null;
  proposedExpectedReturn90d: number | null;
  currentUpsideDownsideRatio: number | null;
  proposedUpsideDownsideRatio: number | null;
  turnoverPct: number;
  maxTurnoverPct: number;
  confidence: RedesignProposalForRisk["confidence"];
  verdict: z.infer<typeof RiskOutput>["verdict"];
}) {
  const riskDelta = params.currentRiskScore - params.proposedRiskScore;
  const returnDelta =
    params.currentExpectedReturn90d != null && params.proposedExpectedReturn90d != null
      ? params.proposedExpectedReturn90d - params.currentExpectedReturn90d
      : null;
  const upsideDownsideDelta =
    params.currentUpsideDownsideRatio != null && params.proposedUpsideDownsideRatio != null
      ? params.proposedUpsideDownsideRatio - params.currentUpsideDownsideRatio
      : null;
  const turnoverBudgetUsed =
    params.maxTurnoverPct > 0 ? clamp(params.turnoverPct / params.maxTurnoverPct, 0, 1) : 1;
  const turnoverScore = clamp(100 - turnoverBudgetUsed * 70, 0, 100);
  const rawScore =
    scoreDelta(riskDelta, 4) * 0.4 +
    scoreDelta(returnDelta, 2) * 0.25 +
    scoreDelta(upsideDownsideDelta, 18) * 0.1 +
    turnoverScore * 0.15 +
    confidenceScore(params.confidence) * 0.1;
  const cappedScore =
    params.verdict === "rejected"
      ? Math.min(rawScore, 49)
      : params.verdict === "approved_with_caveats"
        ? Math.min(rawScore, 84)
        : rawScore;

  const reasons = [
    `${riskDelta >= 0 ? "Risk improves" : "Risk worsens"} by ${Math.abs(riskDelta).toFixed(2)} points`,
  ];
  if (returnDelta != null) {
    reasons.push(`90d expected return ${formatSigned(returnDelta, "pp")}`);
  }
  if (upsideDownsideDelta != null) {
    reasons.push(`Upside/downside ratio ${formatSigned(upsideDownsideDelta)}`);
  }
  reasons.push(`${params.turnoverPct.toFixed(1)}% turnover uses ${(turnoverBudgetUsed * 100).toFixed(0)}% of limit`);

  const tradeoffs = [
    riskDelta < 0 ? `Risk score worsens by ${Math.abs(riskDelta).toFixed(2)} points` : null,
    returnDelta != null && returnDelta < 0 ? `Expected return falls ${Math.abs(returnDelta).toFixed(2)}pp` : null,
    params.turnoverPct > params.maxTurnoverPct * 0.6 ? `High turnover at ${params.turnoverPct.toFixed(1)}%` : null,
    params.confidence === "low" ? "Low agent confidence" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    score: Math.round(clamp(cappedScore, 0, 100)),
    reasons: reasons.slice(0, 3),
    tradeoff: tradeoffs[0] ?? "No major trade-off flagged by aggregate metrics.",
  };
}

function normalizeRedesignOutput(
  output: z.infer<typeof RedesignOutput>,
): z.infer<typeof RedesignOutput> {
  const proposals = output.proposals.slice(0, 3);
  const recommendedProposal =
    proposals.find((proposal) => proposal.id === output.recommended_proposal_id) ??
    proposals.find((proposal) => proposal.label === "Balanced") ??
    proposals[0];

  return {
    ...output,
    proposals,
    recommended_proposal_id: recommendedProposal.id,
    proposed_actions: recommendedProposal.proposed_actions,
    expected_improvement: recommendedProposal.expected_improvement,
    confidence: recommendedProposal.confidence,
    proposal_summary: recommendedProposal.proposal_summary,
  };
}

const historicalStressTestTool = runHistoricalStressTest as unknown as {
  execute(input: { positions_override: PortfolioPosition[]; scenarios?: string[] }): Promise<StressTestResult>;
};

const varTool = computeVar as unknown as {
  execute(input: { positions_override: PortfolioPosition[] }): Promise<VarResult>;
};

async function computeOpportunityMetrics(positions: PortfolioPosition[]) {
  const returnsByTicker = new Map<string, number[]>();

  await Promise.all(
    positions.map(async (position) => {
      const history = await getHistory(position.ticker, position.assetClass as AssetClass, {
        days: 90,
      });
      const returns: number[] = [];
      if (!history || history.length < 2) {
        returnsByTicker.set(position.ticker, returns);
        return;
      }
      for (let i = 1; i < history.length; i++) {
        const previousClose = history[i - 1].close;
        if (previousClose <= 0) continue;
        returns.push((history[i].close - previousClose) / previousClose);
      }
      returnsByTicker.set(position.ticker, returns);
    }),
  );

  const minLen = Math.min(
    ...positions.map((position) => returnsByTicker.get(position.ticker)?.length ?? 0),
  );
  if (!Number.isFinite(minLen) || minLen <= 0) {
    return {
      expectedReturn90dPct: null,
      upsideDownsideRatio: null,
    };
  }

  const portfolioReturns: number[] = [];
  for (let i = 0; i < minLen; i++) {
    let weightedReturn = 0;
    for (const position of positions) {
      weightedReturn += position.weight * (returnsByTicker.get(position.ticker)?.[i] ?? 0);
    }
    portfolioReturns.push(weightedReturn);
  }

  const cumulativeReturn = portfolioReturns.reduce(
    (value, dailyReturn) => value * (1 + dailyReturn),
    1,
  ) - 1;
  const upside = portfolioReturns
    .filter((dailyReturn) => dailyReturn > 0)
    .reduce((sum, dailyReturn) => sum + dailyReturn, 0);
  const downside = Math.abs(
    portfolioReturns
      .filter((dailyReturn) => dailyReturn < 0)
      .reduce((sum, dailyReturn) => sum + dailyReturn, 0),
  );

  return {
    expectedReturn90dPct: Math.round(cumulativeReturn * 10000) / 100,
    upsideDownsideRatio:
      downside > 0 ? Math.round((upside / downside) * 100) / 100 : null,
  };
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function extractStructuredOutputValue(err: unknown): unknown {
  if (!err || typeof err !== "object") return null;
  const details = (err as { details?: { value?: unknown } }).details;
  return details?.value ?? null;
}

function buildRiskSummary(params: {
  verdict: z.infer<typeof RiskOutput>["verdict"];
  currentScore: number;
  proposedScore: number;
  deltaScore: number;
  currentAvgDrawdown: number;
  proposedAvgDrawdown: number;
  currentVaR: number;
  proposedVaR: number;
}) {
  const direction =
    params.deltaScore < -0.05
      ? "improves"
      : params.deltaScore > 0.05
        ? "worsens"
        : "roughly preserves";

  return `Risk verdict: ${params.verdict}. The proposal ${direction} the weighted risk score (${params.currentScore.toFixed(2)} -> ${params.proposedScore.toFixed(2)}) while moving average stress drawdown from ${params.currentAvgDrawdown.toFixed(2)}% to ${params.proposedAvgDrawdown.toFixed(2)}% and VaR from ${params.currentVaR.toFixed(2)}% to ${params.proposedVaR.toFixed(2)}%.`;
}

function buildImprovementSummary(params: {
  currentAvgDrawdown: number;
  proposedAvgDrawdown: number;
  currentMaxDrawdown: number;
  proposedMaxDrawdown: number;
  currentVaR: number;
  proposedVaR: number;
  currentConcentration: number;
  proposedConcentration: number;
}) {
  return [
    `Current avg drawdown ${params.currentAvgDrawdown.toFixed(2)}% -> Proposed avg drawdown ${params.proposedAvgDrawdown.toFixed(2)}%, an improvement of ${(params.currentAvgDrawdown - params.proposedAvgDrawdown).toFixed(2)}pp.`,
    `Current max drawdown ${params.currentMaxDrawdown.toFixed(2)}% -> Proposed max drawdown ${params.proposedMaxDrawdown.toFixed(2)}%.`,
    `Current VaR ${params.currentVaR.toFixed(2)}% -> Proposed VaR ${params.proposedVaR.toFixed(2)}%.`,
    `Current concentration ${params.currentConcentration.toFixed(4)} -> Proposed concentration ${params.proposedConcentration.toFixed(4)}.`,
  ].join(" ");
}

// ── Step 1: Fetch market snapshot ───────────────────────────────────

const fetchMarketSnapshot = createStep({
  id: "fetch-market-snapshot",
  description: "Pull live prices for all holdings from DB + market data APIs",
  inputSchema: PreferencesSchema,
  outputSchema: MarketSnapshotSchema,
  execute: async ({ inputData }) => {
    const rows = await db.select().from(holdings);
    if (rows.length === 0) {
      return { portfolioData: [], totalValue: 0, totalCost: 0, tickers: [], preferences: inputData };
    }

    const priceMap = await getBatchPrices(
      rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
    );

    // Sync ticker metadata for sector heatmap (non-critical — guard against missing table)
    try {
      await syncTickerMetadataForHoldings(
        rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
      );
    } catch (syncErr) {
      console.warn("syncTickerMetadataForHoldings failed (table missing?), continuing:", syncErr);
    }

    let totalValue = 0;
    let totalCost = 0;

    const portfolioData = rows.map((row) => {
      const snapshot = priceMap.get(row.ticker);
      const currentPrice = snapshot?.price ?? null;
      const marketValue = currentPrice != null ? currentPrice * row.quantity : null;
      const pnlPct =
        currentPrice != null && row.avgCost > 0
          ? ((currentPrice - row.avgCost) / row.avgCost) * 100
          : null;

      if (marketValue != null) totalValue += marketValue;
      totalCost += row.avgCost * row.quantity;

      return {
        ticker: row.ticker,
        assetClass: row.assetClass,
        quantity: row.quantity,
        avgCost: row.avgCost,
        currentPrice,
        marketValue,
        pnlPct,
      };
    });

    return {
      portfolioData,
      totalValue,
      totalCost,
      tickers: rows.map((r) => r.ticker),
      preferences: inputData,
    };
  },
});

// ── Step 2: Compute correlation matrix ────────────────────────────────

const computeCorrelationStep = createStep({
  id: "compute-correlation-matrix",
  description:
    "Compute pairwise Pearson correlation matrix for all portfolio tickers. Frontend uses this to color/weight conveyor edges.",
  inputSchema: MarketSnapshotSchema,
  outputSchema: SnapshotWithCorrelationSchema,
  execute: async ({ inputData }) => {
    const matrix =
      inputData.tickers.length >= 2
        ? await computeCorrelationMatrix(inputData.tickers, 90)
        : [];
    return { ...inputData, correlationMatrix: matrix };
  },
});

// ── Step 3: Compute portfolio metrics (Sharpe + Max Drawdown) ────────────

const computeMetricsStep = createStep({
  id: "compute-portfolio-metrics",
  description:
    "Pre-compute portfolio-level Sharpe ratio and Max Drawdown from 90 days of historical prices.",
  inputSchema: SnapshotWithCorrelationSchema,
  outputSchema: SnapshotWithMetricsSchema,
  execute: async ({ inputData }) => {
    const metrics = await computePortfolioMetrics(
      inputData.portfolioData.map((d) => ({
        ticker: d.ticker,
        assetClass: d.assetClass,
        quantity: d.quantity,
      })),
    );
    return { ...inputData, portfolioMetrics: metrics };
  },
});

// ── Step 4: Monitor Agent ───────────────────────────────────────────

const monitorStep = createStep({
  id: "monitor",
  description: "Run Monitor Agent to assess portfolio health",
  inputSchema: SnapshotWithMetricsSchema,
  outputSchema: MonitorOutput,
  execute: async ({ inputData }) => {
    const prompt = [
      "CRITICAL: You must output ONLY raw, valid JSON matching the requested schema. Do not use markdown formatting. Do not wrap in ```json ... ```. No conversational text.",
      "",
      "CRITICAL: Output ONLY raw valid JSON matching this exact schema:",
      "{",
      '  "health_status": "nominal" | "warning" | "critical",',
      '  "portfolio_metrics": { "total_value": number, "unrealised_pnl_pct": number, "sharpe_ratio": number|null, "max_drawdown_pct": number, "largest_position_pct": number },',
      '  "concerns": [string, ...],',
      '  "escalate": boolean,',
      '  "summary": string,',
      '  "asset_health": [{ "ticker": string, "health": "nominal"|"warning"|"critical" }, ...]',
      "}",
      "",
      "Precomputed portfolio metrics (do not override unless you disagree strongly):",
      `Sharpe ratio: ${inputData.portfolioMetrics.sharpeRatio ?? "insufficient data"}`,
      `Max drawdown: ${(inputData.portfolioMetrics.maxDrawdownPct ?? 0).toFixed(2)}%`,
      "",
      "Analyze this portfolio and assess its health:",
      JSON.stringify(inputData.portfolioData, null, 2),
      `Total portfolio value: $${inputData.totalValue.toFixed(2)}`,
      `Total cost basis: $${inputData.totalCost.toFixed(2)}`,
    ].join("\n");

    try {
      const result = await monitorAgent.generate(prompt, {
        structuredOutput: { schema: MonitorOutput, jsonPromptInjection: true },
        memory: { thread: MEMORY_THREADS.monitor, resource: MEMORY_RESOURCE_ID },
        modelSettings: { maxOutputTokens: 4096 },
        activeTools: [],
      });
      return result.object;
    } catch (err) {
      if (!isStructuredOutputError(err)) throw err;
      return await recoverStructuredOutput(
        monitorAgent,
        prompt,
        MonitorOutput,
        normalizeMonitorOutput,
        { memory: { thread: MEMORY_THREADS.monitor, resource: MEMORY_RESOURCE_ID } },
      );
    }
  },
});

// ── Step 4: Bottleneck Agent ─────────────────────────────────────────

const bottleneckStep = createStep({
  id: "bottleneck",
  description:
    "Run Bottleneck Agent to diagnose portfolio issues (skipped if nominal)",
  inputSchema: MonitorOutput,
  outputSchema: WorkflowOutputSchema,
  execute: async ({ inputData: monitorResult, getStepResult }) => {
    const marketSnapshot = getStepResult(fetchMarketSnapshot) as z.infer<
      typeof MarketSnapshotSchema
    >;
    const correlationStepResult = getStepResult(computeCorrelationStep) as z.infer<
      typeof SnapshotWithCorrelationSchema
    >;
    const correlationMatrix = correlationStepResult.correlationMatrix;

    // Nominal path — skip bottleneck
    if (monitorResult.health_status === "nominal") {
      return {
        monitor: monitorResult,
        bottleneck: null,
        redesign: null,
        risk: null,
        correlationMatrix,
      };
    }

    const { tickers, portfolioData } = marketSnapshot;

    const bottleneckPrompt = [
      "CRITICAL: You must output ONLY raw, valid JSON matching the requested schema. Do not use markdown formatting. Do not wrap in ```json ... ```. No conversational text.",
      "",
      "CRITICAL: Output ONLY raw valid JSON matching this exact schema:",
      "{",
      '  "primary_bottleneck": { "ticker": string, "reason": string, "severity": "low"|"medium"|"high", "metric": string },',
      '  "secondary_bottlenecks": [{ "ticker": string, "reason": string }, ...],',
      '  "analysis": string',
      "}",
      "",
      "The Monitor Agent has flagged a concern with this portfolio.",
      `Health status: ${monitorResult.health_status}`,
      `Concerns: ${monitorResult.concerns.join("; ") || "none listed"}`,
      "",
      "Portfolio holdings:",
      JSON.stringify(portfolioData, null, 2),
      "",
      `Tickers to analyze: ${tickers.join(", ")}`,
      "",
      "Identify the primary bottleneck asset. Analyze the correlation data and volatility contributions provided above.",
    ].join("\n");

     const bottleneckAgent = (
       await import("@/lib/agents/bottleneck")
     ).bottleneckAgent;

    let bottleneckResultObj;
    try {
      const result = await bottleneckAgent.generate(bottleneckPrompt, {
        structuredOutput: { schema: BottleneckOutput, jsonPromptInjection: true },
        memory: { thread: MEMORY_THREADS.bottleneck, resource: MEMORY_RESOURCE_ID },
        modelSettings: { maxOutputTokens: 4096 },
        activeTools: [],
      });
      bottleneckResultObj = result.object;
    } catch (err) {
      if (!isStructuredOutputError(err)) throw err;
      bottleneckResultObj = await recoverStructuredOutput(
        bottleneckAgent,
        bottleneckPrompt,
        BottleneckOutput,
        (r) => r,
        { memory: { thread: MEMORY_THREADS.bottleneck, resource: MEMORY_RESOURCE_ID } },
      );
    }

    return {
      monitor: monitorResult,
      bottleneck: bottleneckResultObj,
      redesign: null,
      risk: null,
      correlationMatrix,
    };
  },
});

// ── Step 5: Redesign Agent ────────────────────────────────────────────

const redesignStep = createStep({
  id: "redesign",
  description:
    "Run Redesign Agent to propose portfolio changes (skipped if no bottleneck)",
  inputSchema: WorkflowOutputSchema,
  outputSchema: WorkflowOutputSchema,
  execute: async ({ inputData, getStepResult }) => {
    // Skip if nominal path (no bottleneck output)
    if (!inputData.bottleneck) return inputData;

    const marketSnapshot = getStepResult(fetchMarketSnapshot) as z.infer<
      typeof MarketSnapshotSchema
    >;
    const { portfolioData, preferences } = marketSnapshot;

    const currentSectorSet = new Set(portfolioData.map((d) => d.assetClass));
    const allowedAssetClasses = preferences.sectorConstraint === "same_sector"
      ? Array.from(currentSectorSet)
      : ["equity", "crypto", "bond", "etf", "fx"];

    const redesignPrompt = [
      "CRITICAL: You must output ONLY raw, valid JSON matching the requested schema. Do not use markdown formatting. Do not wrap in ```json ... ```. No conversational text.",
      "",
      "CRITICAL: Output ONLY raw valid JSON matching this exact schema:",
      "{",
      '  "proposals": [',
      '    { "id": string, "label": "Conservative"|"Balanced"|"Aggressive"|"Recommended", "proposed_actions": [{ "action": "reduce"|"increase"|"replace"|"add"|"remove", "ticker": string, "target_pct": number, "rationale": string }, ...], "expected_improvement": { "sharpe_delta": number|null, "volatility_delta_pct": number|null, "max_drawdown_delta_pct": number|null, "narrative": string }, "confidence": "low"|"medium"|"high", "proposal_summary": string, "tradeoff_notes": string }',
      '  ],',
      '  "recommended_proposal_id": string',
      "}",
      "",
      "The Bottleneck Agent has diagnosed a problem.",
      `Primary bottleneck: ${inputData.bottleneck.primary_bottleneck.ticker} — ${inputData.bottleneck.primary_bottleneck.reason}`,
      `Severity: ${inputData.bottleneck.primary_bottleneck.severity}`,
      `Analysis: ${inputData.bottleneck.analysis}`,
      "",
      "Original portfolio holdings:",
      JSON.stringify(portfolioData, null, 2),
      "",
      "User preferences:",
      `- Sector constraint: ${preferences.sectorConstraint === "same_sector" ? "Stay within current sectors only" : "Allow cross-sector diversification (ETFs, bonds, FX, equities)"}`,
      `- Max turnover: ${preferences.maxTurnoverPct}%`,
      preferences.excludedTickers.length > 0 ? `- Excluded tickers: ${preferences.excludedTickers.join(", ")}` : "",
      "",
      "Allowed asset classes for alternatives:",
      JSON.stringify(allowedAssetClasses),
      "",
      "Generate exactly 3 proposals labeled Conservative, Balanced, and Aggressive. They must be meaningfully different and all must respect the same hard constraints.",
      "Propose concrete rebalancing actions. Analyze the holdings data above and recommend specific changes with target percentages.",
    ].join("\n");

    const redesignAgent = (await import("@/lib/agents/redesign")).redesignAgent;

    let redesignResultObj;
    try {
      const result = await redesignAgent.generate(redesignPrompt, {
        structuredOutput: { schema: RedesignOutput, jsonPromptInjection: true },
        memory: { thread: MEMORY_THREADS.redesign, resource: MEMORY_RESOURCE_ID },
        modelSettings: { maxOutputTokens: 4096 },
        activeTools: [],
      });
      redesignResultObj = normalizeRedesignOutput(result.object);
    } catch (err) {
      if (!isStructuredOutputError(err)) throw err;
      redesignResultObj = normalizeRedesignOutput(await recoverStructuredOutput(
        redesignAgent,
        redesignPrompt,
        RedesignOutput,
        (r) => r,
        { memory: { thread: MEMORY_THREADS.redesign, resource: MEMORY_RESOURCE_ID } },
      ));
    }

    return { ...inputData, redesign: redesignResultObj };
  },
});

// ── Step 6: Risk Agent ────────────────────────────────────────────────

// Kept as an exported legacy step shape while persisted single-proposal runs still
// exist. The workflow below uses the new multi-proposal riskStep.
export const legacySingleProposalRiskStep = createStep({
  id: "risk",
  description:
    "Run Risk Agent to stress-test proposed changes (skipped if no redesign)",
  inputSchema: WorkflowOutputSchema,
  outputSchema: WorkflowOutputSchema,
  execute: async ({ inputData, getStepResult }) => {
    // Skip if nominal path (no redesign output)
    if (!inputData.redesign) return inputData;

    const marketSnapshot = getStepResult(fetchMarketSnapshot) as z.infer<
      typeof MarketSnapshotSchema
    >;
    const { portfolioData } = marketSnapshot;

    // ── Build current positions from snapshot ─────────────────────────────
    const currentPositions = portfolioData.map((d) => ({
      ticker: d.ticker,
      weight:
        marketSnapshot.totalValue > 0 && d.marketValue != null
          ? d.marketValue / marketSnapshot.totalValue
          : 0,
      assetClass: d.assetClass,
      quantity: d.quantity,
    }));

    // ── Build proposed positions from redesign actions ────────────────────
    type ProposedAction = { action: string; ticker: string; target_pct: number; rationale?: string };
    const actions = inputData.redesign.proposed_actions as ProposedAction[] | undefined;
    const totalValue = marketSnapshot.totalValue;

    const proposedPositions: { ticker: string; weight: number; assetClass: string; quantity: number }[] = [];

    if (actions && actions.length > 0 && totalValue > 0) {
      // 1. Clone current positions into a map keyed by uppercase ticker
      const proposedMap = new Map<string, { ticker: string; weight: number; assetClass: string; quantity: number }>();
      for (const pos of currentPositions) {
        proposedMap.set(pos.ticker.toUpperCase(), { ...pos });
      }

      // 2. Identify new tickers and fetch prices (reuse existing logic)
      const newTickers = actions
        .map((a) => a.ticker)
        .filter(
          (t) => !portfolioData.some((d) => d.ticker.toUpperCase() === t.toUpperCase()),
        );
      const newPriceMap = newTickers.length > 0
        ? await getBatchPrices(
            newTickers.map((t) => ({
              ticker: t,
              assetClass: assetClassForTicker(t),
            })),
          )
        : new Map<string, { price: number | null }>();

      // 3. Apply redesign actions as deltas to the map
      for (const action of actions) {
        const upperTicker = action.ticker.toUpperCase();

        if (action.action === "remove") {
          proposedMap.delete(upperTicker);
          continue;
        }

        const targetWeight = action.target_pct / 100;
        const existing = portfolioData.find(
          (d) => d.ticker.toUpperCase() === upperTicker,
        );
        let currentPrice = existing?.currentPrice ?? null;
        if (currentPrice == null) {
          const fetched = newPriceMap.get(action.ticker);
          if (fetched && "price" in fetched && fetched.price != null) {
            currentPrice = fetched.price as number;
          }
        }
        if (currentPrice == null || currentPrice <= 0) {
          console.warn(
            `[riskStep] Cannot price proposed ticker ${action.ticker} — skipping in stress test`,
          );
          continue;
        }
        const quantity = (targetWeight * totalValue) / currentPrice;
        proposedMap.set(upperTicker, {
          ticker: action.ticker,
          weight: targetWeight,
          assetClass: existing?.assetClass ?? assetClassForTicker(action.ticker),
          quantity,
        });
      }

      // 4. Compute total weight of remaining positions
      let totalWeight = 0;
      for (const pos of proposedMap.values()) {
        totalWeight += pos.weight;
      }

      // 5. Normalize weights to sum to 1.0
      if (totalWeight > 0) {
        for (const pos of proposedMap.values()) {
          pos.weight = pos.weight / totalWeight;
        }
      }

      // 6. Convert map back to array
      proposedPositions.push(...Array.from(proposedMap.values()));
    }

    const stressScenarioKeys = selectStressScenarioKeys([
      ...currentPositions,
      ...proposedPositions,
    ]);

    // ── Pre-compute stress + VaR for BOTH portfolios ──────────────────────
    const [currentStress, proposedStress, currentVaR, proposedVaR] = await Promise.all([
      historicalStressTestTool.execute({ positions_override: currentPositions, scenarios: stressScenarioKeys }),
      proposedPositions.length > 0
        ? historicalStressTestTool.execute({ positions_override: proposedPositions, scenarios: stressScenarioKeys })
        : Promise.resolve({ stress_results: [] } as StressTestResult),
      varTool.execute({ positions_override: currentPositions }),
      proposedPositions.length > 0
        ? varTool.execute({ positions_override: proposedPositions })
        : Promise.resolve({ var_pct: 0, var_dollar: 0, portfolio_value: 0, confidence_level: 0.95, lookback_days: 252, concentration_score: 0 }),
    ]);

    const [currentOpportunity, proposedOpportunity] = await Promise.all([
      computeOpportunityMetrics(currentPositions),
      proposedPositions.length > 0
        ? computeOpportunityMetrics(proposedPositions)
        : Promise.resolve({ expectedReturn90dPct: null, upsideDownsideRatio: null }),
    ]);

    type ScenarioComparisonWithReturn = {
      scenario: string;
      current_drawdown?: number;
      proposed_drawdown?: number;
      delta_pp?: number;
      current_return?: number;
      proposed_return?: number;
      delta_return_pp?: number;
      current_data_coverage_pct?: number;
      proposed_data_coverage_pct?: number;
    };

    const currentStressByScenario = new Map(
      currentStress.stress_results.map((result) => [result.scenario, result]),
    );
    const proposedStressByScenario = new Map(
      proposedStress.stress_results.map((result) => [result.scenario, result]),
    );
    const scenarioNames = Array.from(
      new Set([
        ...currentStressByScenario.keys(),
        ...proposedStressByScenario.keys(),
      ]),
    );

    const scenarioComparisons: ScenarioComparisonWithReturn[] = scenarioNames.map((scenario) => {
      const curr = currentStressByScenario.get(scenario);
      const prop = proposedStressByScenario.get(scenario);
      const currentDrawdown = curr?.simulated_drawdown_pct;
      const proposedDrawdown = prop?.simulated_drawdown_pct;
      const currentReturn = curr?.simulated_return_pct;
      const proposedReturn = prop?.simulated_return_pct;
      const hasReturnPair =
        typeof currentReturn === "number" &&
        typeof proposedReturn === "number";

      return {
        scenario,
        current_drawdown: currentDrawdown,
        proposed_drawdown: proposedDrawdown,
        delta_pp: typeof currentDrawdown === "number" && typeof proposedDrawdown === "number"
          ? parseFloat((proposedDrawdown - currentDrawdown).toFixed(2))
          : undefined,
        current_return: currentReturn,
        proposed_return: proposedReturn,
        delta_return_pp: hasReturnPair
            ? parseFloat((proposedReturn - currentReturn).toFixed(2))
            : undefined,
        current_data_coverage_pct: curr?.data_coverage_pct,
        proposed_data_coverage_pct: prop?.data_coverage_pct,
      };
    });

    const bestUpsideScenario = scenarioComparisons
      .filter(
        (scenario): scenario is ScenarioComparisonWithReturn & { current_return: number; proposed_return: number } =>
          typeof scenario.current_return === "number" &&
          typeof scenario.proposed_return === "number",
      )
      .sort((a, b) => b.proposed_return - a.proposed_return)[0];

    // Compute aggregate drawdown metrics and weighted risk score
    const currentDrawdowns = currentStress.stress_results.map((r) => r.simulated_drawdown_pct);
    const proposedDrawdowns = proposedStress.stress_results.map((r) => r.simulated_drawdown_pct);
    const currentAvgDrawdown = currentDrawdowns.length > 0 ? currentDrawdowns.reduce((a: number, b: number) => a + b, 0) / currentDrawdowns.length : 0;
    const proposedAvgDrawdown = proposedDrawdowns.length > 0 ? proposedDrawdowns.reduce((a: number, b: number) => a + b, 0) / proposedDrawdowns.length : 0;
    const currentMaxDrawdown = currentDrawdowns.length > 0 ? Math.max(...currentDrawdowns) : 0;
    const proposedMaxDrawdown = proposedDrawdowns.length > 0 ? Math.max(...proposedDrawdowns) : 0;

    const currentScore = 0.30 * (currentVaR.var_pct ?? 0) + 0.45 * currentMaxDrawdown + 0.25 * (currentVaR.concentration_score ?? 0);
    const proposedScore = 0.30 * (proposedVaR.var_pct ?? 0) + 0.45 * proposedMaxDrawdown + 0.25 * (proposedVaR.concentration_score ?? 0);
    const deltaScore = parseFloat((proposedScore - currentScore).toFixed(2));

    const riskPrompt = [
      "CRITICAL: You must output ONLY raw, valid JSON matching the requested schema. Do not use markdown formatting. Do not wrap in ```json ... ```. No conversational text.",
      "",
      "CRITICAL: Output ONLY raw valid JSON matching this exact schema:",
      "{",
      '  "verdict": "approved"|"approved_with_caveats"|"rejected",',
      '  "caveats": [string, ...],',
      '  "risk_summary": string,',
      '  "improvement_summary": string',
      "}",
      "",
      "COMPARATIVE RISK ANALYSIS: Compare the PROPOSED portfolio to the CURRENT portfolio using the PRE-COMPUTED data below. Do NOT recalculate — use these numbers directly.",
      "",
      "Current portfolio pre-computed stress results:",
      JSON.stringify(currentStress.stress_results, null, 2),
      currentStress.error ? `Current stress coverage warning: ${currentStress.error}` : "",
      `Current portfolio VaR 95%: ${currentVaR.var_pct}%`,
      `Current portfolio average drawdown across all stress scenarios: ${currentAvgDrawdown.toFixed(2)}%`,
      `Current portfolio max drawdown across all stress scenarios: ${currentMaxDrawdown.toFixed(2)}%`,
      `Current portfolio concentration score: ${currentVaR.concentration_score.toFixed(4)}`,
      "",
      "Proposed portfolio pre-computed stress results:",
      JSON.stringify(proposedStress.stress_results, null, 2),
      proposedStress.error ? `Proposed stress coverage warning: ${proposedStress.error}` : "",
      `Proposed portfolio VaR 95%: ${proposedVaR.var_pct}%`,
      `Proposed portfolio average drawdown across all stress scenarios: ${proposedAvgDrawdown.toFixed(2)}%`,
      `Proposed portfolio max drawdown across all stress scenarios: ${proposedMaxDrawdown.toFixed(2)}%`,
      `Proposed portfolio concentration score: ${proposedVaR.concentration_score.toFixed(4)}`,
      `Proposed portfolio expected 90d return: ${proposedOpportunity.expectedReturn90dPct ?? "N/A"}%`,
      `Proposed portfolio upside/downside ratio: ${proposedOpportunity.upsideDownsideRatio ?? "N/A"}`,
      "",
      "Proposed actions:",
      `${actions?.map((a) => `${a.action} ${a.ticker} to ${a.target_pct}%`).join("; ") ?? "none"}`,
      `Redesign confidence: ${inputData.redesign.confidence ?? "medium"}`,
      `Expected improvement: ${inputData.redesign.expected_improvement?.narrative ?? "N/A"}`,
      "",
      "Scenario-by-scenario comparison (DO NOT repeat in improvement_summary):",
      JSON.stringify(scenarioComparisons, null, 2),
      "",
      "Opportunity comparison:",
      `Current expected 90d return: ${currentOpportunity.expectedReturn90dPct ?? "N/A"}%`,
      `Proposed expected 90d return: ${proposedOpportunity.expectedReturn90dPct ?? "N/A"}%`,
      `Current upside/downside ratio: ${currentOpportunity.upsideDownsideRatio ?? "N/A"}`,
      `Proposed upside/downside ratio: ${proposedOpportunity.upsideDownsideRatio ?? "N/A"}`,
      bestUpsideScenario
        ? `Best proposed upside scenario: ${bestUpsideScenario.scenario} (${bestUpsideScenario.current_return}% current → ${bestUpsideScenario.proposed_return}% proposed)`
        : "Best proposed upside scenario: N/A",
      "",
      "Current portfolio holdings:",
      JSON.stringify(portfolioData, null, 2),
      "",
      "Weighted risk score (lower is better):",
      `Current portfolio risk score: ${currentScore.toFixed(2)}`,
      `Proposed portfolio risk score: ${proposedScore.toFixed(2)}`,
      `Score delta (proposed - current): ${deltaScore.toFixed(2)}`,
      "",
      "Rules:",
      '- "approved" — deltaScore < -0.05 (meaningful net improvement).',
      '- "approved_with_caveats" — |deltaScore| <= 0.05 (trade-off zone, mixed signals).',
      '- "rejected" — deltaScore > +0.05 (meaningful net worsening).',
      "",
      "CRITICAL: Do NOT compute average drawdown, max drawdown, or concentration score yourself. Use ONLY the pre-computed values stated explicitly above.",
      "CRITICAL: Copy the following exact line into your improvement_summary (fill in the numbers from above):",
      `"Current avg drawdown ${currentAvgDrawdown.toFixed(2)}% → Proposed avg drawdown ${proposedAvgDrawdown.toFixed(2)}%, an improvement of ${(currentAvgDrawdown - proposedAvgDrawdown).toFixed(2)}pp."`,
      "Then add similar exact lines for VaR, max drawdown, and concentration using the pre-computed numbers.",
      "",
      "Provide your verdict, caveats, risk_summary, and improvement_summary based ONLY on the pre-computed numbers above.",
    ].join("\n");

    const fallbackRiskSummary = buildRiskSummary({
      verdict:
        deltaScore < -0.05
          ? "approved"
          : deltaScore > 0.05
            ? "rejected"
            : "approved_with_caveats",
      currentScore,
      proposedScore,
      deltaScore,
      currentAvgDrawdown,
      proposedAvgDrawdown,
      currentVaR: currentVaR.var_pct,
      proposedVaR: proposedVaR.var_pct,
    });
    const fallbackImprovementSummary = buildImprovementSummary({
      currentAvgDrawdown,
      proposedAvgDrawdown,
      currentMaxDrawdown,
      proposedMaxDrawdown,
      currentVaR: currentVaR.var_pct,
      proposedVaR: proposedVaR.var_pct,
      currentConcentration: currentVaR.concentration_score,
      proposedConcentration: proposedVaR.concentration_score,
    });
    const normalizeRiskOutput = (raw: Record<string, unknown>): Record<string, unknown> => {
      const verdict =
        raw.verdict === "approved" ||
        raw.verdict === "approved_with_caveats" ||
        raw.verdict === "rejected"
          ? raw.verdict
          : deltaScore < -0.05
            ? "approved"
            : deltaScore > 0.05
              ? "rejected"
              : "approved_with_caveats";
      const caveats = coerceStringArray(raw.caveats);

      return {
        ...raw,
        verdict,
        caveats: caveats.length > 0 ? caveats : ["Risk Agent returned partial analysis; summaries were completed from computed metrics."],
        risk_summary:
          typeof raw.risk_summary === "string" && raw.risk_summary.trim().length > 0
            ? raw.risk_summary
            : fallbackRiskSummary,
        improvement_summary:
          typeof raw.improvement_summary === "string" && raw.improvement_summary.trim().length > 0
            ? raw.improvement_summary
            : fallbackImprovementSummary,
      };
    };
    const parseRiskOutput = (raw: unknown): z.infer<typeof RiskOutput> | null => {
      const parsed = typeof raw === "string" ? parseRawAgentText(raw) : raw;
      if (!parsed || typeof parsed !== "object") return null;

      try {
        return RiskOutput.parse(normalizeRiskOutput(parsed as Record<string, unknown>));
      } catch {
        return null;
      }
    };

    const riskAgent = (await import("@/lib/agents/risk")).riskAgent;

    let riskResultObj: z.infer<typeof RiskOutput> | null;
    try {
      const result = await riskAgent.generate(riskPrompt, {
        structuredOutput: { schema: RiskOutput, jsonPromptInjection: true },
        memory: { thread: MEMORY_THREADS.risk, resource: MEMORY_RESOURCE_ID },
        modelSettings: { maxOutputTokens: 4096 },
        activeTools: [],
      });
      riskResultObj = result.object;
    } catch (err) {
      if (!isStructuredOutputError(err)) throw err;
      riskResultObj = parseRiskOutput(extractStructuredOutputValue(err));
      if (!riskResultObj) {
        try {
          riskResultObj = await recoverStructuredOutput(
            riskAgent,
            riskPrompt,
            RiskOutput,
            normalizeRiskOutput,
            { memory: { thread: MEMORY_THREADS.risk, resource: MEMORY_RESOURCE_ID } },
          );
        } catch (recoverErr) {
          console.warn("[riskStep] Structured output recovery failed:", recoverErr);
          riskResultObj = null;
        }
      }
    }

    if (!riskResultObj) {
      riskResultObj = {
        stress_results: proposedStress?.stress_results || [],
        var_95: proposedVaR?.var_pct || 0,
        verdict:
          deltaScore < -0.05
            ? "approved"
            : deltaScore > 0.05
              ? "rejected"
              : "approved_with_caveats",
        caveats: ["LLM risk analysis failed to generate; verdict and summaries were computed from deterministic risk metrics."],
        risk_summary: fallbackRiskSummary,
        improvement_summary: fallbackImprovementSummary,
      };
    }

    // Attach structured scenario comparisons for the UI
    riskResultObj.scenario_comparisons = scenarioComparisons;

    // Override var_95 and stress_results with pre-computed proposed metrics
    if (riskResultObj) {
      riskResultObj.stress_results = proposedStress?.stress_results || [];
      riskResultObj.var_95 = proposedVaR?.var_pct || 0;
    }

    // Attach computed aggregate metrics for UI
    riskResultObj.current_avg_drawdown = currentAvgDrawdown;
    riskResultObj.proposed_avg_drawdown = proposedAvgDrawdown;
    riskResultObj.current_max_drawdown = currentMaxDrawdown;
    riskResultObj.proposed_max_drawdown = proposedMaxDrawdown;
    riskResultObj.current_concentration_score = currentVaR.concentration_score;
    riskResultObj.proposed_concentration_score = proposedVaR.concentration_score;
    riskResultObj.current_var_95 = currentVaR.var_pct;
    if (typeof currentOpportunity.expectedReturn90dPct === "number") {
      riskResultObj.current_expected_return_90d = currentOpportunity.expectedReturn90dPct;
    }
    if (typeof proposedOpportunity.expectedReturn90dPct === "number") {
      riskResultObj.proposed_expected_return_90d = proposedOpportunity.expectedReturn90dPct;
    }
    if (typeof currentOpportunity.upsideDownsideRatio === "number") {
      riskResultObj.current_upside_downside_ratio = currentOpportunity.upsideDownsideRatio;
    }
    if (typeof proposedOpportunity.upsideDownsideRatio === "number") {
      riskResultObj.proposed_upside_downside_ratio = proposedOpportunity.upsideDownsideRatio;
    }
    if (
      bestUpsideScenario &&
      typeof bestUpsideScenario.current_return === "number" &&
      typeof bestUpsideScenario.proposed_return === "number" &&
      typeof bestUpsideScenario.delta_return_pp === "number"
    ) {
      riskResultObj.best_upside_scenario = {
        scenario: bestUpsideScenario.scenario,
        current_return: bestUpsideScenario.current_return,
        proposed_return: bestUpsideScenario.proposed_return,
        delta_return_pp: bestUpsideScenario.delta_return_pp,
      };
    }

    return { ...inputData, risk: riskResultObj };
  },
});

const riskStep = createStep({
  id: "risk",
  description: "Run Risk Agent to stress-test each proposed strategy",
  inputSchema: WorkflowOutputSchema,
  outputSchema: WorkflowOutputSchema,
  execute: async ({ inputData, getStepResult }) => {
    if (!inputData.redesign) return inputData;

    const marketSnapshot = getStepResult(fetchMarketSnapshot) as z.infer<
      typeof MarketSnapshotSchema
    >;
    const { portfolioData } = marketSnapshot;
    const currentPositions = portfolioData.map((d) => ({
      ticker: d.ticker,
      weight:
        marketSnapshot.totalValue > 0 && d.marketValue != null
          ? d.marketValue / marketSnapshot.totalValue
          : 0,
      assetClass: d.assetClass,
      quantity: d.quantity,
    }));
    type ProposedAction = { action: string; ticker: string; target_pct: number };

    async function buildProposedPositions(actions: ProposedAction[]) {
      const proposedMap = new Map<string, { ticker: string; weight: number; assetClass: string; quantity: number }>();
      for (const position of currentPositions) {
        proposedMap.set(position.ticker.toUpperCase(), {
          ticker: position.ticker,
          weight: position.weight,
          assetClass: position.assetClass,
          quantity: position.quantity,
        });
      }

      const newTickers = actions
        .map((action) => action.ticker)
        .filter((ticker) => !portfolioData.some((holding) => holding.ticker.toUpperCase() === ticker.toUpperCase()));
      const newPriceMap = newTickers.length > 0
        ? await getBatchPrices(newTickers.map((ticker) => ({ ticker, assetClass: assetClassForTicker(ticker) })))
        : new Map<string, { price: number | null }>();

      for (const action of actions) {
        const upperTicker = action.ticker.toUpperCase();
        if (action.action === "remove") {
          proposedMap.delete(upperTicker);
          continue;
        }

        const existing = portfolioData.find((holding) => holding.ticker.toUpperCase() === upperTicker);
        const currentPrice = existing?.currentPrice ?? newPriceMap.get(action.ticker)?.price ?? null;
        if (currentPrice == null || currentPrice <= 0) continue;

        const targetWeight = Math.max(action.target_pct, 0) / 100;
        proposedMap.set(upperTicker, {
          ticker: action.ticker,
          weight: targetWeight,
          assetClass: existing?.assetClass ?? assetClassForTicker(action.ticker),
          quantity: (targetWeight * marketSnapshot.totalValue) / currentPrice,
        });
      }

      const totalWeight = Array.from(proposedMap.values()).reduce((sum, position) => sum + position.weight, 0);
      if (totalWeight <= 0) return [];
      return Array.from(proposedMap.values()).map((position) => ({
        ...position,
        weight: position.weight / totalWeight,
      }));
    }

    function computeTurnoverPct(proposedPositions: PortfolioPosition[]) {
      const currentWeights = new Map(currentPositions.map((position) => [position.ticker.toUpperCase(), position.weight]));
      const proposedWeights = new Map(proposedPositions.map((position) => [position.ticker.toUpperCase(), position.weight]));
      const tickers = new Set([...currentWeights.keys(), ...proposedWeights.keys()]);
      let totalDelta = 0;
      for (const ticker of tickers) {
        totalDelta += Math.abs((proposedWeights.get(ticker) ?? 0) - (currentWeights.get(ticker) ?? 0));
      }
      return parseFloat(((totalDelta / 2) * 100).toFixed(2));
    }

    async function evaluateProposal(proposal: RedesignProposalForRisk): Promise<z.infer<typeof RiskOutput>> {
      const proposedPositions = await buildProposedPositions(proposal.proposed_actions);
      const stressScenarioKeys = selectStressScenarioKeys([...currentPositions, ...proposedPositions]);
      const [currentStress, proposedStress, currentVaR, proposedVaR] = await Promise.all([
        historicalStressTestTool.execute({ positions_override: currentPositions, scenarios: stressScenarioKeys }),
        proposedPositions.length > 0
          ? historicalStressTestTool.execute({ positions_override: proposedPositions, scenarios: stressScenarioKeys })
          : Promise.resolve({ stress_results: [] } as StressTestResult),
        varTool.execute({ positions_override: currentPositions }),
        proposedPositions.length > 0
          ? varTool.execute({ positions_override: proposedPositions })
          : Promise.resolve({ var_pct: 0, var_dollar: 0, portfolio_value: 0, confidence_level: 0.95, lookback_days: 252, concentration_score: 0 }),
      ]);
      const [currentOpportunity, proposedOpportunity] = await Promise.all([
        computeOpportunityMetrics(currentPositions),
        proposedPositions.length > 0
          ? computeOpportunityMetrics(proposedPositions)
          : Promise.resolve({ expectedReturn90dPct: null, upsideDownsideRatio: null }),
      ]);
      const currentDrawdowns = currentStress.stress_results.map((result) => result.simulated_drawdown_pct);
      const proposedDrawdowns = proposedStress.stress_results.map((result) => result.simulated_drawdown_pct);
      const currentAvgDrawdown = currentDrawdowns.length > 0 ? currentDrawdowns.reduce((sum, value) => sum + value, 0) / currentDrawdowns.length : 0;
      const proposedAvgDrawdown = proposedDrawdowns.length > 0 ? proposedDrawdowns.reduce((sum, value) => sum + value, 0) / proposedDrawdowns.length : 0;
      const currentMaxDrawdown = currentDrawdowns.length > 0 ? Math.max(...currentDrawdowns) : 0;
      const proposedMaxDrawdown = proposedDrawdowns.length > 0 ? Math.max(...proposedDrawdowns) : 0;
      const currentScore = 0.30 * currentVaR.var_pct + 0.45 * currentMaxDrawdown + 0.25 * currentVaR.concentration_score;
      const proposedScore = 0.30 * proposedVaR.var_pct + 0.45 * proposedMaxDrawdown + 0.25 * proposedVaR.concentration_score;
      const deltaScore = parseFloat((proposedScore - currentScore).toFixed(2));
      const verdict = deltaScore < -0.05 ? "approved" : deltaScore > 0.05 ? "rejected" : "approved_with_caveats";
      const currentStressByScenario = new Map(currentStress.stress_results.map((result) => [result.scenario, result]));
      const proposedStressByScenario = new Map(proposedStress.stress_results.map((result) => [result.scenario, result]));
      const scenarioNames = Array.from(new Set([...currentStressByScenario.keys(), ...proposedStressByScenario.keys()]));
      const scenarioComparisons = scenarioNames.map((scenario) => {
        const current = currentStressByScenario.get(scenario);
        const proposed = proposedStressByScenario.get(scenario);
        return {
          scenario,
          current_drawdown: current?.simulated_drawdown_pct,
          proposed_drawdown: proposed?.simulated_drawdown_pct,
          delta_pp:
            typeof current?.simulated_drawdown_pct === "number" && typeof proposed?.simulated_drawdown_pct === "number"
              ? parseFloat((proposed.simulated_drawdown_pct - current.simulated_drawdown_pct).toFixed(2))
              : undefined,
          current_return: current?.simulated_return_pct,
          proposed_return: proposed?.simulated_return_pct,
          delta_return_pp:
            typeof current?.simulated_return_pct === "number" && typeof proposed?.simulated_return_pct === "number"
              ? parseFloat((proposed.simulated_return_pct - current.simulated_return_pct).toFixed(2))
              : undefined,
          current_data_coverage_pct: current?.data_coverage_pct,
          proposed_data_coverage_pct: proposed?.data_coverage_pct,
        };
      });
      const fallbackRiskSummary = buildRiskSummary({
        verdict,
        currentScore,
        proposedScore,
        deltaScore,
        currentAvgDrawdown,
        proposedAvgDrawdown,
        currentVaR: currentVaR.var_pct,
        proposedVaR: proposedVaR.var_pct,
      });
      const fallbackImprovementSummary = buildImprovementSummary({
        currentAvgDrawdown,
        proposedAvgDrawdown,
        currentMaxDrawdown,
        proposedMaxDrawdown,
        currentVaR: currentVaR.var_pct,
        proposedVaR: proposedVaR.var_pct,
        currentConcentration: currentVaR.concentration_score,
        proposedConcentration: proposedVaR.concentration_score,
      });
      const turnoverPct = computeTurnoverPct(proposedPositions);
      const riskPrompt = [
        "Output only valid JSON matching this schema:",
        '{"verdict":"approved"|"approved_with_caveats"|"rejected","caveats":[string],"risk_summary":string,"improvement_summary":string}',
        `Proposal: ${proposal.label} (${proposal.id})`,
        `Computed verdict: ${verdict}`,
        `Risk score current -> proposed: ${currentScore.toFixed(2)} -> ${proposedScore.toFixed(2)}.`,
        `Current avg drawdown ${currentAvgDrawdown.toFixed(2)}%, proposed avg drawdown ${proposedAvgDrawdown.toFixed(2)}%.`,
        `Current VaR ${currentVaR.var_pct.toFixed(2)}%, proposed VaR ${proposedVaR.var_pct.toFixed(2)}%.`,
        `Current concentration ${currentVaR.concentration_score.toFixed(4)}, proposed concentration ${proposedVaR.concentration_score.toFixed(4)}.`,
        `Turnover: ${turnoverPct}%.`,
        `Actions: ${proposal.proposed_actions.map((action) => `${action.action} ${action.ticker} to ${action.target_pct}%`).join("; ")}`,
        "Do not change the computed verdict unless caveats make it strictly more conservative.",
      ].join("\n");
      const riskAgent = (await import("@/lib/agents/risk")).riskAgent;
      let riskOutput: z.infer<typeof RiskOutput> | null = null;
      try {
        const result = await riskAgent.generate(riskPrompt, {
          structuredOutput: { schema: RiskOutput, jsonPromptInjection: true },
          memory: { thread: `${MEMORY_THREADS.risk}-${proposal.id}`, resource: MEMORY_RESOURCE_ID },
          modelSettings: { maxOutputTokens: 2048 },
          activeTools: [],
        });
        riskOutput = result.object;
      } catch (err) {
        if (!isStructuredOutputError(err)) throw err;
        const raw = extractStructuredOutputValue(err);
        const parsed = typeof raw === "string" ? parseRawAgentText(raw) : raw;
        if (parsed && typeof parsed === "object") {
          try {
            riskOutput = RiskOutput.parse(parsed);
          } catch {
            riskOutput = null;
          }
        }
      }

      const finalVerdict = riskOutput?.verdict ?? verdict;
      const proposalFit = computeProposalFit({
        currentRiskScore: currentScore,
        proposedRiskScore: proposedScore,
        currentExpectedReturn90d: currentOpportunity.expectedReturn90dPct,
        proposedExpectedReturn90d: proposedOpportunity.expectedReturn90dPct,
        currentUpsideDownsideRatio: currentOpportunity.upsideDownsideRatio,
        proposedUpsideDownsideRatio: proposedOpportunity.upsideDownsideRatio,
        turnoverPct,
        maxTurnoverPct: marketSnapshot.preferences.maxTurnoverPct,
        confidence: proposal.confidence,
        verdict: finalVerdict,
      });
      return {
        stress_results: proposedStress.stress_results,
        var_95: proposedVaR.var_pct,
        verdict: finalVerdict,
        caveats: riskOutput?.caveats?.length ? riskOutput.caveats : ["Risk metrics were computed from historical stress and VaR data."],
        risk_summary: riskOutput?.risk_summary || fallbackRiskSummary,
        improvement_summary: riskOutput?.improvement_summary || fallbackImprovementSummary,
        scenario_comparisons: scenarioComparisons,
        current_avg_drawdown: currentAvgDrawdown,
        proposed_avg_drawdown: proposedAvgDrawdown,
        current_max_drawdown: currentMaxDrawdown,
        proposed_max_drawdown: proposedMaxDrawdown,
        current_concentration_score: currentVaR.concentration_score,
        proposed_concentration_score: proposedVaR.concentration_score,
        current_var_95: currentVaR.var_pct,
        current_expected_return_90d: currentOpportunity.expectedReturn90dPct ?? undefined,
        proposed_expected_return_90d: proposedOpportunity.expectedReturn90dPct ?? undefined,
        current_upside_downside_ratio: currentOpportunity.upsideDownsideRatio ?? undefined,
        proposed_upside_downside_ratio: proposedOpportunity.upsideDownsideRatio ?? undefined,
        proposal_id: proposal.id,
        proposal_label: proposal.label,
        proposal_turnover_pct: turnoverPct,
        proposal_risk_score: proposedScore,
        proposal_fit_score: proposalFit.score,
        proposal_fit_reasons: proposalFit.reasons,
        proposal_fit_tradeoff: proposalFit.tradeoff,
      } satisfies z.infer<typeof RiskOutput>;
    }

    const proposalRisks = await Promise.all(
      inputData.redesign.proposals.map((proposal) => evaluateProposal(proposal)),
    );
    const rankedRisks = [...proposalRisks].sort((a, b) => {
      const fitDelta = (b.proposal_fit_score ?? Number.NEGATIVE_INFINITY) - (a.proposal_fit_score ?? Number.NEGATIVE_INFINITY);
      if (Math.abs(fitDelta) > 0.01) return fitDelta;
      const verdictRank = { approved: 3, approved_with_caveats: 2, rejected: 1 };
      const verdictDelta = verdictRank[b.verdict] - verdictRank[a.verdict];
      if (verdictDelta !== 0) return verdictDelta;
      const riskDelta = (a.proposal_risk_score ?? Number.POSITIVE_INFINITY) - (b.proposal_risk_score ?? Number.POSITIVE_INFINITY);
      if (Math.abs(riskDelta) > 0.01) return riskDelta;
      const returnDelta = (b.proposed_expected_return_90d ?? Number.NEGATIVE_INFINITY) - (a.proposed_expected_return_90d ?? Number.NEGATIVE_INFINITY);
      if (Math.abs(returnDelta) > 0.01) return returnDelta;
      return (a.proposal_turnover_pct ?? Number.POSITIVE_INFINITY) - (b.proposal_turnover_pct ?? Number.POSITIVE_INFINITY);
    });
    const recommendedRisk: z.infer<typeof RiskOutput> = { ...(rankedRisks[0] ?? proposalRisks[0]) };
    recommendedRisk.proposal_risks = proposalRisks.map((risk) => {
      const { proposal_risks, recommended_proposal_id, ...rest } = risk;
      void proposal_risks;
      void recommended_proposal_id;
      return rest as NonNullable<z.infer<typeof RiskOutput>["proposal_risks"]>[number];
    });
    recommendedRisk.recommended_proposal_id = recommendedRisk.proposal_id;

    return {
      ...inputData,
      redesign: {
        ...inputData.redesign,
        recommended_proposal_id: recommendedRisk.proposal_id ?? inputData.redesign.recommended_proposal_id,
      },
      risk: recommendedRisk,
    };
  },
});

// ── Workflow definition ─────────────────────────────────────────────

export const portfolioFactoryWorkflow = createWorkflow({
  id: "portfolio-factory",
  description:
    "Full agent pipeline: fetch market data → Monitor → conditional escalation (Bottleneck → Redesign → Risk) or status update",
  inputSchema: z.object({
    sectorConstraint: z.enum(["same_sector", "diversify"]).default("same_sector"),
    maxTurnoverPct: z.number().default(30),
    excludedTickers: z.array(z.string()).default([]),
  }),
  outputSchema: WorkflowOutputSchema,
})
  .then(fetchMarketSnapshot)
  .then(computeCorrelationStep)
  .then(computeMetricsStep)
  .then(monitorStep)
  .then(bottleneckStep)
  .then(redesignStep)
  .then(riskStep)
  .commit();
