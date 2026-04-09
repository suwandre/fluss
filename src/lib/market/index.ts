import type { PriceSnapshot, OHLCVBar } from "./yahoo";
import { getBatchCryptoPriceSnapshots, getCryptoHistoricalOHLCV, getCryptoPriceSnapshot } from "./coingecko";
import { getBatchPriceSnapshots, getHistoricalOHLCV, getPriceSnapshot } from "./yahoo";
import type { AssetClass } from "@/lib/types/visual";

export type { PriceSnapshot, OHLCVBar };
export type { AssetClass };

function isCrypto(assetClass: AssetClass): boolean {
  return assetClass === "crypto";
}

export async function getPrice(ticker: string, assetClass: AssetClass): Promise<PriceSnapshot | null> {
  if (isCrypto(assetClass)) {
    return getCryptoPriceSnapshot(ticker);
  }
  try {
    return await getPriceSnapshot(ticker);
  } catch {
    return null;
  }
}

export async function getPriceAutoDetect(ticker: string): Promise<PriceSnapshot | null> {
  try {
    const snapshot = await getPriceSnapshot(ticker);
    if (snapshot?.price != null) return snapshot;
  } catch {
    // Yahoo didn't find it, try CoinGecko
  }
  return getCryptoPriceSnapshot(ticker);
}

export async function getHistory(
  ticker: string,
  assetClass: AssetClass,
  options?: { period1?: string | Date; period2?: string | Date; interval?: "1d" | "1wk" | "1mo"; days?: number },
): Promise<OHLCVBar[] | null> {
  if (isCrypto(assetClass)) {
    const days = (options?.days as 1 | 7 | 14 | 30 | 90 | 180 | 365) ?? 30;
    return getCryptoHistoricalOHLCV(ticker, days);
  }

  const period1 = options?.period1 ?? new Date(Date.now() - (options?.days ?? 30) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    return await getHistoricalOHLCV(ticker, period1, options?.period2, options?.interval);
  } catch {
    return null;
  }
}

export interface HoldingInput {
  ticker: string;
  assetClass: string;
}

export async function getBatchPrices(holdingsList: HoldingInput[]): Promise<Map<string, PriceSnapshot>> {
  if (holdingsList.length === 0) return new Map();

  const cryptoTickers = holdingsList.filter((h) => isCrypto(h.assetClass as AssetClass)).map((h) => h.ticker);
  const yahooTickers = holdingsList.filter((h) => !isCrypto(h.assetClass as AssetClass)).map((h) => h.ticker);

  const [cryptoResult, yahooResult] = await Promise.allSettled([
    cryptoTickers.length > 0 ? getBatchCryptoPriceSnapshots(cryptoTickers) : Promise.resolve(new Map<string, PriceSnapshot>()),
    yahooTickers.length > 0 ? getBatchPriceSnapshots(yahooTickers) : Promise.resolve(new Map<string, PriceSnapshot>()),
  ]);

  const cryptoMap = cryptoResult.status === "fulfilled" ? cryptoResult.value : new Map<string, PriceSnapshot>();
  const yahooMap = yahooResult.status === "fulfilled" ? yahooResult.value : new Map<string, PriceSnapshot>();

  return new Map([...yahooMap, ...cryptoMap]);
}
