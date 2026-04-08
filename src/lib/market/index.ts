import type { PriceSnapshot, OHLCVBar } from "./yahoo";
import { getBatchCryptoPriceSnapshots, getCryptoHistoricalOHLCV, getCryptoPriceSnapshot } from "./coingecko";
import { getBatchPriceSnapshots, getHistoricalOHLCV, getPriceSnapshot } from "./yahoo";

export type { PriceSnapshot, OHLCVBar };

export type AssetClass = "equity" | "etf" | "crypto" | "bond" | "fx";

function isCrypto(assetClass: AssetClass): boolean {
  return assetClass === "crypto";
}

export async function getPrice(ticker: string, assetClass: AssetClass): Promise<PriceSnapshot | null> {
  if (isCrypto(assetClass)) {
    return getCryptoPriceSnapshot(ticker);
  }
  return getPriceSnapshot(ticker);
}

export async function getHistory(
  ticker: string,
  assetClass: AssetClass,
  options?: { period1?: string | Date; period2?: string | Date; interval?: "1d" | "1wk" | "1mo"; days?: 1 | 7 | 14 | 30 | 90 | 180 | 365 },
): Promise<OHLCVBar[] | null> {
  if (isCrypto(assetClass)) {
    return getCryptoHistoricalOHLCV(ticker, options?.days ?? 30);
  }

  const period1 = options?.period1 ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return getHistoricalOHLCV(ticker, period1, options?.period2, options?.interval);
}

export interface HoldingInput {
  ticker: string;
  assetClass: string;
}

export async function getBatchPrices(holdingsList: HoldingInput[]): Promise<Map<string, PriceSnapshot>> {
  if (holdingsList.length === 0) return new Map();

  const cryptoTickers = holdingsList.filter((h) => isCrypto(h.assetClass as AssetClass)).map((h) => h.ticker);
  const yahooTickers = holdingsList.filter((h) => !isCrypto(h.assetClass as AssetClass)).map((h) => h.ticker);

  const [cryptoMap, yahooMap] = await Promise.all([
    cryptoTickers.length > 0 ? getBatchCryptoPriceSnapshots(cryptoTickers) : Promise.resolve(new Map<string, PriceSnapshot>()),
    yahooTickers.length > 0 ? getBatchPriceSnapshots(yahooTickers) : Promise.resolve(new Map<string, PriceSnapshot>()),
  ]);

  return new Map([...yahooMap, ...cryptoMap]);
}
