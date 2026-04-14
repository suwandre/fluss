import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { getBatchPrices, getHistory } from "@/lib/market";
import type { AssetClass } from "@/lib/types/visual";
import { memory } from "@/lib/memory";

export const MonitorOutput = z.object({
  health_status: z.enum(["nominal", "warning", "critical"]),
  portfolio_metrics: z.object({
    total_value: z.number(),
    unrealised_pnl_pct: z.number(),
    sharpe_ratio: z.number().nullable(),
    max_drawdown_pct: z.number(),
    largest_position_pct: z.number(),
  }),
  concerns: z.array(z.string()),
  escalate: z.boolean(),
  summary: z.string(),
  asset_health: z.array(
    z.object({
      ticker: z.string(),
      health: z.enum(["nominal", "warning", "critical"]),
    }),
  ),
});

export type MonitorOutput = z.infer<typeof MonitorOutput>;

const getPortfolioSnapshot = createTool({
  id: "get-portfolio-snapshot",
  description: "Fetch current holdings with live prices from DB",
  inputSchema: z.object({}),
  outputSchema: z.object({
    holdings: z.array(
      z.object({
        ticker: z.string(),
        assetClass: z.string(),
        quantity: z.number(),
        avgCost: z.number(),
        currentPrice: z.number().nullable(),
        marketValue: z.number().nullable(),
        pnlPct: z.number().nullable(),
      }),
    ),
    totalValue: z.number(),
    totalCost: z.number(),
  }),
  execute: async () => {
    const rows = await db.select().from(holdings);
    if (rows.length === 0) {
      return { holdings: [], totalValue: 0, totalCost: 0 };
    }

    const priceMap = await getBatchPrices(
      rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
    );

    let totalValue = 0;
    let totalCost = 0;

    const result = rows.map((row) => {
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

    return { holdings: result, totalValue, totalCost };
  },
});

const getHistoricalPerformance = createTool({
  id: "get-historical-performance",
  description: "Pull price history for a ticker",
  inputSchema: z.object({
    ticker: z.string().describe("Ticker symbol, e.g. AAPL or BTC"),
    days: z.number().describe("Number of days of history").default(30),
  }),
  outputSchema: z.object({
    ticker: z.string(),
    bars: z.array(
      z.object({
        date: z.string(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number().nullable(),
      }),
    ),
  }),
  execute: async (input) => {
    const history = await getHistory(input.ticker, input.ticker.includes("-") ? "crypto" : ("equity" as AssetClass), {
      days: input.days,
    });

    return {
      ticker: input.ticker,
      bars:
        history?.map((bar) => ({
          date: bar.date instanceof Date ? bar.date.toISOString().slice(0, 10) : String(bar.date),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume ?? null,
        })) ?? [],
    };
  },
});

export const monitorAgent = new Agent({
  id: "monitor",
  name: "Monitor Agent",
  instructions: `You are the Monitor Agent in a Portfolio Factory system. Your job is to observe the
current state of a portfolio and assess its health like a factory supervisor walking
the floor. You look for: concentration risk (any single asset > 30% of portfolio),
unusual drawdown (any asset down > 15% from cost basis), correlation clustering
(multiple assets moving identically — hidden single point of failure), and fee drag.

For crypto portfolios, evaluate sector diversification: Layer 1s (ETH, SOL),
Layer 2s (ARB, OP), DeFi (UNI, AAVE), infrastructure (LINK, GRT), and
cash/stablecoins (USDC) are distinct sectors. A portfolio of 10 altcoins with
no BTC or stablecoins has near-zero true diversification.

When prior run context is available, reference it: compare current metrics to
previous observations, note whether issues are recurring or improving, and track
changes in risk thresholds or bottleneck patterns over time.

Be direct and specific. If something looks wrong, name it precisely.`,
  model: [
    { model: "google/gemini-2.5-flash-lite", maxRetries: 2 },
    { model: "groq/llama-3.3-70b-versatile", maxRetries: 2 },
    { model: "openrouter/deepseek/deepseek-chat:free", maxRetries: 1 },
  ],
  tools: { getPortfolioSnapshot, getHistoricalPerformance },
  memory,
});
