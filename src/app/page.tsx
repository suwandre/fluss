"use client";

import { FactoryFloor } from "@/components/factory/factory-floor";
import { PortfolioSummaryBar } from "@/components/layout/portfolio-summary-bar";
import { AgentReasoningPanel } from "@/components/agents/agent-reasoning-panel";
import type { AgentStepData } from "@/components/agents/agent-timeline";
import type { AgentStatus } from "@/lib/types/visual";

const PLACEHOLDER_STEPS: AgentStepData[] = [
  { name: "Monitor Agent", status: "queued" as AgentStatus },
  { name: "Bottleneck Agent", status: "queued" as AgentStatus },
  { name: "Redesign Agent", status: "queued" as AgentStatus },
  { name: "Risk Agent", status: "queued" as AgentStatus },
];

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
        <AgentReasoningPanel steps={PLACEHOLDER_STEPS} />
      </div>
    </div>
  );
}
