import { pgTable, index } from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";

export const holdings = pgTable("holdings", (t) => ({
	id: t.uuid().defaultRandom().primaryKey(),
	userId: t.text("user_id").notNull(),
	ticker: t.text().notNull(),
	assetClass: t.text("asset_class").notNull(),
	quantity: t.numeric({ precision: 20, scale: 8, mode: "number" }).notNull(),
	avgCost: t
		.numeric("avg_cost", { precision: 20, scale: 8, mode: "number" })
		.notNull(),
	currency: t.text().notNull().default("USD"),
	createdAt: t
		.timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
}));

export const marketSnapshots = pgTable("market_snapshots", (t) => ({
	id: t.uuid().defaultRandom().primaryKey(),
	ticker: t.text().notNull(),
	price: t.numeric({ precision: 20, scale: 8, mode: "number" }).notNull(),
	changePct1d: t.numeric("change_pct_1d", {
		precision: 10,
		scale: 4,
		mode: "number",
	}),
	changePct7d: t.numeric("change_pct_7d", {
		precision: 10,
		scale: 4,
		mode: "number",
	}),
	volume24h: t.numeric("volume_24h", { mode: "number" }),
	marketCap: t.numeric("market_cap", { mode: "number" }),
	fetchedAt: t
		.timestamp("fetched_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
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
	createdAt: t
		.timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
}));

export const marketDocuments = pgTable(
	"market_documents",
	(t) => ({
		id: t.uuid().defaultRandom().primaryKey(),
		ticker: t.text(),
		source: t.text().notNull(), // 'news', 'report', 'earnings'
		content: t.text().notNull(),
		embedding: vector("embedding", { dimensions: 768 }),
		publishedAt: t.timestamp("published_at", { withTimezone: true }),
		createdAt: t
			.timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	}),
	(table) => [
		index("market_documents_embedding_idx").using(
			"ivfflat",
			table.embedding.op("vector_cosine_ops"),
		),
	],
);

export const userPreferences = pgTable("user_preferences", (t) => ({
	id: t.serial().primaryKey(),
	userId: t.text("user_id").notNull().default("default"),
	sectorConstraint: t
		.text("sector_constraint")
		.notNull()
		.default("same_sector"), // 'same_sector' | 'diversify'
	riskAppetite: t
		.text("risk_appetite")
		.notNull()
		.default("aggressive"), // 'aggressive' | 'conservative'
	maxTurnoverPct: t
		.numeric("max_turnover_pct", { precision: 5, scale: 2, mode: "number" })
		.default(30),
	excludedTickers: t.text("excluded_tickers").array().default([]),
	createdAt: t.timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: t.timestamp("updated_at", { withTimezone: true }).defaultNow(),
}));
