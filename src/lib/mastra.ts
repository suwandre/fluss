import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";

export const mastra = new Mastra({
  storage: new PostgresStore({
    id: "fluss-storage",
    connectionString: process.env.DATABASE_URL,
  }),
});
