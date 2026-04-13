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

const WorkflowOutputSchema = z.object({
  monitor: MonitorOutput,
  bottleneck: BottleneckOutput.nullable(),
  redesign: RedesignOutput.nullable(),
  risk: RiskOutput.nullable(),
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

// ── Step 2: Monitor Agent ───────────────────────────────────────────

const monitorStep = createStep({
  id: "monitor",
  description: "Run Monitor Agent to assess portfolio health",
  inputSchema: MarketSnapshotSchema,
  outputSchema: MonitorOutput,
  execute: async ({ inputData }) => {
    const prompt = [
      "Analyze this portfolio and assess its health:",
      JSON.stringify(inputData.portfolioData, null, 2),
      `Total portfolio value: $${inputData.totalValue.toFixed(2)}`,
      `Total cost basis: $${inputData.totalCost.toFixed(2)}`,
    ].join("\n");

    const result = await monitorAgent.generate(prompt, {
      structuredOutput: { schema: MonitorOutput },
    });

    return result.object;
  },
});

// ── Step 3a: Escalation path (bottleneck → redesign → risk) ─────────

const escalationStep = createStep({
  id: "escalation-path",
  description:
    "Run Bottleneck → Redesign → Risk agents sequentially when Monitor escalates",
  inputSchema: MonitorOutput,
  outputSchema: WorkflowOutputSchema,
  execute: async ({ inputData: monitorResult, getStepResult }) => {
    const marketSnapshot = getStepResult(fetchMarketSnapshot) as z.infer<
      typeof MarketSnapshotSchema
    >;
    const { tickers, portfolioData } = marketSnapshot;

    // ── Bottleneck Agent ──
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
    const bottleneckResult = await bottleneckAgent.generate(bottleneckPrompt, {
      structuredOutput: { schema: BottleneckOutput },
    });
    const bottleneckOutput = bottleneckResult.object;

    // ── Redesign Agent ──
    const redesignPrompt = [
      "The Bottleneck Agent has diagnosed a problem.",
      `Primary bottleneck: ${bottleneckOutput.primary_bottleneck.ticker} — ${bottleneckOutput.primary_bottleneck.reason}`,
      `Severity: ${bottleneckOutput.primary_bottleneck.severity}`,
      `Analysis: ${bottleneckOutput.analysis}`,
      "",
      "Original portfolio holdings:",
      JSON.stringify(portfolioData, null, 2),
      "",
      "Propose concrete rebalancing actions. Use your tools to find alternatives and simulate the rebalance before recommending.",
    ].join("\n");

    const redesignAgent = (await import("@/lib/agents/redesign")).redesignAgent;
    const redesignResult = await redesignAgent.generate(redesignPrompt, {
      structuredOutput: { schema: RedesignOutput },
    });
    const redesignOutput = redesignResult.object;

    // ── Risk Agent ──
    const riskPrompt = [
      "The Redesign Agent has proposed changes. Stress-test them.",
      `Proposed actions: ${redesignOutput.proposed_actions.map((a) => `${a.action} ${a.ticker} to ${a.target_pct}%`).join("; ")}`,
      `Confidence: ${redesignOutput.confidence}`,
      `Expected improvement: ${redesignOutput.expected_improvement.narrative}`,
      "",
      "Current portfolio holdings:",
      JSON.stringify(portfolioData, null, 2),
      "",
      "Run all relevant stress scenarios, compute VaR, and check macro context. Provide a final risk verdict.",
    ].join("\n");

    const riskAgent = (await import("@/lib/agents/risk")).riskAgent;
    const riskResult = await riskAgent.generate(riskPrompt, {
      structuredOutput: { schema: RiskOutput },
    });
    const riskOutput = riskResult.object;

    return {
      monitor: monitorResult,
      bottleneck: bottleneckOutput,
      redesign: redesignOutput,
      risk: riskOutput,
    };
  },
});

// ── Step 3b: Status update (nominal path) ───────────────────────────

const statusUpdateStep = createStep({
  id: "status-update",
  description: "Brief status update when Monitor reports nominal health",
  inputSchema: MonitorOutput,
  outputSchema: WorkflowOutputSchema,
  execute: async ({ inputData: monitorResult }) => ({
    monitor: monitorResult,
    bottleneck: null,
    redesign: null,
    risk: null,
  }),
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
  .then(monitorStep)
  .branch([
    [
      // Warning / critical path — run full escalation
      async ({ inputData }) => inputData.health_status !== "nominal",
      escalationStep,
    ],
    [
      // Nominal path — brief status update only
      async () => true,
      statusUpdateStep,
    ],
  ])
  .commit();
