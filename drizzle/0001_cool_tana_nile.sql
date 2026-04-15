CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "market_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" text,
	"source" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "market_documents_embedding_idx" ON "market_documents" USING ivfflat ("embedding" vector_cosine_ops);