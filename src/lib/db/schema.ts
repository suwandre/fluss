import { pgTable } from "drizzle-orm/pg-core";

export const holdings = pgTable("holdings", (t) => ({
  id: t.uuid().defaultRandom().primaryKey(),
  userId: t.text("user_id").notNull(),
  ticker: t.text().notNull(),
  assetClass: t.text("asset_class").notNull(),
  quantity: t.numeric({ precision: 20, scale: 8 }).notNull(),
  avgCost: t.numeric("avg_cost", { precision: 20, scale: 8 }).notNull(),
  currency: t.text().notNull().default("USD"),
  createdAt: t.timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}));

export const marketSnapshots = pgTable("market_snapshots", (t) => ({
  id: t.uuid().defaultRandom().primaryKey(),
  ticker: t.text().notNull(),
  price: t.numeric({ precision: 20, scale: 8 }).notNull(),
  changePct1d: t.numeric("change_pct_1d", { precision: 10, scale: 4 }),
  changePct7d: t.numeric("change_pct_7d", { precision: 10, scale: 4 }),
  volume24h: t.numeric("volume_24h"),
  marketCap: t.numeric("market_cap"),
  fetchedAt: t.timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
}));

export const agentRuns = pgTable("agent_runs", (t) => ({
  id: t.uuid().defaultRandom().primaryKey(),
  runId: t.text("run_id").notNull(),
  agentName: t.text("agent_name").notNull(),
  input: t.jsonb().notNull(),
  output: t.jsonb().notNull(),
  reasoning: t.text(),
  tokensUsed: t.integer("tokens_used"),
  durationMs: t.integer("duration_ms"),
  createdAt: t.timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}));
