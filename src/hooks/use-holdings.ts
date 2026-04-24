"use client";

import { useState, useEffect, useCallback } from "react";
import type {
	AssetClass,
	HealthState,
	VolatilityLabel,
} from "@/lib/types/visual";

interface OHLCVBar {
	date: string;
	close: number;
}

// ── Types ────────────────────────────────────────────────────────────

export interface HoldingFromAPI {
	id: string;
	userId: string;
	ticker: string;
	assetClass: AssetClass;
	quantity: number;
	avgCost: number;
	currency: string;
	createdAt: string;
	currentPrice: number | null;
	changePercent24h: number | null;
	sector?: string | null;
}

export interface MachineNodeData {
	ticker: string;
	name: string;
	assetClass: AssetClass;
	weight: number;
	pnlPct: number;
	volatility: number;
	volatilityLabel: VolatilityLabel;
	sharpe: number | null;
	health: HealthState;
}

export interface PortfolioOutputData {
	netPnl: number;
	netPnlPct: number;
	sharpe: number | null;
	maxDrawdownPct: number | null;
	health: HealthState;
}

// ── Helpers ──────────────────────────────────────────────────────────

const ASSET_CLASS_NAMES: Record<AssetClass, string> = {
	equity: "Equity",
	etf: "ETF",
	crypto: "Crypto",
	bond: "Bond",
	fx: "FX",
};

function volatilityLabel(vol: number): VolatilityLabel {
	if (vol < 0.25) return "Low";
	if (vol < 0.5) return "Med";
	if (vol < 0.75) return "High";
	return "V.High";
}

function estimateVolatility(assetClass: AssetClass): number {
	switch (assetClass) {
		case "bond":
			return 0.12;
		case "etf":
			return 0.25;
		case "equity":
			return 0.35;
		case "fx":
			return 0.5;
		case "crypto":
			return 0.85;
	}
}

function mean(arr: number[]): number {
	return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
	if (arr.length < 2) return 0;
	const m = mean(arr);
	const variance = mean(arr.map((x) => (x - m) ** 2));
	return Math.sqrt(variance);
}

function computeSharpe(history: OHLCVBar[]): number | null {
	if (history.length < 2) return null;
	// Sort by date ascending
	const sorted = [...history].sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);
	const returns: number[] = [];
	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1].close;
		const curr = sorted[i].close;
		if (prev !== 0) returns.push((curr - prev) / prev);
	}
	if (returns.length < 10) return null;
	const m = mean(returns);
	const s = stdDev(returns);
	if (s === 0) return null;
	const riskFreeDaily = 0.05 / 252;
	const sharpeDaily = (m - riskFreeDaily) / s;
	return sharpeDaily * Math.sqrt(252);
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useHoldings() {
	const [holdings, setHoldings] = useState<HoldingFromAPI[]>([]);
	const [loading, setLoading] = useState(true);
	const [sharpeMap, setSharpeMap] = useState<Record<string, number | null>>({});

	const fetchHoldings = useCallback(async () => {
		try {
			const res = await fetch("/api/portfolio/holdings");
			if (!res.ok) return;
			const data: HoldingFromAPI[] = await res.json();
			setHoldings(data);
		} catch (err) {
			console.error("Failed to fetch holdings:", err);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchHoldings();
	}, [fetchHoldings]);

	// Fetch 90-day OHLCV for each holding and compute per-asset Sharpe
	useEffect(() => {
		if (holdings.length === 0) {
			setSharpeMap({});
			return;
		}
		let cancelled = false;

		async function load() {
			const results: Record<string, number | null> = {};
			await Promise.all(
				holdings.map(async (h) => {
					try {
						const res = await fetch(
							`/api/market/historical/${encodeURIComponent(h.ticker)}?assetClass=${h.assetClass}&days=90`,
						);
						if (!res.ok) {
							results[h.ticker] = null;
							return;
						}
						const bars: OHLCVBar[] = await res.json();
						if (cancelled) return;
						results[h.ticker] = computeSharpe(bars);
					} catch {
						results[h.ticker] = null;
					}
				}),
			);
			if (!cancelled) setSharpeMap(results);
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [holdings]);

	// Build machine node data from holdings
	const machineNodes: MachineNodeData[] = holdings.map((h) => {
		const price = h.currentPrice ?? h.avgCost;
		const marketValue = price * h.quantity;
		const costBasis = h.avgCost * h.quantity;
		const pnl = marketValue - costBasis;
		const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
		const vol = estimateVolatility(h.assetClass);

		return {
			ticker: h.ticker,
			name: ASSET_CLASS_NAMES[h.assetClass],
			assetClass: h.assetClass,
			weight: 0, // computed below
			pnlPct: Math.round(pnlPct * 10) / 10,
			volatility: vol,
			volatilityLabel: volatilityLabel(vol),
			sharpe: sharpeMap[h.ticker] ?? null,
			health: "nominal" as HealthState,
		};
	});

	// Compute weights
	const totalValue = holdings.reduce((sum, h) => {
		const price = h.currentPrice ?? h.avgCost;
		return sum + price * h.quantity;
	}, 0);

	if (totalValue > 0) {
		for (let i = 0; i < machineNodes.length; i++) {
			const h = holdings[i];
			const price = h.currentPrice ?? h.avgCost;
			machineNodes[i].weight =
				Math.round(((price * h.quantity) / totalValue) * 1000) / 10;
		}
	}

	// Build portfolio output data
	const portfolioOutput: PortfolioOutputData = (() => {
		const totalCost = holdings.reduce(
			(sum, h) => sum + h.avgCost * h.quantity,
			0,
		);
		const netPnl = totalValue - totalCost;
		const netPnlPct = totalCost > 0 ? (netPnl / totalCost) * 100 : 0;
		return {
			netPnl: Math.round(netPnl),
			netPnlPct: Math.round(netPnlPct * 10) / 10,
			sharpe: null,
			maxDrawdownPct: null,
			health: "nominal" as HealthState,
		};
	})();

	return {
		holdings,
		machineNodes,
		portfolioOutput,
		loading,
		refetch: fetchHoldings,
	};
}
