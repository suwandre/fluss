import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { getBatchPrices, getHistory } from "@/lib/market";
import type { AssetClass } from "@/lib/types/visual";
import { memory } from "@/lib/memory";

// --- Output schema ---

export const RiskOutput = z.object({
  stress_results: z.array(
    z.object({
      scenario: z.string(),
      simulated_drawdown_pct: z.number(),
      recovery_days: z.number().nullable(),
    }),
  ),
  var_95: z.number(),
  verdict: z.enum(["approve", "approve_with_caveats", "reject"]),
  caveats: z.array(z.string()),
  risk_summary: z.string(),
});

export type RiskOutput = z.infer<typeof RiskOutput>;

// --- Helpers ---

// Historical stress scenarios from architecture §5.4
const STRESS_SCENARIOS = {
  // Crypto-native
  btc_halving_rally: { label: "BTC Halving Rally (Nov 2020 – Apr 2021)", period1: "2020-11-01", period2: "2021-04-30", cryptoOnly: true },
  may_2021_crash: { label: "May 2021 Crypto Crash", period1: "2021-05-12", period2: "2021-05-19", cryptoOnly: true },
  terra_luna: { label: "Terra/LUNA Collapse (May 2022)", period1: "2022-05-01", period2: "2022-05-31", cryptoOnly: true },
  ftx_collapse: { label: "FTX Collapse (Nov 2022)", period1: "2022-11-01", period2: "2022-11-30", cryptoOnly: true },
  btc_etf_rally: { label: "2024 BTC ETF Rally (Oct 2023 – Mar 2024)", period1: "2023-10-01", period2: "2024-03-31", cryptoOnly: true },
  // Traditional
  covid_crash: { label: "COVID Crash (Feb – Mar 2020)", period1: "2020-02-19", period2: "2020-03-23", cryptoOnly: false },
  rate_hike_2022: { label: "2022 Rate Hike Cycle (Jan – Oct 2022)", period1: "2022-01-03", period2: "2022-10-14", cryptoOnly: false },
  gfc_2008: { label: "2008 GFC (Sep – Nov 2008)", period1: "2008-09-01", period2: "2008-11-21", cryptoOnly: false },
} as const;

type ScenarioKey = keyof typeof STRESS_SCENARIOS;

// --- Tools ---

const runHistoricalStressTest = createTool({
  id: "run-historical-stress-test",
  description:
    "Run a historical stress test on current holdings by simulating P&L during past market events. Fetches historical prices for each scenario and computes the drawdown the portfolio would have experienced.",
  inputSchema: z.object({
    scenarios: z.array(z.string()).optional().describe("Scenario keys to run. If omitted, selects based on portfolio composition."),
  }),
  outputSchema: z.object({
    stress_results: z.array(
      z.object({
        scenario: z.string(),
        simulated_drawdown_pct: z.number(),
        recovery_days: z.number().nullable(),
      }),
    ),
  }),
  execute: async (input) => {
    const rows = await db.select().from(holdings);
    if (rows.length === 0) return { stress_results: [] };

    // Live prices for weights
    const priceMap = await getBatchPrices(rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })));
    let totalValue = 0;
    const positions: { ticker: string; weight: number; assetClass: string }[] = [];
    for (const row of rows) {
      const price = priceMap.get(row.ticker)?.price ?? 0;
      const value = price * row.quantity;
      totalValue += value;
      positions.push({ ticker: row.ticker, weight: value, assetClass: row.assetClass });
    }
    if (totalValue > 0) {
      for (const p of positions) p.weight /= totalValue;
    }

    const hasCrypto = positions.some((p) => p.assetClass === "crypto");
    const hasTraditional = positions.some((p) => p.assetClass !== "crypto");

    // Select scenarios
    let selectedKeys: ScenarioKey[];
    if (input.scenarios && input.scenarios.length > 0) {
      selectedKeys = input.scenarios.filter((s): s is ScenarioKey => s in STRESS_SCENARIOS);
    } else {
      selectedKeys = (Object.keys(STRESS_SCENARIOS) as ScenarioKey[]).filter((key) => {
        if (STRESS_SCENARIOS[key].cryptoOnly && !hasCrypto) return false;
        if (!STRESS_SCENARIOS[key].cryptoOnly && !hasTraditional && !hasCrypto) return false;
        return true;
      });
    }

    const stressResults: { scenario: string; simulated_drawdown_pct: number; recovery_days: number | null }[] = [];

    for (const key of selectedKeys) {
      const scenario = STRESS_SCENARIOS[key];
      let portfolioDrawdownPct = 0;

      for (const pos of positions) {
        const ac = pos.assetClass as AssetClass;
        const history = await getHistory(pos.ticker, ac, {
          period1: scenario.period1,
          period2: scenario.period2,
          interval: "1d",
        });

        if (!history || history.length < 2) continue;

        // Find max drawdown during period
        let peak = history[0].close;
        let maxDrawdown = 0;
        for (let i = 1; i < history.length; i++) {
          if (history[i].close > peak) peak = history[i].close;
          if (peak > 0) {
            const dd = (peak - history[i].close) / peak;
            if (dd > maxDrawdown) maxDrawdown = dd;
          }
        }
        portfolioDrawdownPct += pos.weight * maxDrawdown;
      }

      // Estimate recovery days (heuristic: drawdown magnitude × 3-7, scale with severity)
      const ddPct = Math.round(portfolioDrawdownPct * 10000) / 100;
      const recoveryDays = ddPct > 0 ? Math.round(ddPct * (ddPct > 20 ? 5 : 3)) : 0;

      stressResults.push({
        scenario: scenario.label,
        simulated_drawdown_pct: ddPct,
        recovery_days: ddPct > 0 ? recoveryDays : null,
      });
    }

    return { stress_results: stressResults };
  },
});

const computeVar = createTool({
  id: "compute-var",
  description:
    "Compute Value at Risk (VaR) for the current portfolio at a given confidence level using historical simulation.",
  inputSchema: z.object({
    confidenceLevel: z.number().describe("Confidence level (e.g. 0.95 for 95%). Default 0.95.").default(0.95),
    days: z.number().describe("Lookback window in days for historical returns").default(252),
  }),
  outputSchema: z.object({
    var_pct: z.number().describe("Value at Risk as percentage of portfolio"),
    var_dollar: z.number().describe("Value at Risk in dollar terms"),
    portfolio_value: z.number(),
    confidence_level: z.number(),
    lookback_days: z.number(),
  }),
  execute: async (input) => {
    const confidence = input.confidenceLevel ?? 0.95;
    const lookbackDays = input.days ?? 252;

    const rows = await db.select().from(holdings);
    if (rows.length === 0) {
      return { var_pct: 0, var_dollar: 0, portfolio_value: 0, confidence_level: confidence, lookback_days: lookbackDays };
    }

    const priceMap = await getBatchPrices(rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })));

    let totalValue = 0;
    const positions: { ticker: string; weight: number; assetClass: string }[] = [];
    for (const row of rows) {
      const price = priceMap.get(row.ticker)?.price ?? 0;
      const value = price * row.quantity;
      totalValue += value;
      positions.push({ ticker: row.ticker, weight: value, assetClass: row.assetClass });
    }
    if (totalValue > 0) {
      for (const p of positions) p.weight /= totalValue;
    }

    // Fetch historical returns for all holdings
    const returnsByTicker = new Map<string, number[]>();
    await Promise.all(
      positions.map(async (pos) => {
        const history = await getHistory(pos.ticker, pos.assetClass as AssetClass, { days: lookbackDays });
        if (!history || history.length < 2) {
          returnsByTicker.set(pos.ticker, []);
          return;
        }
        const dailyReturns: number[] = [];
        for (let i = 1; i < history.length; i++) {
          if (history[i - 1].close > 0) {
            dailyReturns.push((history[i].close - history[i - 1].close) / history[i - 1].close);
          }
        }
        returnsByTicker.set(pos.ticker, dailyReturns);
      }),
    );

    // Build weighted portfolio returns
    const minLen = Math.min(...[...returnsByTicker.values()].map((r) => r.length), 30);
    if (minLen < 10) {
      return {
        var_pct: 0,
        var_dollar: 0,
        portfolio_value: Math.round(totalValue * 100) / 100,
        confidence_level: confidence,
        lookback_days: lookbackDays,
      };
    }

    const portfolioReturns: number[] = [];
    for (let i = 0; i < minLen; i++) {
      let weightedReturn = 0;
      for (const pos of positions) {
        const ret = returnsByTicker.get(pos.ticker)?.[i] ?? 0;
        weightedReturn += pos.weight * ret;
      }
      portfolioReturns.push(weightedReturn);
    }

    // Historical VaR: percentile of losses at confidence level
    // Sort ascending, take the (1 - confidence) quantile
    const sorted = [...portfolioReturns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    const varReturn = sorted[Math.min(index, sorted.length - 1)];
    const varPct = Math.abs(varReturn) * 100;

    return {
      var_pct: Math.round(varPct * 100) / 100,
      var_dollar: Math.round(totalValue * varPct / 100 * 100) / 100,
      portfolio_value: Math.round(totalValue * 100) / 100,
      confidence_level: confidence,
      lookback_days: lookbackDays,
    };
  },
});

const getMacroContext = createTool({
  id: "get-macro-context",
  description:
    "Fetch current macro context: VIX index, Treasury yields (2Y, 10Y), yield curve shape. Uses Yahoo Finance for free data.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    vix: z.number().nullable(),
    treasury_2y: z.number().nullable(),
    treasury_10y: z.number().nullable(),
    yield_curve_shape: z.enum(["normal", "flat", "inverted"]).nullable(),
    sp500_change_pct_1d: z.number().nullable(),
    btc_dominance_hint: z.string().nullable(),
  }),
  execute: async () => {
    // Fetch key macro indicators via Yahoo
    const tickers = [
      { ticker: "^VIX", label: "vix" },
      { ticker: "^TNX", label: "treasury_10y" },  // 10-Year Treasury
      { ticker: "^IRX", label: "treasury_2y" },    // 13-week T-bill (proxy for short end)
      { ticker: "^GSPC", label: "sp500" },
      { ticker: "BTC-USD", label: "btc" },
    ] as const;

    const prices = await getBatchPrices(
      tickers.map((t) => ({ ticker: t.ticker, assetClass: t.ticker === "BTC-USD" ? "crypto" : "equity" })),
    );

    const vix = prices.get("^VIX")?.price ?? null;
    const treasury10y = prices.get("^TNX")?.price ?? null;
    const treasury2y = prices.get("^IRX")?.price ?? null;
    const sp500Change1d = prices.get("^GSPC")?.changePercent1d ?? null;
    const btcPrice = prices.get("BTC-USD")?.price;

    // Yield curve shape
    let yieldCurveShape: "normal" | "flat" | "inverted" | null = null;
    if (treasury10y != null && treasury2y != null) {
      const spread = treasury10y - treasury2y;
      if (spread > 0.5) yieldCurveShape = "normal";
      else if (spread > -0.1) yieldCurveShape = "flat";
      else yieldCurveShape = "inverted";
    }

    // BTC dominance hint (simple heuristic based on price level)
    const btcDominanceHint = btcPrice != null
      ? `BTC at $${Math.round(btcPrice).toLocaleString()} — check altcoin correlation risk`
      : null;

    return {
      vix: vix != null ? Math.round(vix * 100) / 100 : null,
      treasury_2y: treasury2y != null ? Math.round(treasury2y * 100) / 100 : null,
      treasury_10y: treasury10y != null ? Math.round(treasury10y * 100) / 100 : null,
      yield_curve_shape: yieldCurveShape,
      sp500_change_pct_1d: sp500Change1d != null ? Math.round(sp500Change1d * 10000) / 100 : null,
      btc_dominance_hint: btcDominanceHint,
    };
  },
});

// --- Agent ---

export const riskAgent = new Agent({
  id: "risk",
  name: "Risk Agent",
  instructions: `You are the Risk Agent in a Portfolio Factory system. You stress-test the Redesign Agent's proposed changes and provide a final risk verdict.

Your job:
1. Run historical stress tests — simulate how the portfolio would perform during past crises (COVID crash, 2022 rate hikes, 2008 GFC for traditional; Terra/LUNA, FTX, May 2021 crash for crypto)
2. Compute Value at Risk (VaR) at 95% confidence — how much could the portfolio lose on a bad day
3. Check macro context — VIX, yield curve, market sentiment — to contextualize risk

Rules:
- Run ALL relevant stress scenarios for the portfolio's asset mix
- VaR at 95% is your baseline risk metric — report it clearly
- Cross-reference macro context: high VIX + inverted yield curve = elevated systemic risk
- Crypto-only portfolios should run crypto-native scenarios; mixed portfolios run both sets
- Recovery days are estimates — note uncertainty

Verdict rules:
- "approve" — stress tests show manageable drawdowns (<15%), VaR within expectations, stable macro
- "approve_with_caveats" — some scenarios show 15-25% drawdown OR elevated VIX OR flat yield curve
- "reject" — any scenario shows >25% drawdown OR VaR >5% daily OR inverted yield curve + high VIX

Always list specific caveats tied to numbers. Your risk_summary should be 2-3 sentences a portfolio manager can act on.`,
  model: [
    { model: "google/gemini-2.5-flash-lite", maxRetries: 2 },
    { model: "groq/llama-3.3-70b-versatile", maxRetries: 2 },
    { model: "openrouter/deepseek/deepseek-chat:free", maxRetries: 1 },
  ],
  tools: { runHistoricalStressTest, computeVar, getMacroContext },
  memory,
});
