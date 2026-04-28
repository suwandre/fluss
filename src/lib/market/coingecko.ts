import type { PriceSnapshot } from "./yahoo";

const BASE_URL = process.env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3";

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

const FETCH_TIMEOUT_MS = 10_000;

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

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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

  const res = await fetchWithTimeout(`${BASE_URL}/simple/price?${params}`, {
    headers: buildHeaders(),
  });

  if (res.status === 401) {
    console.warn(`[coingecko] 401 on price snapshot for ${ticker} — skipping. Check your API key.`);
    return null;
  }

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

  const res = await fetchWithTimeout(`${BASE_URL}/simple/price?${params}`, {
    headers: buildHeaders(),
  });

  if (res.status === 401) {
    console.warn(`[coingecko] 401 on batch price snapshots — skipping. Check your API key.`);
    return map;
  }

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
