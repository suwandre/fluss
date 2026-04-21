import { getHistory } from "@/lib/market";
import type { AssetClass } from "@/lib/types/visual";

export interface PortfolioMetrics {
	sharpeRatio: number | null;
	maxDrawdownPct: number;
}

interface HoldingForMetrics {
	ticker: string;
	assetClass: string;
	quantity: number;
}

/**
 * Compute portfolio-level Sharpe ratio and Max Drawdown from 90 days of historical prices.
 *
 * - Fetches 90 days of daily closes for each holding.
 * - Builds a blended portfolio equity curve (quantity * close) per day.
 * - Requires all holdings to have data for a given date to include it.
 * - Sharpe: annualized, using 5% risk-free rate.
 * - Max drawdown: peak-to-trough as a percentage (e.g. 15.2 => 15.2%).
 */
export async function computePortfolioMetrics(
	portfolioData: HoldingForMetrics[],
): Promise<PortfolioMetrics> {
	if (portfolioData.length === 0) {
		return { sharpeRatio: null, maxDrawdownPct: 0 };
	}

	// Fetch 90 days of history for each holding
	const historyMap = new Map<string, { date: string; close: number }[]>();
	await Promise.all(
		portfolioData.map(async (entry) => {
			const history = await getHistory(
				entry.ticker,
				entry.assetClass as AssetClass,
				{ days: 90 },
			);
			if (!history || history.length === 0) return;
			const bars = history.map((bar) => ({
				date:
					bar.date instanceof Date
						? bar.date.toISOString().slice(0, 10)
						: String(bar.date),
				close: bar.close,
			}));
			historyMap.set(entry.ticker, bars);
		}),
	);

	// Build aligned portfolio values per date
	const allDates = new Set<string>();
	for (const bars of historyMap.values()) {
		for (const bar of bars) allDates.add(bar.date);
	}
	const sortedDates = [...allDates].sort();

	const portfolioValues: number[] = [];
	for (const date of sortedDates) {
		let value = 0;
		let allPresent = true;
		for (const entry of portfolioData) {
			const bars = historyMap.get(entry.ticker);
			if (!bars) {
				allPresent = false;
				break;
			}
			const bar = bars.find((b) => b.date === date);
			if (!bar) {
				allPresent = false;
				break;
			}
			value += bar.close * entry.quantity;
		}
		if (allPresent) {
			portfolioValues.push(value);
		}
	}

	if (portfolioValues.length < 11) {
		return { sharpeRatio: null, maxDrawdownPct: 0 };
	}

	// Daily arithmetic returns
	const returns: number[] = [];
	for (let i = 1; i < portfolioValues.length; i++) {
		const prev = portfolioValues[i - 1];
		if (prev <= 0) continue;
		returns.push((portfolioValues[i] - prev) / prev);
	}

	if (returns.length < 10) {
		return { sharpeRatio: null, maxDrawdownPct: 0 };
	}

	// Sharpe ratio
	const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
	const variance =
		returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) /
		returns.length;
	const stdDev = Math.sqrt(variance);

	let sharpeRatio: number | null = null;
	const RISK_FREE_DAILY = 0.05 / 252;
	if (stdDev > 0) {
		sharpeRatio =
			((meanReturn - RISK_FREE_DAILY) / stdDev) * Math.sqrt(252);
		sharpeRatio = Math.round(sharpeRatio * 100) / 100;
	}

	// Max drawdown
	let peak = portfolioValues[0];
	let maxDrawdown = 0;
	for (const value of portfolioValues) {
		if (value > peak) peak = value;
		const drawdown = (peak - value) / peak;
		if (drawdown > maxDrawdown) maxDrawdown = drawdown;
	}

	return {
		sharpeRatio,
		maxDrawdownPct: Math.round(maxDrawdown * 10000) / 100,
	};
}
