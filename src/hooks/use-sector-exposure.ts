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

function groupBySector(items: SectorExposureInput[]): Record<string, number> {
  const groups: Record<string, number> = {};
  const fallback = "Other";

  for (const item of items) {
    const sector = item.sector?.trim() || fallback;
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
