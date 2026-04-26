"use client";

import { useMemo } from "react";

export interface SectorExposureInput {
  ticker: string;
  weight: number; // percentage (0-100)
  sector?: string | null;
  assetClass: string;
}

export interface SectorExposureResult {
  current: Record<string, number>;
  proposed: Record<string, number>;
}

const TICKER_SECTOR_MAP: Record<string, string> = {
  BTC: "Cryptocurrency",
  ETH: "Cryptocurrency",
  QQQ: "Equity",
  AGG: "Fixed Income",
  SPY: "Equity",
  GLD: "Commodities",
  VGK: "International",
  VNQ: "REITs",
  TLT: "Fixed Income",
};

const ASSET_CLASS_LABELS: Record<string, string> = {
  crypto: "Cryptocurrency",
  equity: "Equity",
  fixed_income: "Fixed Income",
  commodities: "Commodities",
  reits: "REITs",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupBySector(items: SectorExposureInput[]): Record<string, number> {
  const groups: Record<string, number> = {};

  for (const item of items) {
    let sector: string;
    if (item.sector?.trim()) {
      sector = item.sector.trim();
    } else {
      const mapped = TICKER_SECTOR_MAP[item.ticker.toUpperCase()];
      if (mapped) {
        sector = mapped;
      } else if (item.assetClass?.trim()) {
        sector = ASSET_CLASS_LABELS[item.assetClass.toLowerCase()] ?? capitalize(item.assetClass);
      } else {
        sector = "Other";
      }
    }
    groups[sector] = (groups[sector] || 0) + item.weight;
  }

  // Normalize to 100%
  const total = Object.values(groups).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const key of Object.keys(groups)) {
      groups[key] = (groups[key] / total) * 100;
    }
  }

  return groups;
}

export function useSectorExposure(
  currentHoldings: SectorExposureInput[] | undefined | null,
  proposedActions: { ticker: string; target_pct: number; sector?: string | null; assetClass?: string }[] | undefined | null,
): SectorExposureResult {
  return useMemo(() => {
    const current = currentHoldings && currentHoldings.length > 0
      ? groupBySector(currentHoldings)
      : {};

    const proposed = proposedActions && proposedActions.length > 0
      ? groupBySector(
          proposedActions.map((a) => ({
            ticker: a.ticker,
            weight: a.target_pct,
            sector: a.sector,
            assetClass: a.assetClass || "equity",
          })),
        )
      : {};

    return { current, proposed };
  }, [currentHoldings, proposedActions]);
}
