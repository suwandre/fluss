CREATE TABLE "user_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text DEFAULT 'default' NOT NULL,
	"sector_constraint" text DEFAULT 'same_sector' NOT NULL,
	"risk_appetite" text DEFAULT 'aggressive' NOT NULL,
	"max_turnover_pct" numeric(5, 2) DEFAULT 30,
	"excluded_tickers" text[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
