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

function toTitleCase(str: string): string {
  return str
    .split(/[_\-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function groupBySector(items: SectorExposureInput[]): Record<string, number> {
  const raw: Record<string, number> = {};

  for (const item of items) {
    const fallback = "other";
    const sector = item.sector?.trim().toLowerCase() || item.assetClass?.trim().toLowerCase() || fallback;
    raw[sector] = (raw[sector] || 0) + item.weight;
  }

  // Transform keys to titleCase
  const groups: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    groups[toTitleCase(key)] = value;
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
