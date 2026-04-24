import { eq } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";
import { db } from "@/lib/db";
import { tickerMetadata } from "@/lib/db/schema";

const yahooFinance = new YahooFinance();

// ── Hardcoded crypto maps ───────────────────────────────────────────

const CRYPTO_SECTOR = "Cryptocurrency";

const CRYPTO_L1 = new Set([
  "BTC","WBTC","BCH",
  "ETH","ETH2","SOL","ADA","AVAX","DOT","NEAR","ALGO","ICP","VET","ONE",
]);
const CRYPTO_DEFI = new Set([
  "UNI","AAVE","MKR","COMP","CRV","LDO","SNX","BAL","YFI","1INCH",
]);
const CRYPTO_STABLE = new Set([
  "USDT","USDC","DAI","BUSD","TUSD","FDUSD","GUSD","FRAX","USDP",
]);

function getCryptoSectorIndustry(ticker: string): { sector: string; industry: string } {
  const upper = ticker.toUpperCase();
  if (CRYPTO_L1.has(upper)) return { sector: CRYPTO_SECTOR, industry: "Layer 1" };
  if (CRYPTO_DEFI.has(upper)) return { sector: CRYPTO_SECTOR, industry: "DeFi" };
  if (CRYPTO_STABLE.has(upper)) return { sector: CRYPTO_SECTOR, industry: "Stablecoin" };
  return { sector: CRYPTO_SECTOR, industry: "Other" };
}

// ── Yahoo fetch ──────────────────────────────────────────────────────

interface YahooAssetProfile {
  sector?: string;
  industry?: string;
  longName?: string;
}

async function fetchYahooMetadata(ticker: string): Promise<{
  name: string | null;
  sector: string | null;
  industry: string | null;
}> {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, { modules: ["assetProfile"] });
    const profile = (summary.assetProfile ?? {}) as YahooAssetProfile;
    return {
      name: profile.longName ?? null,
      sector: profile.sector ?? null,
      industry: profile.industry ?? null,
    };
  } catch {
    return { name: null, sector: null, industry: null };
  }
}

// ── Public API ───────────────────────────────────────────────────────

export interface TickerMetadata {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  assetClass: string | null;
}

export async function fetchTickerMetadata(
  ticker: string,
  assetClass: string,
): Promise<TickerMetadata> {
  if (assetClass === "crypto") {
    const { sector, industry } = getCryptoSectorIndustry(ticker);
    return { ticker, name: null, sector, industry, assetClass };
  }

  const yahoo = await fetchYahooMetadata(ticker);

  const sector =
    yahoo.sector ?? (assetClass === "etf" ? "ETF" : "Equity");
  const industry = yahoo.industry ?? "Unknown";

  return {
    ticker,
    name: yahoo.name,
    sector,
    industry,
    assetClass,
  };
}

export async function syncTickerMetadataForHoldings(
  holdings: { ticker: string; assetClass: string }[],
): Promise<void> {
  // Deduplicate by ticker
  const seen = new Set<string>();
  const unique: { ticker: string; assetClass: string }[] = [];
  for (const h of holdings) {
    const key = h.ticker.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(h);
    }
  }

  const now = new Date();

  await Promise.all(
    unique.map(async (h) => {
      const meta = await fetchTickerMetadata(h.ticker, h.assetClass);

      await db
        .insert(tickerMetadata)
        .values({
          ticker: meta.ticker.toUpperCase(),
          name: meta.name,
          sector: meta.sector,
          industry: meta.industry,
          assetClass: meta.assetClass,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tickerMetadata.ticker,
          set: {
            name: meta.name,
            sector: meta.sector,
            industry: meta.industry,
            assetClass: meta.assetClass,
            updatedAt: now,
          },
        });
    }),
  );
}
