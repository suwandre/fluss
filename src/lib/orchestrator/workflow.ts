import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { monitorAgent } from "@/lib/agents/monitor";
import { MonitorOutput } from "@/lib/agents/monitor";
import { BottleneckOutput } from "@/lib/agents/bottleneck";
import { RedesignOutput } from "@/lib/agents/redesign";
import { RiskOutput } from "@/lib/agents/risk";
import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { getBatchPrices } from "@/lib/market";
import { computeCorrelationMatrix } from "@/lib/orchestrator/compute-correlation";

// ── Memory context ──────────────────────────────────────────────────
// Set by the API route before starting a workflow run. Each agent step
// reads this to pass threadId/resourceId to agent.generate() so
// Mastra Memory persists conversation history across runs.

let _memoryContext: { threadId: string; resourceId: string } | null = null;

export function setMemoryContext(threadId: string, resourceId: string) {
  _memoryContext = { threadId, resourceId };
}

export function getMemoryContext() {
  return _memoryContext;
}

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

// ── Step 3: Monitor Agent ───────────────────────────────────────────

const monitorStep = createStep({
  id: "monitor",
  description: "Run Monitor Agent to assess portfolio health",
  inputSchema: SnapshotWithCorrelationSchema,
  outputSchema: MonitorOutput,
  execute: async ({ inputData }) => {
    const prompt = [
      "Analyze this portfolio and assess its health:",
      JSON.stringify(inputData.portfolioData, null, 2),
      `Total portfolio value: $${inputData.totalValue.toFixed(2)}`,
      `Total cost basis: $${inputData.totalCost.toFixed(2)}`,
    ].join("\n");

    const mem = getMemoryContext();
    const result = await monitorAgent.generate(prompt, {
      structuredOutput: { schema: MonitorOutput },
      ...(mem ? { memory: { thread: mem.threadId, resource: mem.resourceId } } : {}),
    });

    return result.object;
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
      "The Monitor Agent has flagged a concern with this portfolio.",
      `Health status: ${monitorResult.health_status}`,
      `Concerns: ${monitorResult.concerns.join("; ") || "none listed"}`,
      "",
      "Portfolio holdings:",
      JSON.stringify(portfolioData, null, 2),
      "",
      `Tickers to analyze: ${tickers.join(", ")}`,
      "",
      "Identify the primary bottleneck asset. Use your tools to compute correlation matrices and volatility contributions.",
    ].join("\n");

    const bottleneckAgent = (
      await import("@/lib/agents/bottleneck")
    ).bottleneckAgent;
    const mem = getMemoryContext();
    const bottleneckResult = await bottleneckAgent.generate(bottleneckPrompt, {
      structuredOutput: { schema: BottleneckOutput },
      ...(mem ? { memory: { thread: mem.threadId, resource: mem.resourceId } } : {}),
    });

    return {
      monitor: monitorResult,
      bottleneck: bottleneckResult.object,
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
      "The Bottleneck Agent has diagnosed a problem.",
      `Primary bottleneck: ${inputData.bottleneck.primary_bottleneck.ticker} — ${inputData.bottleneck.primary_bottleneck.reason}`,
      `Severity: ${inputData.bottleneck.primary_bottleneck.severity}`,
      `Analysis: ${inputData.bottleneck.analysis}`,
      "",
      "Original portfolio holdings:",
      JSON.stringify(portfolioData, null, 2),
      "",
      "Propose concrete rebalancing actions. Use your tools to find alternatives and simulate the rebalance before recommending.",
    ].join("\n");

    const redesignAgent = (await import("@/lib/agents/redesign")).redesignAgent;
    const mem = getMemoryContext();
    const redesignResult = await redesignAgent.generate(redesignPrompt, {
      structuredOutput: { schema: RedesignOutput },
      ...(mem ? { memory: { thread: mem.threadId, resource: mem.resourceId } } : {}),
    });

    return { ...inputData, redesign: redesignResult.object };
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
      "The Redesign Agent has proposed changes. Stress-test them.",
      `Proposed actions: ${inputData.redesign.proposed_actions.map((a) => `${a.action} ${a.ticker} to ${a.target_pct}%`).join("; ")}`,
      `Confidence: ${inputData.redesign.confidence}`,
      `Expected improvement: ${inputData.redesign.expected_improvement.narrative}`,
      "",
      "Current portfolio holdings:",
      JSON.stringify(portfolioData, null, 2),
      "",
      "Run all relevant stress scenarios, compute VaR, and check macro context. Provide a final risk verdict.",
    ].join("\n");

    const riskAgent = (await import("@/lib/agents/risk")).riskAgent;
    const mem = getMemoryContext();
    const riskResult = await riskAgent.generate(riskPrompt, {
      structuredOutput: { schema: RiskOutput },
      ...(mem ? { memory: { thread: mem.threadId, resource: mem.resourceId } } : {}),
    });

    return { ...inputData, risk: riskResult.object };
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
  .then(monitorStep)
  .then(bottleneckStep)
  .then(redesignStep)
  .then(riskStep)
  .commit();
