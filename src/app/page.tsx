"use client";

import { useState, useMemo } from "react";
import { FactoryFloor } from "@/components/factory/factory-floor";
import { PortfolioSummaryBar } from "@/components/layout/portfolio-summary-bar";
import { AgentReasoningPanel } from "@/components/agents/agent-reasoning-panel";
import { HoldingsInput, type NewHolding } from "@/components/holdings/holdings-input";
import { useAgentRun } from "@/hooks/use-agent-run";
import type { HealthState } from "@/lib/types/visual";
import type { CorrelationEntry } from "@/lib/orchestrator/compute-correlation";

export default function Home() {
  const [holdingsInputOpen, setHoldingsInputOpen] = useState(false);
  const { steps, runId, isRunning, error, monitorOutput, workflowOutput, lastRunAt, startRun } =
    useAgentRun();

  const handleAddHolding = (holding: NewHolding) => {
    // Task 4.1.5 will wire this to POST /api/portfolio/holdings
    console.log("New holding submitted:", holding);
  };

  // Derive summary bar values from Monitor output
  const summaryMetrics = useMemo(() => {
    if (!monitorOutput?.portfolio_metrics) {
      return {
        totalValue: 0,
        unrealisedPnl: 0,
        unrealisedPnlPct: 0,
        sharpeRatio: null as number | null,
        maxDrawdownPct: 0,
        health: "nominal" as HealthState,
      };
    }
    const { total_value, unrealised_pnl_pct, sharpe_ratio, max_drawdown_pct } =
      monitorOutput.portfolio_metrics;
    // Derive absolute P&L from total_value and unrealised_pnl_pct
    // PnL% is relative to cost basis: PnL = value * pct / (100 + pct)
    const unrealisedPnl =
      unrealised_pnl_pct === 0
        ? 0
        : total_value * (unrealised_pnl_pct / 100) / (1 + unrealised_pnl_pct / 100);

    return {
      totalValue: total_value,
      unrealisedPnl: Math.round(unrealisedPnl),
      unrealisedPnlPct: unrealised_pnl_pct,
      sharpeRatio: sharpe_ratio,
      maxDrawdownPct: max_drawdown_pct,
      health: monitorOutput.health_status,
    };
  }, [monitorOutput]);

  // Build a lowercase-ticker-keyed health map from Monitor's asset_health
  const assetHealth = useMemo<Record<string, HealthState> | null>(() => {
    if (!monitorOutput?.asset_health?.length) return null;
    const map: Record<string, HealthState> = {};
    for (const entry of monitorOutput.asset_health) {
      map[entry.ticker.toLowerCase()] = entry.health;
    }
    return map;
  }, [monitorOutput]);

  // Extract correlation matrix from workflow output
  const correlationMatrix = useMemo<CorrelationEntry[] | null>(() => {
    if (!workflowOutput?.correlationMatrix) return null;
    return workflowOutput.correlationMatrix as CorrelationEntry[];
  }, [workflowOutput]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[--bg-primary]">
      <HoldingsInput open={holdingsInputOpen} onOpenChange={setHoldingsInputOpen} onSubmit={handleAddHolding} />
      <PortfolioSummaryBar
        totalValue={summaryMetrics.totalValue}
        unrealisedPnl={summaryMetrics.unrealisedPnl}
        unrealisedPnlPct={summaryMetrics.unrealisedPnlPct}
        sharpeRatio={summaryMetrics.sharpeRatio}
        maxDrawdownPct={summaryMetrics.maxDrawdownPct}
        lastRunAt={lastRunAt}
        health={summaryMetrics.health}
        onAddHolding={() => setHoldingsInputOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-[7] overflow-hidden">
          <FactoryFloor
            assetHealth={assetHealth}
            globalHealth={monitorOutput?.health_status ?? null}
            correlationMatrix={correlationMatrix}
          />
        </div>
        <AgentReasoningPanel
          steps={steps}
          runId={runId}
          isRunning={isRunning}
          error={error}
          onRun={startRun}
        />
      </div>
    </div>
  );
}
