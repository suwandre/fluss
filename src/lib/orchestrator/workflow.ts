import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { monitorAgent } from "@/lib/agents/monitor";
import { MonitorOutput } from "@/lib/agents/monitor";
import { BottleneckOutput } from "@/lib/agents/bottleneck";
import { RedesignOutput } from "@/lib/agents/redesign";
import { RiskOutput } from "@/lib/agents/risk";
import {
	isStructuredOutputError,
	normalizeMonitorOutput,
	recoverStructuredOutput,
} from "@/lib/agents/normalize-output";
import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { getBatchPrices } from "@/lib/market";
import { computeCorrelationMatrix } from "@/lib/orchestrator/compute-correlation";
import { computePortfolioMetrics } from "@/lib/orchestrator/compute-metrics";

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

// ── Step 1: Fetch market snapshot ───────────────────────────────────

const fetchMarketSnapshot = createStep({
  id: "fetch-market-snapshot",
  description: "Pull live prices for all holdings from DB + market data APIs",
  inputSchema: z.object({}),
  outputSchema: MarketSnapshotSchema,
  execute: async () => {
    const rows = await db.select().from(holdings);
    if (rows.length === 0) {
      return { portfolioData: [], totalValue: 0, totalCost: 0, tickers: [] };
    }

    const priceMap = await getBatchPrices(
      rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
    );

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
    const { portfolioData } = marketSnapshot;

    const redesignPrompt = [
      "CRITICAL: You must output ONLY raw, valid JSON matching the requested schema. Do not use markdown formatting. Do not wrap in ```json ... ```. No conversational text.",
      "",
      "CRITICAL: Output ONLY raw valid JSON matching this exact schema:",
      "{",
      '  "proposed_actions": [{ "action": "reduce"|"increase"|"replace"|"add"|"remove", "ticker": string, "target_pct": number, "rationale": string }, ...],',
      '  "expected_improvement": { "sharpe_delta": number|null, "volatility_delta_pct": number|null, "narrative": string },',
      '  "confidence": "low"|"medium"|"high",',
      '  "proposal_summary": string',
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
      redesignResultObj = result.object;
    } catch (err) {
      if (!isStructuredOutputError(err)) throw err;
      redesignResultObj = await recoverStructuredOutput(
        redesignAgent,
        redesignPrompt,
        RedesignOutput,
        (r) => r,
        { memory: { thread: MEMORY_THREADS.redesign, resource: MEMORY_RESOURCE_ID } },
      );
    }

    return { ...inputData, redesign: redesignResultObj };
  },
});

// ── Step 6: Risk Agent ────────────────────────────────────────────────

const riskStep = createStep({
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

    const riskPrompt = [
      "CRITICAL: You must output ONLY raw, valid JSON matching the requested schema. Do not use markdown formatting. Do not wrap in ```json ... ```. No conversational text.",
      "",
      "CRITICAL: Output ONLY raw valid JSON matching this exact schema:",
      "{",
      '  "stress_results": [{ "scenario": string, "simulated_drawdown_pct": number, "recovery_days": number|null }, ...],',
      '  "var_95": number,',
      '  "verdict": "approved"|"approved_with_caveats"|"rejected",',
      '  "caveats": [string, ...],',
      '  "risk_summary": string,',
      '  "improvement_summary": string',
      "}",
      "",
      "CRITICAL: You are evaluating the PROPOSED portfolio from the Redesign Agent, NOT the current portfolio.",
      "Stress-test the proposed allocation. Compare its VaR and max drawdown to the current portfolio.",
      "Approve if the proposed portfolio is meaningfully less risky than the current one.",
      "",
      "Proposed actions:",
      `${inputData.redesign.proposed_actions.map((a) => `${a.action} ${a.ticker} to ${a.target_pct}%`).join("; ")}`,
      `Redesign confidence: ${inputData.redesign.confidence}`,
      `Expected improvement: ${inputData.redesign.expected_improvement.narrative}`,
      "",
      "Current portfolio holdings:",
      JSON.stringify(portfolioData, null, 2),
      "",
      "Proposed portfolio holdings (simulated from proposed actions):",
      JSON.stringify({ allocations: inputData.redesign.proposed_actions }, null, 2),
      "",
      "Assess all relevant stress scenarios, estimate VaR, and provide a final risk verdict with specific caveats.",
    ].join("\n");

    const riskAgent = (await import("@/lib/agents/risk")).riskAgent;

    let riskResultObj;
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
      riskResultObj = await recoverStructuredOutput(
        riskAgent,
        riskPrompt,
        RiskOutput,
        (r) => r,
        { memory: { thread: MEMORY_THREADS.risk, resource: MEMORY_RESOURCE_ID } },
      );
    }

    return { ...inputData, risk: riskResultObj };
  },
});

// ── Workflow definition ─────────────────────────────────────────────

export const portfolioFactoryWorkflow = createWorkflow({
  id: "portfolio-factory",
  description:
    "Full agent pipeline: fetch market data → Monitor → conditional escalation (Bottleneck → Redesign → Risk) or status update",
  inputSchema: z.object({}),
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
