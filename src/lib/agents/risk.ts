import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { getBatchPrices, getHistory } from "@/lib/market";
import { memory } from "@/lib/memory";
import type { AssetClass } from "@/lib/types/visual";

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
	verdict: z.enum(["approved", "approved_with_caveats", "rejected"]),
	caveats: z.array(z.string()),
	risk_summary: z.string(),
	improvement_summary: z.string(),
	scenario_comparisons: z
		.array(
			z.object({
				scenario: z.string(),
				current_drawdown: z.number(),
				proposed_drawdown: z.number(),
				delta_pp: z.number(),
			}),
		)
		.optional(),
});

export type RiskOutput = z.infer<typeof RiskOutput>;

// --- Helpers ---

// Historical stress scenarios from architecture §5.4
const STRESS_SCENARIOS = {
	// Crypto-native
	btc_halving_rally: {
		label: "BTC Halving Rally (Nov 2020 – Apr 2021)",
		period1: "2020-11-01",
		period2: "2021-04-30",
		cryptoOnly: true,
	},
	may_2021_crash: {
		label: "May 2021 Crypto Crash",
		period1: "2021-05-12",
		period2: "2021-05-19",
		cryptoOnly: true,
	},
	terra_luna: {
		label: "Terra/LUNA Collapse (May 2022)",
		period1: "2022-05-01",
		period2: "2022-05-31",
		cryptoOnly: true,
	},
	ftx_collapse: {
		label: "FTX Collapse (Nov 2022)",
		period1: "2022-11-01",
		period2: "2022-11-30",
		cryptoOnly: true,
	},
	btc_etf_rally: {
		label: "2024 BTC ETF Rally (Oct 2023 – Mar 2024)",
		period1: "2023-10-01",
		period2: "2024-03-31",
		cryptoOnly: true,
	},
	// Traditional
	covid_crash: {
		label: "COVID Crash (Feb – Mar 2020)",
		period1: "2020-02-19",
		period2: "2020-03-23",
		cryptoOnly: false,
	},
	rate_hike_2022: {
		label: "2022 Rate Hike Cycle (Jan – Oct 2022)",
		period1: "2022-01-03",
		period2: "2022-10-14",
		cryptoOnly: false,
	},
	gfc_2008: {
		label: "2008 GFC (Sep – Nov 2008)",
		period1: "2008-09-01",
		period2: "2008-11-21",
		cryptoOnly: false,
	},
} as const;

type ScenarioKey = keyof typeof STRESS_SCENARIOS;

// --- Tools ---

export const runHistoricalStressTest = createTool({
	id: "run-historical-stress-test",
	description:
		"Run a historical stress test on a portfolio by simulating P&L during past market events. Fetches historical prices for each scenario and computes the drawdown the portfolio would have experienced.",
	inputSchema: z.object({
		scenarios: z
			.array(z.string())
			.optional()
			.describe(
				"Scenario keys to run. If omitted, selects based on portfolio composition.",
			),
		positions_override: z
			.array(
				z.object({
					ticker: z.string(),
					weight: z.number(),
					assetClass: z.string(),
					quantity: z.number().optional(),
				}),
			)
			.optional()
			.describe(
				"Optional portfolio positions to test instead of reading from DB. If provided, uses these tickers/weights.",
			),
	}),
	outputSchema: z.object({
		stress_results: z.array(
			z.object({
				scenario: z.string(),
				simulated_drawdown_pct: z.number(),
				recovery_days: z.number().nullable(),
			}),
		),
		error: z.string().optional(),
	}),
	execute: async (input) => {
		try {
			let positions: { ticker: string; weight: number; assetClass: string }[] = [];

		if (input.positions_override && input.positions_override.length > 0) {
			const totalWeight = input.positions_override.reduce(
				(sum, p) => sum + p.weight,
				0,
			);
			positions = input.positions_override.map((p) => ({
				ticker: p.ticker,
				weight: totalWeight > 0 ? p.weight / totalWeight : 0,
				assetClass: p.assetClass,
			}));
		} else {
			const rows = await db.select().from(holdings);
			if (rows.length === 0) return { stress_results: [] };

			const priceMap = await getBatchPrices(
				rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
			);
			let totalValue = 0;
			const pos: typeof positions = [];
			for (const row of rows) {
				const price = priceMap.get(row.ticker)?.price ?? 0;
				const value = price * row.quantity;
				totalValue += value;
				pos.push({
					ticker: row.ticker,
					weight: value,
					assetClass: row.assetClass,
				});
			}
			if (totalValue > 0) {
				for (const p of pos) p.weight /= totalValue;
			}
			positions = pos;
		}

		if (positions.length === 0) return { stress_results: [] };

		const hasCrypto = positions.some((p) => p.assetClass === "crypto");
		const hasTraditional = positions.some((p) => p.assetClass !== "crypto");

		// Select scenarios
		let selectedKeys: ScenarioKey[];
		if (input.scenarios && input.scenarios.length > 0) {
			selectedKeys = input.scenarios.filter(
				(s): s is ScenarioKey => s in STRESS_SCENARIOS,
			);
		} else {
			selectedKeys = (Object.keys(STRESS_SCENARIOS) as ScenarioKey[]).filter(
				(key) => {
					if (STRESS_SCENARIOS[key].cryptoOnly && !hasCrypto) return false;
					if (
						!STRESS_SCENARIOS[key].cryptoOnly &&
						!hasTraditional &&
						!hasCrypto
					)
						return false;
					return true;
				},
			);
		}

		const stressResults: {
			scenario: string;
			simulated_drawdown_pct: number;
			recovery_days: number | null;
		}[] = [];

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

				if (!history || history.length < 2) {
					return {
						stress_results: stressResults,
						error: `Insufficient historical data for ${pos.ticker} during scenario ${scenario.label}. Asset likely did not exist.`,
					};
				}

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
			const recoveryDays =
				ddPct > 0 ? Math.round(ddPct * (ddPct > 20 ? 5 : 3)) : 0;

			stressResults.push({
				scenario: scenario.label,
				simulated_drawdown_pct: ddPct,
				recovery_days: ddPct > 0 ? recoveryDays : null,
			});
		}

		return { stress_results: stressResults };
		} catch (error: any) {
			return { stress_results: [], error: `Unexpected error during stress test: ${error.message}` };
		}
	},
});

export const computeVar = createTool({
	id: "compute-var",
	description:
		"Compute Value at Risk (VaR) for a portfolio at a given confidence level using historical simulation.",
	inputSchema: z.object({
		confidenceLevel: z
			.number()
			.describe("Confidence level (e.g. 0.95 for 95%). Default 0.95.")
			.default(0.95),
		days: z
			.number()
			.describe("Lookback window in days for historical returns")
			.default(252),
		positions_override: z
			.array(
				z.object({
					ticker: z.string(),
					weight: z.number(),
					assetClass: z.string(),
					quantity: z.number().optional(),
				}),
			)
			.optional()
			.describe(
				"Optional portfolio positions to use instead of reading from DB.",
			),
	}),
	outputSchema: z.object({
		var_pct: z.number().describe("Value at Risk as percentage of portfolio"),
		var_dollar: z.number().describe("Value at Risk in dollar terms"),
		portfolio_value: z.number(),
		confidence_level: z.number(),
		lookback_days: z.number(),
		concentration_score: z.number(),
		error: z.string().optional(),
	}),
	execute: async (input) => {
		try {
		const confidence = input.confidenceLevel ?? 0.95;
		const lookbackDays = input.days ?? 252;

		let positions: { ticker: string; weight: number; assetClass: string }[] = [];
		let totalValue = 0;

		if (input.positions_override && input.positions_override.length > 0) {
			const totalWeight = input.positions_override.reduce(
				(sum, p) => sum + p.weight,
				0,
			);
			positions = input.positions_override.map((p) => ({
				ticker: p.ticker,
				weight: totalWeight > 0 ? p.weight / totalWeight : 0,
				assetClass: p.assetClass,
			}));
			// Estimate portfolio value for dollar VaR — use quantity if available, else approximate
			for (const p of input.positions_override) {
				totalValue += p.weight * 1000; // rough proxy; dollar VaR is secondary to pct
			}
		} else {
			const rows = await db.select().from(holdings);
			if (rows.length === 0) {
				return {
					var_pct: 0,
					var_dollar: 0,
					portfolio_value: 0,
					confidence_level: confidence,
					lookback_days: lookbackDays,
					concentration_score: 0,
				};
			}

			const priceMap = await getBatchPrices(
				rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
			);
			const pos: typeof positions = [];
			for (const row of rows) {
				const price = priceMap.get(row.ticker)?.price ?? 0;
				const value = price * row.quantity;
				totalValue += value;
				pos.push({
					ticker: row.ticker,
					weight: value,
					assetClass: row.assetClass,
				});
			}
			if (totalValue > 0) {
				for (const p of pos) p.weight /= totalValue;
			}
			positions = pos;
		}

		// Fetch historical returns for all holdings
		const concentration_score = positions.reduce((sum, p) => sum + p.weight * p.weight, 0);
		const returnsByTicker = new Map<string, number[]>();
		let errorMessage: string | undefined;

		await Promise.all(
			positions.map(async (pos) => {
				if (errorMessage) return;
				const history = await getHistory(
					pos.ticker,
					pos.assetClass as AssetClass,
					{ days: lookbackDays },
				);
				if (!history || history.length < 2) {
					errorMessage = `Insufficient historical data for ${pos.ticker} to compute VaR. Asset likely did not exist.`;
					return;
				}
				const dailyReturns: number[] = [];
				for (let i = 1; i < history.length; i++) {
					if (history[i - 1].close > 0) {
						dailyReturns.push(
							(history[i].close - history[i - 1].close) / history[i - 1].close,
						);
					}
				}
				returnsByTicker.set(pos.ticker, dailyReturns);
			}),
		);

		if (errorMessage) {
			return {
				var_pct: 0,
				var_dollar: 0,
				portfolio_value: Math.round(totalValue * 100) / 100,
				confidence_level: confidence,
				lookback_days: lookbackDays,
				concentration_score,
				error: errorMessage,
			};
		}

		// Build weighted portfolio returns
		const minLen = Math.min(
			...[...returnsByTicker.values()].map((r) => r.length),
			30,
		);
		if (minLen < 10) {
			return {
				var_pct: 0,
				var_dollar: 0,
				portfolio_value: Math.round(totalValue * 100) / 100,
				confidence_level: confidence,
				lookback_days: lookbackDays,
				concentration_score,
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
			var_dollar: Math.round(((totalValue * varPct) / 100) * 100) / 100,
			portfolio_value: Math.round(totalValue * 100) / 100,
			confidence_level: confidence,
			lookback_days: lookbackDays,
			concentration_score,
		};
		} catch (error: any) {
			return {
				var_pct: 0,
				var_dollar: 0,
				portfolio_value: 0,
				confidence_level: input.confidenceLevel ?? 0.95,
				lookback_days: input.days ?? 252,
				concentration_score: 0,
				error: `Unexpected error during VaR computation: ${error.message}`,
			};
		}
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
			{ ticker: "^TNX", label: "treasury_10y" }, // 10-Year Treasury
			{ ticker: "^IRX", label: "treasury_2y" }, // 13-week T-bill (proxy for short end)
			{ ticker: "^GSPC", label: "sp500" },
			{ ticker: "BTC-USD", label: "btc" },
		] as const;

		const prices = await getBatchPrices(
			tickers.map((t) => ({
				ticker: t.ticker,
				assetClass: t.ticker === "BTC-USD" ? "crypto" : "equity",
			})),
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
		const btcDominanceHint =
			btcPrice != null
				? `BTC at $${Math.round(btcPrice).toLocaleString()} — check altcoin correlation risk`
				: null;

		return {
			vix: vix != null ? Math.round(vix * 100) / 100 : null,
			treasury_2y:
				treasury2y != null ? Math.round(treasury2y * 100) / 100 : null,
			treasury_10y:
				treasury10y != null ? Math.round(treasury10y * 100) / 100 : null,
			yield_curve_shape: yieldCurveShape,
			sp500_change_pct_1d:
				sp500Change1d != null ? Math.round(sp500Change1d * 10000) / 100 : null,
			btc_dominance_hint: btcDominanceHint,
		};
	},
});

// --- Agent ---

export const riskAgent = new Agent({
	id: "risk",
	name: "Risk Agent",
	instructions: `You are the Risk Agent in a Portfolio Factory system. You receive PRE-COMPUTED stress test results and VaR numbers for BOTH the current portfolio and the proposed portfolio. Your ONLY job is to compare them and issue a comparative verdict.

You do NOT run calculations. You do NOT fetch prices. Use the pre-computed numbers in the prompt directly.

Verdict rules (comparative, NOT absolute thresholds):
- "approved" — proposed is meaningfully better than current (drawdown improved, VaR lower, or 2+ metrics better)
- "approved_with_caveats" — proposed is slightly better or mixed (not worse overall), OR significantly improves diversification (reduces single-asset concentration risk), even if VaR/drawdown numbers are similar or slightly worse.
- "rejected" — proposed is WORSE than current in key metrics, OR introduces new catastrophic risk not present in current

If the proposed portfolio's concentration_score is lower than the current portfolio's (better diversification), and VaR does not increase by more than 20% relative to the current VaR, you MUST output approved_with_caveats. ONLY reject if VaR increases by >20% with no concentration improvement, or if it introduces new catastrophic risks.

CRITICAL: Value diversification. Lean towards "approved_with_caveats" if a proposed portfolio significantly reduces single-asset concentration risk (e.g., moving from 90% BTC to a balanced portfolio), even if the historical VaR or drawdown numbers don't show a massive mathematical improvement.

CRITICAL: For crypto portfolios, absolute drawdowns up to 70% in crypto-native crashes are acceptable IF the current portfolio showed even worse. The delta matters, not perfection.

CRITICAL: improvement_summary MUST explicitly compare current vs proposed with exact numbers (e.g. "Current max DD -29% → Proposed -15%, an improvement of 14pp"). Do not skip this.

When prior run context is available, compare current stress test results and VaR to previous assessments. Note if risk has increased or decreased, and whether past caveats have materialized or resolved.

Always list specific caveats tied to numbers. Your risk_summary should be 2-3 sentences a portfolio manager can act on.`,
	model: [
		{ model: "ollama-cloud/kimi-k2.6:cloud", maxRetries: 2 },
		{ model: "ollama-cloud/glm-5.1:cloud", maxRetries: 2 },
	],
	tools: { runHistoricalStressTest, computeVar, getMacroContext },
	memory,
});
