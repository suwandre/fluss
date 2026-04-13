"use client";

import { FactoryFloor } from "@/components/factory/factory-floor";
import { PortfolioSummaryBar } from "@/components/layout/portfolio-summary-bar";

export default function Home() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[--bg-primary]">
      <PortfolioSummaryBar
        totalValue={124_350}
        unrealisedPnl={6_210}
        unrealisedPnlPct={5.3}
        sharpeRatio={1.42}
        maxDrawdownPct={-8.7}
        lastRunAt={null}
        health="nominal"
        onAddHolding={() => {}}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-[7] overflow-hidden">
          <FactoryFloor />
        </div>
        <aside
          className="flex-[3] min-w-[340px] max-w-[420px] border-l border-[--border] bg-[--bg-card]"
          aria-label="Agent reasoning panel placeholder"
        />
      </div>
    </div>
  );
}
