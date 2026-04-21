import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const YAHOO_TIMEOUT_MS = 15_000;

function withTimeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Yahoo Finance timeout: ${label}`)),
        YAHOO_TIMEOUT_MS
      )
    ),
  ]);
}

export interface PriceSnapshot {
  ticker: string;
  price: number;
  changePercent1d: number | null;
  changePercent7d: number | null;
  volume24h: number | null;
  marketCap: number | null;
  currency: string;
}

export interface OHLCVBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getPriceSnapshot(ticker: string): Promise<PriceSnapshot> {
  const quote = await withTimeout(`quote-${ticker}`, yahooFinance.quote(ticker, {
    fields: [
      "symbol",
      "regularMarketPrice",
      "regularMarketChangePercent",
      "currency",
      "regularMarketVolume",
      "marketCap",
    ],
  }));

  return {
    ticker: quote.symbol,
    price: quote.regularMarketPrice,
    changePercent1d: quote.regularMarketChangePercent ?? null,
    changePercent7d: null,
    volume24h: quote.regularMarketVolume ?? null,
    marketCap: quote.marketCap ?? null,
    currency: quote.currency,
  };
}

export async function getBatchPriceSnapshots(tickers: string[]): Promise<Map<string, PriceSnapshot>> {
  if (tickers.length === 0) return new Map();

  const quotes = await withTimeout(`quote-${tickers.join(",")}`, yahooFinance.quote(tickers, {
    return: "object",
    fields: [
      "symbol",
      "regularMarketPrice",
      "regularMarketChangePercent",
      "currency",
      "regularMarketVolume",
      "marketCap",
    ],
  }));

  const map = new Map<string, PriceSnapshot>();

  for (const ticker of tickers) {
    const quote = quotes[ticker];
    if (!quote) continue;

    map.set(ticker, {
      ticker: quote.symbol,
      price: quote.regularMarketPrice,
      changePercent1d: quote.regularMarketChangePercent ?? null,
      changePercent7d: null,
      volume24h: quote.regularMarketVolume ?? null,
      marketCap: quote.marketCap ?? null,
      currency: quote.currency,
    });
  }

  return map;
}

export async function getHistoricalOHLCV(
  ticker: string,
  period1: string | Date,
  period2?: string | Date,
  interval: "1d" | "1wk" | "1mo" = "1d",
): Promise<OHLCVBar[]> {
  const result = await withTimeout(`chart-${ticker}`, yahooFinance.chart(ticker, {
    period1,
    ...(period2 !== undefined ? { period2 } : {}),
    interval,
  }));

  return result.quotes
    .filter((row) => row.open != null && row.high != null && row.low != null && row.close != null)
    .map((row) => ({
      date: row.date,
      open: row.open!,
      high: row.high!,
      low: row.low!,
      close: row.close!,
      volume: row.volume ?? 0,
    }));
}
