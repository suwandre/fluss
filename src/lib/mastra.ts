import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { monitorAgent } from "@/lib/agents/monitor";
import { bottleneckAgent } from "@/lib/agents/bottleneck";

export const mastra = new Mastra({
  agents: { monitorAgent, bottleneckAgent },
  storage: new PostgresStore({
    id: "fluss-storage",
    connectionString: process.env.DATABASE_URL,
  }),
});
