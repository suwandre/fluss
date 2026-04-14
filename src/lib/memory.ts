import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";

/**
 * Shared Mastra Memory instance backed by PostgreSQL.
 *
 * Each agent receives this via its `memory` constructor option.
 * Conversation threads are scoped per-run (threadId = runId) under
 * a shared resourceId ("portfolio-factory") so agents can reference
 * prior run context when the same thread is reused.
 *
 * Working memory is enabled so agents accumulate structured state
 * (e.g. past bottleneck patterns, risk thresholds) across runs
 * within the same thread.
 */
export const memory = new Memory({
  storage: new PostgresStore({
    id: "fluss-memory-storage",
    connectionString: process.env.DATABASE_URL,
  }),
  options: {
    lastMessages: 20,
    semanticRecall: false,
    workingMemory: {
      enabled: true,
      template: `# Portfolio Factory Working Memory

## Known Patterns
- recurring_bottlenecks:
- risk_thresholds:

## Recent Observations
- last_monitor_verdict:
- last_bottleneck_ticker:
`,
    },
  },
});
