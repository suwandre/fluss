import type { PriceSnapshot, OHLCVBar } from "./yahoo";

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

export async function getCryptoHistoricalOHLCV(
  ticker: string,
  days?: 1 | 7 | 14 | 30 | 90 | 180 | 365,
  from?: number,
  to?: number,
): Promise<OHLCVBar[] | null> {
  const coinId = tickerToId(ticker);
  if (!coinId) return null;

  let url: string;
  if (from != null && to != null) {
    const params = new URLSearchParams({
      vs_currency: "usd",
      from: String(from),
      to: String(to),
    });
    url = `${BASE_URL}/coins/${coinId}/market_chart/range?${params}`;
  } else {
    const params = new URLSearchParams({
      vs_currency: "usd",
      days: String(days ?? 30),
    });
    url = `${BASE_URL}/coins/${coinId}/market_chart?${params}`;
  }

  const res = await fetchWithTimeout(url, {
    headers: buildHeaders(),
  });

  if (res.status === 401) {
    console.warn(`[coingecko] 401 on OHLCV for ${ticker} — skipping. Check your API key.`);
    return null;
  }

  if (!res.ok) {
    throw new Error(`CoinGecko market chart fetch failed for ${ticker}: ${res.status}`);
  }

  const data: { prices: number[][]; total_volumes: number[][] } = await res.json();

  // Group prices by calendar day, then derive OHLCV from intraday ticks
  const dailyGroups = new Map<string, { opens: number[]; closes: number[]; highs: number[]; lows: number[]; volumes: number[] }>();

  for (const [timestamp, price] of data.prices) {
    const dayKey = new Date(timestamp).toISOString().slice(0, 10);
    let group = dailyGroups.get(dayKey);
    if (!group) {
      group = { opens: [], closes: [], highs: [], lows: [], volumes: [] };
      dailyGroups.set(dayKey, group);
    }
    if (group.opens.length === 0) {
      group.opens.push(price);
    } else {
      group.closes.push(price);
    }
    group.highs.push(price);
    group.lows.push(price);
  }

  for (const [timestamp, volume] of data.total_volumes) {
    const dayKey = new Date(timestamp).toISOString().slice(0, 10);
    const group = dailyGroups.get(dayKey);
    if (group) group.volumes.push(volume);
  }

  const bars: OHLCVBar[] = [];

  for (const [dayKey, group] of dailyGroups) {
    const allPrices = [...group.opens, ...group.closes];
    if (allPrices.length === 0) continue;

    bars.push({
      date: new Date(dayKey),
      open: allPrices[0],
      high: Math.max(...group.highs),
      low: Math.min(...group.lows),
      close: allPrices[allPrices.length - 1],
      volume: group.volumes.length > 0 ? group.volumes[group.volumes.length - 1] : 0,
    });
  }

  return bars.sort((a, b) => a.date.getTime() - b.date.getTime());
}
