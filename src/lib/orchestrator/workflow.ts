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
} from "@/lib/agents/risk";
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
import { syncTickerMetadataForHoldings } from "@/lib/market/ticker-metadata";
import { assetClassForTicker } from "@/lib/agents/redesign";

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
  riskAppetite: z.enum(["aggressive", "conservative"]).default("aggressive"),
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
  preferences: PreferencesSchema.default({ sectorConstraint: "same_sector", riskAppetite: "aggressive", maxTurnoverPct: 30, excludedTickers: [] }),
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
      "User preferences:",
      `- Sector constraint: ${preferences.sectorConstraint === "same_sector" ? "Stay within current sectors only" : "Allow cross-sector diversification (ETFs, bonds, FX, equities)"}`,
      `- Risk appetite: ${preferences.riskAppetite === "aggressive" ? "Aggressive — higher potential reward" : "Conservative — stable returns, capital preservation"}`,
      `- Max turnover: ${preferences.maxTurnoverPct}%`,
      preferences.excludedTickers.length > 0 ? `- Excluded tickers: ${preferences.excludedTickers.join(", ")}` : "",
      "",
      "Allowed asset classes for alternatives:",
      JSON.stringify(allowedAssetClasses),
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

    // ── Pre-compute stress + VaR for BOTH portfolios ──────────────────────
    const [currentStress, proposedStress, currentVaR, proposedVaR] = await Promise.all([
      (runHistoricalStressTest as any).execute({ positions_override: currentPositions }),
      proposedPositions.length > 0
        ? (runHistoricalStressTest as any).execute({ positions_override: proposedPositions })
        : Promise.resolve({ stress_results: [] }),
      (computeVar as any).execute({ positions_override: currentPositions }),
      proposedPositions.length > 0
        ? (computeVar as any).execute({ positions_override: proposedPositions })
        : Promise.resolve({ var_pct: 0, var_dollar: 0, portfolio_value: 0, confidence_level: 0.95, lookback_days: 252 }),
    ]);

    const scenarioComparisons = currentStress.stress_results.map((curr: any) => {
      const prop = proposedStress.stress_results.find((p: any) => p.scenario === curr.scenario);
      return {
        scenario: curr.scenario,
        current_drawdown: curr.simulated_drawdown_pct,
        proposed_drawdown: prop ? prop.simulated_drawdown_pct : curr.simulated_drawdown_pct,
        delta_pp: prop ? parseFloat((prop.simulated_drawdown_pct - curr.simulated_drawdown_pct).toFixed(2)) : 0,
      };
    });

    // Compute aggregate drawdown metrics and weighted risk score
    const currentDrawdowns = currentStress.stress_results.map((r: any) => r.simulated_drawdown_pct);
    const proposedDrawdowns = proposedStress.stress_results.map((r: any) => r.simulated_drawdown_pct);
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
      `Current portfolio VaR 95%: ${currentVaR.var_pct}%`,
      `Current portfolio average drawdown across all stress scenarios: ${currentAvgDrawdown.toFixed(2)}%`,
      `Current portfolio max drawdown across all stress scenarios: ${currentMaxDrawdown.toFixed(2)}%`,
      `Current portfolio concentration score: ${currentVaR.concentration_score.toFixed(4)}`,
      "",
      "Proposed portfolio pre-computed stress results:",
      JSON.stringify(proposedStress.stress_results, null, 2),
      `Proposed portfolio VaR 95%: ${proposedVaR.var_pct}%`,
      `Proposed portfolio average drawdown across all stress scenarios: ${proposedAvgDrawdown.toFixed(2)}%`,
      `Proposed portfolio max drawdown across all stress scenarios: ${proposedMaxDrawdown.toFixed(2)}%`,
      `Proposed portfolio concentration score: ${proposedVaR.concentration_score.toFixed(4)}`,
      "",
      "Proposed actions:",
      `${actions?.map((a) => `${a.action} ${a.ticker} to ${a.target_pct}%`).join("; ") ?? "none"}`,
      `Redesign confidence: ${inputData.redesign.confidence}`,
      `Expected improvement: ${inputData.redesign.expected_improvement.narrative}`,
      "",
      "Scenario-by-scenario comparison (DO NOT repeat in improvement_summary):",
      JSON.stringify(scenarioComparisons, null, 2),
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

    if (!riskResultObj) {
      riskResultObj = {
        stress_results: proposedStress?.stress_results || [],
        var_95: proposedVaR?.var_pct || 0,
        verdict: "rejected",
        caveats: ["LLM risk analysis failed to generate. Portfolio rejected by default."],
        risk_summary: "System fallback: Rejected due to internal LLM failure.",
        improvement_summary: "N/A - Auto-rejected.",
      } as any;
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

    return { ...inputData, risk: riskResultObj };
  },
});

// ── Workflow definition ─────────────────────────────────────────────

export const portfolioFactoryWorkflow = createWorkflow({
  id: "portfolio-factory",
  description:
    "Full agent pipeline: fetch market data → Monitor → conditional escalation (Bottleneck → Redesign → Risk) or status update",
  inputSchema: z.object({
    sectorConstraint: z.enum(["same_sector", "diversify"]).default("same_sector"),
    riskAppetite: z.enum(["aggressive", "conservative"]).default("aggressive"),
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
