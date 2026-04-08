import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

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
  const quote = await yahooFinance.quote(ticker, {
    fields: [
      "symbol",
      "regularMarketPrice",
      "regularMarketChangePercent",
      "currency",
      "regularMarketVolume",
      "marketCap",
    ],
  });

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

  const quotes = await yahooFinance.quote(tickers, {
    return: "object",
    fields: [
      "symbol",
      "regularMarketPrice",
      "regularMarketChangePercent",
      "currency",
      "regularMarketVolume",
      "marketCap",
    ],
  });

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
  const result = await yahooFinance.historical(ticker, {
    period1,
    period2,
    interval,
  });

  return result.map((row) => ({
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
  }));
}
