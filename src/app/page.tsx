"use client";

import { FactoryFloor } from "@/components/factory/factory-floor";
import { PortfolioSummaryBar } from "@/components/layout/portfolio-summary-bar";
import { AgentReasoningPanel } from "@/components/agents/agent-reasoning-panel";
import { useAgentRun } from "@/hooks/use-agent-run";

export default function Home() {
  const { steps, runId, isRunning, error, startRun } = useAgentRun();

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
