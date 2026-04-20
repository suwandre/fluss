import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { agentRuns, holdings } from "@/lib/db/schema";
import { getBatchPrices, getHistory } from "@/lib/market";
import { memory } from "@/lib/memory";
import type { AssetClass } from "@/lib/types/visual";

// --- Output schema ---

export const RedesignOutput = z.object({
	proposed_actions: z.array(
		z.object({
			action: z.enum(["reduce", "increase", "replace", "add", "remove"]),
			ticker: z.string(),
			target_pct: z.number(),
			rationale: z.string(),
		}),
	),
	expected_improvement: z.object({
		sharpe_delta: z.number().nullable(),
		volatility_delta_pct: z.number().nullable(),
		narrative: z.string(),
	}),
	confidence: z.enum(["low", "medium", "high"]),
	proposal_summary: z.string(),
});

export type RedesignOutput = z.infer<typeof RedesignOutput>;

// --- Helpers ---

function assetClassForTicker(ticker: string): AssetClass {
	if (ticker.includes("-")) return "crypto";
	return "equity";
}

// Curated asset universe per class for alternative suggestions
const ALTERNATIVE_UNIVERSE: Record<
	string,
	{ ticker: string; name: string; assetClass: string }[]
> = {
	equity: [
		{
			ticker: "VTI",
			name: "Vanguard Total Stock Market ETF",
			assetClass: "etf",
		},
		{
			ticker: "VXUS",
			name: "Vanguard Total International Stock ETF",
			assetClass: "etf",
		},
		{ ticker: "VOO", name: "Vanguard S&P 500 ETF", assetClass: "etf" },
		{ ticker: "QQQ", name: "Invesco QQQ Trust", assetClass: "etf" },
		{
			ticker: "SCHD",
			name: "Schwab US Dividend Equity ETF",
			assetClass: "etf",
		},
		{ ticker: "IWM", name: "iShares Russell 2000 ETF", assetClass: "etf" },
		{ ticker: "XLK", name: "Technology Select Sector SPDR", assetClass: "etf" },
		{ ticker: "XLF", name: "Financial Select Sector SPDR", assetClass: "etf" },
		{ ticker: "VNQ", name: "Vanguard Real Estate ETF", assetClass: "etf" },
	],
	crypto: [
		{ ticker: "BTC-USD", name: "Bitcoin", assetClass: "crypto" },
		{ ticker: "ETH-USD", name: "Ethereum", assetClass: "crypto" },
		{ ticker: "SOL-USD", name: "Solana", assetClass: "crypto" },
		{ ticker: "LINK-USD", name: "Chainlink", assetClass: "crypto" },
		{ ticker: "UNI-USD", name: "Uniswap", assetClass: "crypto" },
		{ ticker: "AAVE-USD", name: "Aave", assetClass: "crypto" },
		{ ticker: "ARB-USD", name: "Arbitrum", assetClass: "crypto" },
		{ ticker: "MATIC-USD", name: "Polygon", assetClass: "crypto" },
		{ ticker: "USDC-USD", name: "USD Coin (stablecoin)", assetClass: "crypto" },
	],
	bond: [
		{
			ticker: "BND",
			name: "Vanguard Total Bond Market ETF",
			assetClass: "etf",
		},
		{
			ticker: "TLT",
			name: "iShares 20+ Year Treasury Bond ETF",
			assetClass: "etf",
		},
		{
			ticker: "SHY",
			name: "iShares 1-3 Year Treasury Bond ETF",
			assetClass: "etf",
		},
		{
			ticker: "LQD",
			name: "iShares Investment Grade Corporate Bond ETF",
			assetClass: "etf",
		},
		{ ticker: "TIP", name: "iShares TIPS Bond ETF", assetClass: "etf" },
	],
	etf: [
		{
			ticker: "VTI",
			name: "Vanguard Total Stock Market ETF",
			assetClass: "etf",
		},
		{
			ticker: "VXUS",
			name: "Vanguard Total International Stock ETF",
			assetClass: "etf",
		},
		{
			ticker: "BND",
			name: "Vanguard Total Bond Market ETF",
			assetClass: "etf",
		},
		{
			ticker: "SCHD",
			name: "Schwab US Dividend Equity ETF",
			assetClass: "etf",
		},
		{ ticker: "QQQ", name: "Invesco QQQ Trust", assetClass: "etf" },
		{ ticker: "IWM", name: "iShares Russell 2000 ETF", assetClass: "etf" },
	],
};

// --- Tools ---

const getAlternativeAssets = createTool({
	id: "get-alternative-assets",
	description:
		"Suggest alternative or complementary assets for a given asset class. Returns a curated list with live prices to help evaluate diversification options.",
	inputSchema: z.object({
		assetClass: z
			.string()
			.describe(
				"Asset class to find alternatives for: equity, crypto, bond, etf",
			),
		excludeTickers: z
			.array(z.string())
			.optional()
			.describe("Tickers already in portfolio to exclude"),
		maxResults: z
			.number()
			.optional()
			.describe("Maximum number of alternatives to return")
			.default(5),
	}),
	outputSchema: z.object({
		alternatives: z.array(
			z.object({
				ticker: z.string(),
				name: z.string(),
				assetClass: z.string(),
				currentPrice: z.number().nullable(),
				changePct24h: z.number().nullable(),
			}),
		),
	}),
	execute: async (input) => {
		const exclude = new Set(input.excludeTickers ?? []);
		const max = input.maxResults ?? 5;
		const candidates =
			ALTERNATIVE_UNIVERSE[input.assetClass] ?? ALTERNATIVE_UNIVERSE["equity"];
		const filtered = candidates
			.filter((c) => !exclude.has(c.ticker))
			.slice(0, max);

		if (filtered.length === 0) return { alternatives: [] };

		// Fetch live prices for candidates
		const priceMap = await getBatchPrices(
			filtered.map((c) => ({ ticker: c.ticker, assetClass: c.assetClass })),
		);

		const alternatives = filtered.map((c) => {
			const snap = priceMap.get(c.ticker);
			return {
				ticker: c.ticker,
				name: c.name,
				assetClass: c.assetClass,
				currentPrice: snap?.price ?? null,
				changePct24h: snap?.changePercent1d ?? null,
			};
		});

		return { alternatives };
	},
});

const simulateRebalance = createTool({
	id: "simulate-rebalance",
	description:
		"Run a what-if simulation of a proposed rebalance. Computes projected portfolio value, P&L impact, and volatility estimate based on historical data. Does NOT execute any trades.",
	inputSchema: z.object({
		proposedChanges: z
			.array(
				z.object({
					action: z.enum(["reduce", "increase", "replace", "add", "remove"]),
					ticker: z.string(),
					targetWeightPct: z
						.number()
						.describe("Target portfolio weight as percentage (0-100)"),
				}),
			)
			.describe("List of proposed changes to simulate"),
		benchmarkDays: z
			.number()
			.optional()
			.describe("Days of historical data for simulation")
			.default(90),
	}),
	outputSchema: z.object({
		current: z.object({
			totalValue: z.number(),
			allocations: z.array(
				z.object({
					ticker: z.string(),
					weightPct: z.number(),
					value: z.number(),
				}),
			),
		}),
		proposed: z.object({
			totalValue: z.number(),
			allocations: z.array(
				z.object({
					ticker: z.string(),
					weightPct: z.number(),
					value: z.number(),
				}),
			),
		}),
		projectedPnlPct: z
			.number()
			.describe("Projected change in portfolio value over benchmark period"),
		projectedVolatilityPct: z
			.number()
			.describe("Estimated annualized volatility of proposed portfolio"),
		notes: z.array(z.string()),
	}),
	execute: async (input) => {
		const benchDays = input.benchmarkDays ?? 90;

		// Fetch current holdings + prices
		const rows = await db.select().from(holdings);
		const priceMap =
			rows.length > 0
				? await getBatchPrices(
						rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
					)
				: new Map();

		// Build current portfolio snapshot
		let currentTotalValue = 0;
		const currentPositions: {
			ticker: string;
			value: number;
			assetClass: string;
		}[] = [];
		for (const row of rows) {
			const price = priceMap.get(row.ticker)?.price ?? 0;
			const value = price * row.quantity;
			currentTotalValue += value;
			currentPositions.push({
				ticker: row.ticker,
				value,
				assetClass: row.assetClass,
			});
		}

		const currentAllocations = currentPositions.map((p) => ({
			ticker: p.ticker,
			weightPct:
				currentTotalValue > 0
					? Math.round((p.value / currentTotalValue) * 10000) / 100
					: 0,
			value: Math.round(p.value * 100) / 100,
		}));

		// Build proposed portfolio by applying changes
		// Start from current weights, apply targetWeightPct for each change
		const proposedWeights = new Map<string, number>();
		for (const pos of currentPositions) {
			const currentWeight =
				currentTotalValue > 0 ? (pos.value / currentTotalValue) * 100 : 0;
			proposedWeights.set(pos.ticker, currentWeight);
		}

		const proposedAssetClasses = new Map<string, string>();
		for (const pos of currentPositions) {
			proposedAssetClasses.set(pos.ticker, pos.assetClass);
		}

		for (const change of input.proposedChanges) {
			proposedAssetClasses.set(
				change.ticker,
				assetClassForTicker(change.ticker),
			);
			switch (change.action) {
				case "remove":
					proposedWeights.delete(change.ticker);
					break;
				case "add":
					proposedWeights.set(change.ticker, change.targetWeightPct);
					break;
				case "reduce":
				case "increase":
				case "replace":
					proposedWeights.set(change.ticker, change.targetWeightPct);
					break;
			}
		}

		// Normalize weights to 100%
		const totalWeight = [...proposedWeights.values()].reduce(
			(s, w) => s + w,
			0,
		);
		const normalizedWeights = new Map<string, number>();
		for (const [ticker, weight] of proposedWeights) {
			normalizedWeights.set(
				ticker,
				totalWeight > 0 ? Math.round((weight / totalWeight) * 10000) / 100 : 0,
			);
		}

		const proposedAllocations = [...normalizedWeights.entries()].map(
			([ticker, weightPct]) => ({
				ticker,
				weightPct,
				value: Math.round(((currentTotalValue * weightPct) / 100) * 100) / 100,
			}),
		);

		// Fetch historical data for proposed portfolio to estimate volatility + projected P&L
		const proposedTickers = [...normalizedWeights.keys()];
		const returnsByTicker = new Map<string, number[]>();

		if (proposedTickers.length > 0) {
			await Promise.all(
				proposedTickers.map(async (ticker) => {
					const ac =
						proposedAssetClasses.get(ticker) ?? assetClassForTicker(ticker);
					const history = await getHistory(ticker, ac as AssetClass, {
						days: benchDays,
					});
					const closes: number[] = [];
					history?.forEach((bar) => closes.push(bar.close));
					const dailyReturns: number[] = [];
					for (let i = 1; i < closes.length; i++) {
						if (closes[i - 1] > 0)
							dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
					}
					returnsByTicker.set(ticker, dailyReturns);
				}),
			);
		}

		// Build weighted portfolio returns for proposed allocation
		const minLen = Math.min(
			...[...returnsByTicker.values()].map((r) => r.length),
			30,
		);
		const portfolioReturns: number[] = [];
		for (let i = 0; i < minLen; i++) {
			let weightedReturn = 0;
			for (const [ticker, weightPct] of normalizedWeights) {
				const ret = returnsByTicker.get(ticker)?.[i] ?? 0;
				weightedReturn += (weightPct / 100) * ret;
			}
			portfolioReturns.push(weightedReturn);
		}

		// Annualized volatility estimate: daily vol * sqrt(252)
		const mean =
			portfolioReturns.length > 1
				? portfolioReturns.reduce((s, r) => s + r, 0) / portfolioReturns.length
				: 0;
		const variance =
			portfolioReturns.length > 1
				? portfolioReturns.reduce((s, r) => s + (r - mean) ** 2, 0) /
					(portfolioReturns.length - 1)
				: 0;
		const dailyVol = Math.sqrt(variance);
		const annualizedVol = dailyVol * Math.sqrt(252) * 100;

		// Projected P&L over benchmark period (cumulative weighted return)
		const cumulativeReturn =
			portfolioReturns.length > 0
				? portfolioReturns.reduce((s, r) => s + r, 0)
				: 0;
		const projectedPnlPct = Math.round(cumulativeReturn * 10000) / 100;

		const notes: string[] = [];
		if (totalWeight > 0 && Math.abs(totalWeight - 100) > 1) {
			notes.push(
				`Weights were normalized from ${Math.round(totalWeight)}% to 100%.`,
			);
		}
		if (minLen < 30) {
			notes.push(
				`Limited historical data (${minLen} days). Estimates may be unreliable.`,
			);
		}

		return {
			current: {
				totalValue: Math.round(currentTotalValue * 100) / 100,
				allocations: currentAllocations,
			},
			proposed: {
				totalValue: Math.round(currentTotalValue * 100) / 100,
				allocations: proposedAllocations,
			},
			projectedPnlPct,
			projectedVolatilityPct: Math.round(annualizedVol * 100) / 100,
			notes,
		};
	},
});

const getRebalanceHistory = createTool({
	id: "get-rebalance-history",
	description:
		"Fetch past redesign agent proposals from the database. Use this to avoid repeating previous recommendations and track how the portfolio has evolved.",
	inputSchema: z.object({
		limit: z
			.number()
			.optional()
			.describe("Max number of past proposals to return")
			.default(5),
	}),
	outputSchema: z.object({
		history: z.array(
			z.object({
				runId: z.string(),
				output: z.any(),
				createdAt: z.string(),
			}),
		),
		totalFound: z.number(),
	}),
	execute: async (input) => {
		const limit = input.limit ?? 5;

		const rows = await db
			.select()
			.from(agentRuns)
			.where(eq(agentRuns.agentName, "redesign"))
			.orderBy(desc(agentRuns.createdAt))
			.limit(limit);

		const history = rows.map((row) => ({
			runId: row.runId,
			output: row.output,
			createdAt: row.createdAt.toISOString(),
		}));

		return { history, totalFound: history.length };
	},
});

// --- Agent ---

export const redesignAgent = new Agent({
	id: "redesign",
	name: "Redesign Agent",
	instructions: `You are the Redesign Agent in a Portfolio Factory system. You receive the Bottleneck Agent's diagnosis and propose concrete rebalancing actions.

Your job:
1. Understand the bottleneck diagnosis — which asset is dragging, why, and how severe
2. Find alternative or complementary assets that would diversify the risk
3. Simulate the proposed rebalance to validate the improvement
4. Check rebalance history to avoid repeating past proposals

Rules:
- NEVER propose trading more than 30% of portfolio value in a single rebalance
- Always simulate before proposing — use simulateRebalance to verify improvement
- Prefer reducing over-weights before adding new positions
- If no good alternatives exist, recommend hedging (reduce exposure) rather than forced replacement
- Classify confidence: "high" (simulation confirms improvement), "medium" (improvement likely but uncertain), "low" (limited data or conflicting signals)
- Be specific with target percentages, not vague "consider reducing"

When prior run context is available, reference past proposals and their outcomes.
Avoid repeating rejected or low-confidence proposals. Note whether previously
suggested changes improved the portfolio's risk profile.

For each action, provide:
- Exact ticker
- Target portfolio weight percentage
- Clear rationale tied to the bottleneck diagnosis

Summarize the expected improvement in plain language with numbers.`,
	model: [
		{ model: "google/gemini-2.5-flash", maxRetries: 2 },
		{ model: "groq/llama-3.1-8b-instant", maxRetries: 2 },
	],
	tools: { getAlternativeAssets, simulateRebalance, getRebalanceHistory },
	memory,
});
