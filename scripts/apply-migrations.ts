import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function main() {
  // Migration 0003 (user_preferences)
  await sql`CREATE TABLE IF NOT EXISTS "user_preferences" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" text DEFAULT 'default' NOT NULL,
    "sector_constraint" text DEFAULT 'same_sector' NOT NULL,
    "risk_appetite" text DEFAULT 'aggressive' NOT NULL,
    "max_turnover_pct" numeric(5, 2) DEFAULT 30,
    "excluded_tickers" text[] DEFAULT '{}',
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
  );`;
  console.log("✓ user_preferences table created (or already exists)");

  // Migration 0004 (ticker_metadata)
  await sql`CREATE TABLE IF NOT EXISTS "ticker_metadata" (
    "id" serial PRIMARY KEY NOT NULL,
    "ticker" text NOT NULL,
    "name" text,
    "sector" text,
    "industry" text,
    "asset_class" text,
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "ticker_metadata_ticker_unique" UNIQUE("ticker")
  );`;
  console.log("✓ ticker_metadata table created (or already exists)");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
