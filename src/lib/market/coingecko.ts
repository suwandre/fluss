import type { PriceSnapshot, OHLCVBar } from "./yahoo";

const BASE_URL = "https://api.coingecko.com/api/v3";

const TICKER_TO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  USDC: "usd-coin",
  ADA: "cardano",
  DOGE: "dogecoin",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  MATIC: "matic-network",
  LINK: "chainlink",
  UNI: "uniswap",
  ATOM: "cosmos",
  LTC: "litecoin",
  NEAR: "near",
  ARB: "arbitrum",
  OP: "optimism",
  APT: "aptos",
  SUI: "sui",
  SEI: "sei-network",
  INJ: "injective-protocol",
  TIA: "celestia",
  JUP: "jupiter-exchange-solana",
  FIL: "filecoin",
  IMX: "immutable-x",
  RUNE: "thorchain",
  AAVE: "aave",
  MKR: "maker",
};

function getApiKey(): string | undefined {
  return process.env.COINGECKO_API_KEY || undefined;
}

function buildHeaders(): Record<string, string> {
  const key = getApiKey();
  if (!key) return {};
  return { "x-cg-demo-api-key": key };
}

function tickerToId(ticker: string): string | null {
  return TICKER_TO_ID[ticker.toUpperCase()] ?? null;
}

export async function getCryptoPriceSnapshot(ticker: string): Promise<PriceSnapshot | null> {
  const coinId = tickerToId(ticker);
  if (!coinId) return null;

  const params = new URLSearchParams({
    ids: coinId,
    vs_currencies: "usd",
    include_24hr_change: "true",
    include_24hr_vol: "true",
    include_market_cap: "true",
  });

  const res = await fetch(`${BASE_URL}/simple/price?${params}`, {
    headers: buildHeaders(),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko price fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const coin = data[coinId];
  if (!coin) return null;

  return {
    ticker: ticker.toUpperCase(),
    price: coin.usd,
    changePercent1d: coin.usd_24h_change ?? null,
    changePercent7d: null,
    volume24h: coin.usd_24h_vol ?? null,
    marketCap: coin.usd_market_cap ?? null,
    currency: "USD",
  };
}

export async function getBatchCryptoPriceSnapshots(tickers: string[]): Promise<Map<string, PriceSnapshot>> {
  const map = new Map<string, PriceSnapshot>();
  if (tickers.length === 0) return map;

  const resolved = tickers
    .map((t) => ({ ticker: t, id: tickerToId(t) }))
    .filter((entry): entry is { ticker: string; id: string } => entry.id !== null);

  if (resolved.length === 0) return map;

  const ids = resolved.map((r) => r.id).join(",");

  const params = new URLSearchParams({
    ids,
    vs_currencies: "usd",
    include_24hr_change: "true",
    include_24hr_vol: "true",
    include_market_cap: "true",
  });

  const res = await fetch(`${BASE_URL}/simple/price?${params}`, {
    headers: buildHeaders(),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko batch price fetch failed: ${res.status}`);
  }

  const data = await res.json();

  for (const { ticker, id } of resolved) {
    const coin = data[id];
    if (!coin) continue;

    map.set(ticker.toUpperCase(), {
      ticker: ticker.toUpperCase(),
      price: coin.usd,
      changePercent1d: coin.usd_24h_change ?? null,
      changePercent7d: null,
      volume24h: coin.usd_24h_vol ?? null,
      marketCap: coin.usd_market_cap ?? null,
      currency: "USD",
    });
  }

  return map;
}

export async function getCryptoHistoricalOHLCV(
  ticker: string,
  days: 1 | 7 | 14 | 30 | 90 | 180 | 365 = 30,
): Promise<OHLCVBar[]> {
  const coinId = tickerToId(ticker);
  if (!coinId) {
    throw new Error(`Unknown crypto ticker: ${ticker}`);
  }

  const params = new URLSearchParams({
    vs_currency: "usd",
    days: String(days),
  });

  const res = await fetch(`${BASE_URL}/coins/${coinId}/ohlc?${params}`, {
    headers: buildHeaders(),
  });

  if (!res.ok) {
    throw new Error(`CoinGecko OHLCV fetch failed for ${ticker}: ${res.status}`);
  }

  const data: number[][] = await res.json();

  return data.map(([timestamp, open, high, low, close]) => ({
    date: new Date(timestamp),
    open,
    high,
    low,
    close,
    volume: 0,
  }));
}
