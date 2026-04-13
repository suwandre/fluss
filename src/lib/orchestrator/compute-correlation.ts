import * as ss from "simple-statistics";
import { getHistory } from "@/lib/market";
import type { AssetClass } from "@/lib/types/visual";

// --- Shared correlation matrix computation ---
// Used by both the workflow step (frontend needs raw matrix for edge coloring)
// and the Bottleneck Agent's getCorrelationMatrix tool.

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

export interface CorrelationPair {
  with: string;
  correlation: number;
}

export interface CorrelationEntry {
  ticker: string;
  correlations: CorrelationPair[];
}

/**
 * Compute pairwise Pearson correlation matrix for a set of tickers.
 * Returns an array of entries, one per ticker, each containing pairwise
 * correlation coefficients with every other ticker.
 */
export async function computeCorrelationMatrix(
  tickers: string[],
  days = 90,
): Promise<CorrelationEntry[]> {
  if (tickers.length === 0) return [];

  const returnsByTicker = new Map<string, Map<string, number>>();
  await Promise.all(
    tickers.map(async (ticker) => {
      const rows = await fetchDailyReturns(ticker, days);
      const dateMap = new Map<string, number>();
      for (const r of rows) dateMap.set(r.date, r.returnPct);
      returnsByTicker.set(ticker, dateMap);
    }),
  );

  // Collect all dates to align series
  const allDates = new Set<string>();
  for (const dm of returnsByTicker.values()) {
    for (const d of dm.keys()) allDates.add(d);
  }

  // Build aligned return arrays per ticker
  const aligned = new Map<string, number[]>();
  const sortedDates = [...allDates].sort();
  for (const [ticker, dm] of returnsByTicker) {
    const arr: number[] = [];
    for (const d of sortedDates) {
      const v = dm.get(d);
      if (v != null) arr.push(v);
    }
    aligned.set(ticker, arr);
  }

  // Pairwise correlations
  return tickers.map((a) => ({
    ticker: a,
    correlations: tickers.map((b) => {
      const arrA = aligned.get(a) ?? [];
      const arrB = aligned.get(b) ?? [];
      const minLen = Math.min(arrA.length, arrB.length);
      if (minLen < 10) return { with: b, correlation: 0 };
      const corr = ss.sampleCorrelation(
        arrA.slice(0, minLen),
        arrB.slice(0, minLen),
      );
      return { with: b, correlation: Math.round(corr * 1000) / 1000 };
    }),
  }));
}
