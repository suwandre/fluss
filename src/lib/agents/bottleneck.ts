import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import * as ss from "simple-statistics";
import { z } from "zod";
import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { getBatchPrices, getHistory } from "@/lib/market";
import { searchMarketDocumentsRAG } from "@/lib/market/news-rag";
import { memory } from "@/lib/memory";
import { computeCorrelationMatrix } from "@/lib/orchestrator/compute-correlation";
import type { AssetClass } from "@/lib/types/visual";

// --- Output schema ---

export const BottleneckOutput = z.object({
	primary_bottleneck: z.object({
		ticker: z.string(),
		reason: z.string(),
		severity: z.enum(["low", "medium", "high"]),
		metric: z.string(),
	}),
	secondary_bottlenecks: z.array(
		z.object({
			ticker: z.string(),
			reason: z.string(),
		}),
	),
	analysis: z.string(),
});

export type BottleneckOutput = z.infer<typeof BottleneckOutput>;

// --- Helpers ---

function assetClassForTicker(ticker: string): AssetClass {
	if (ticker.includes("-")) return "crypto";
	return "equity";
}

async function fetchDailyReturns(
	ticker: string,
	days: number,
	fallbackAssetClass?: string,
): Promise<{ date: string; returnPct: number }[]> {
	const ac = (fallbackAssetClass as AssetClass) ?? assetClassForTicker(ticker);
	const history = await getHistory(ticker, ac, { days });
	if (!history || history.length < 2) return [];

	const results: { date: string; returnPct: number }[] = [];
	for (let i = 1; i < history.length; i++) {
		const prev = history[i - 1].close;
		if (prev <= 0) continue;
		const date =
			history[i].date instanceof Date
				? history[i].date.toISOString().slice(0, 10)
				: String(history[i].date);
		results.push({ date, returnPct: (history[i].close - prev) / prev });
	}
	return results;
}

// --- Tools ---

const getCorrelationMatrix = createTool({
	id: "get-correlation-matrix",
	description:
		"Compute pairwise Pearson correlation matrix for a set of tickers based on historical daily returns.",
	inputSchema: z.object({
		tickers: z.array(z.string()).describe("List of ticker symbols"),
		days: z.number().describe("Lookback window in days").default(90),
	}),
	outputSchema: z.object({
		matrix: z.array(
			z.object({
				ticker: z.string(),
				correlations: z.array(
					z.object({
						with: z.string(),
						correlation: z.number(),
					}),
				),
			}),
		),
	}),
	execute: async (input) => {
		const matrix = await computeCorrelationMatrix(
			input.tickers,
			input.days ?? 90,
		);
		return { matrix };
	},
});

const getVolatilityContribution = createTool({
	id: "get-volatility-contribution",
	description:
		"Compute marginal volatility (VaR) contribution of a specific ticker to the overall portfolio.",
	inputSchema: z.object({
		ticker: z.string().describe("Ticker to analyze"),
		days: z.number().describe("Lookback window in days").default(90),
	}),
	outputSchema: z.object({
		ticker: z.string(),
		volatility_pct: z.number(),
		portfolio_volatility_pct: z.number(),
		marginal_contribution_pct: z.number(),
		weight_pct: z.number(),
		component_var_pct: z.number(),
	}),
	execute: async (input) => {
		const rows = await db.select().from(holdings);
		if (rows.length === 0) {
			return {
				ticker: input.ticker,
				volatility_pct: 0,
				portfolio_volatility_pct: 0,
				marginal_contribution_pct: 0,
				weight_pct: 0,
				component_var_pct: 0,
			};
		}

		// Live prices for portfolio weights
		const priceMap = await getBatchPrices(
			rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
		);

		let totalValue = 0;
		const positions: { ticker: string; weight: number; assetClass: string }[] =
			[];
		for (const row of rows) {
			const price = priceMap.get(row.ticker)?.price ?? 0;
			const value = price * row.quantity;
			totalValue += value;
			positions.push({
				ticker: row.ticker,
				weight: value,
				assetClass: row.assetClass,
			});
		}
		if (totalValue > 0) {
			for (const p of positions) p.weight /= totalValue;
		}

		// Fetch historical returns for all holdings + target ticker
		const allTickers = [
			...new Set([...positions.map((p) => p.ticker), input.ticker]),
		];
		const returnsMap = new Map<string, number[]>();

		await Promise.all(
			allTickers.map(async (ticker) => {
				const ac =
					ticker === input.ticker
						? assetClassForTicker(ticker)
						: ((positions.find((p) => p.ticker === ticker)
								?.assetClass as AssetClass) ?? assetClassForTicker(ticker));
				const history = await getHistory(ticker, ac, { days: input.days });
				const closes: number[] = [];
				history?.forEach((bar) => closes.push(bar.close));
				const dailyReturns: number[] = [];
				for (let i = 1; i < closes.length; i++) {
					if (closes[i - 1] > 0)
						dailyReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
				}
				returnsMap.set(ticker, dailyReturns);
			}),
		);

		const targetReturns = returnsMap.get(input.ticker) ?? [];
		const targetVol =
			targetReturns.length > 1
				? ss.sampleStandardDeviation(targetReturns) * 100
				: 0;

		// Build portfolio returns (weighted sum)
		const minLen = Math.min(
			...[...returnsMap.values()].map((r) => r.length),
			30,
		);
		const portfolioReturns: number[] = [];
		for (let i = 0; i < minLen; i++) {
			let weightedReturn = 0;
			for (const pos of positions) {
				const ret = returnsMap.get(pos.ticker)?.[i] ?? 0;
				weightedReturn += pos.weight * ret;
			}
			portfolioReturns.push(weightedReturn);
		}

		const portfolioVol =
			portfolioReturns.length > 1
				? ss.sampleStandardDeviation(portfolioReturns) * 100
				: 0;

		// Marginal contribution: beta_i * w_i * sigma_p
		const covariance =
			targetReturns.length > 1 && portfolioReturns.length > 1
				? ss.sampleCovariance(targetReturns.slice(0, minLen), portfolioReturns)
				: 0;
		const portfolioVariance = (portfolioVol / 100) ** 2;
		const beta = portfolioVariance > 0 ? covariance / portfolioVariance : 0;

		const targetWeight =
			positions.find((p) => p.ticker === input.ticker)?.weight ?? 0;
		const marginalContribution =
			targetWeight * beta * (portfolioVol / 100) * 100;
		const componentVarPct =
			portfolioVol > 0 ? (marginalContribution / portfolioVol) * 100 : 0;

		return {
			ticker: input.ticker,
			volatility_pct: Math.round(targetVol * 100) / 100,
			portfolio_volatility_pct: Math.round(portfolioVol * 100) / 100,
			marginal_contribution_pct: Math.round(marginalContribution * 100) / 100,
			weight_pct: Math.round(targetWeight * 10000) / 100,
			component_var_pct: Math.round(componentVarPct * 100) / 100,
		};
	},
});

const searchMarketDocuments = createTool({
	id: "search-market-documents",
	description:
		"Search recent market news and reports relevant to a query using vector similarity (RAG). Returns the most relevant documents with snippets and relevance scores.",
	inputSchema: z.object({
		query: z
			.string()
			.describe("Search query, e.g. Tesla earnings or Bitcoin ETF"),
		tickers: z
			.array(z.string())
			.optional()
			.describe("Filter by ticker symbols"),
	}),
	outputSchema: z.object({
		documents: z.array(
			z.object({
				title: z.string(),
				source: z.string(),
				snippet: z.string(),
				relevance: z.number(),
			}),
		),
		total_found: z.number(),
	}),
	execute: async (input) => {
		return searchMarketDocumentsRAG(input.query, input.tickers);
	},
});

// --- Agent ---

export const bottleneckAgent = new Agent({
	id: "bottleneck",
	name: "Bottleneck Agent",
	instructions: `You are the Bottleneck Agent in a Portfolio Factory system. You only run when the Monitor Agent has escalated a concern. Your job is to identify WHICH specific asset (machine) is limiting the portfolio's throughput.

You diagnose problems by:
1. Computing correlation matrices - find assets moving in lockstep (hidden single point of failure)
2. Measuring each asset's volatility contribution to overall portfolio risk
3. Searching for relevant market news that might explain unusual behavior

When you identify a bottleneck:
- Name the specific ticker and the exact metric that makes it a bottleneck
- Classify severity: "high" (correlation >0.85 or contributing >40% of portfolio VaR), "medium" (correlation 0.6-0.85 or 20-40% VaR), "low" (everything else)
- Also note any secondary bottlenecks that are worth watching
- Provide a clear analysis in plain language

When prior run context is available, compare current bottlenecks to previously
identified patterns. Note if a bottleneck is recurring, worsening, or improving
since the last assessment.

Be precise with numbers. Always report the correlation coefficient or volatility percentage.`,
	model: [
		{ model: "ollama-cloud/minimax-m2.5:cloud", maxRetries: 2 },
		{ model: "ollama-cloud/qwen3.5:cloud", maxRetries: 2 },
	],
	tools: {
		getCorrelationMatrix,
		getVolatilityContribution,
		searchMarketDocuments,
	},
	memory,
});
