import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { monitorAgent } from "@/lib/agents/monitor";

export const mastra = new Mastra({
  agents: { monitorAgent },
  storage: new PostgresStore({
    id: "fluss-storage",
    connectionString: process.env.DATABASE_URL,
  }),
});
