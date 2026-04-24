CREATE TABLE "ticker_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"name" text,
	"sector" text,
	"industry" text,
	"asset_class" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "ticker_metadata_ticker_unique" UNIQUE("ticker")
);
