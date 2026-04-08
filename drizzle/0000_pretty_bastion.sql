CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"reasoning" text,
	"tokens_used" integer,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ticker" text NOT NULL,
	"asset_class" text NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"avg_cost" numeric(20, 8) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" text NOT NULL,
	"price" numeric(20, 8) NOT NULL,
	"change_pct_1d" numeric(10, 4),
	"change_pct_7d" numeric(10, 4),
	"volume_24h" numeric,
	"market_cap" numeric,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
