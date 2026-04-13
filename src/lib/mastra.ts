import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { monitorAgent } from "@/lib/agents/monitor";
import { bottleneckAgent } from "@/lib/agents/bottleneck";
import { redesignAgent } from "@/lib/agents/redesign";
import { riskAgent } from "@/lib/agents/risk";
import { portfolioFactoryWorkflow } from "@/lib/orchestrator/workflow";

export const mastra = new Mastra({
  agents: { monitorAgent, bottleneckAgent, redesignAgent, riskAgent },
  workflows: { portfolioFactoryWorkflow },
  storage: new PostgresStore({
    id: "fluss-storage",
    connectionString: process.env.DATABASE_URL,
  }),
});
