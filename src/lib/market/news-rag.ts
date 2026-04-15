import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "@/lib/db";
import { marketDocuments } from "@/lib/db/schema";
import { sql, desc, cosineDistance, gt, and, isNotNull } from "drizzle-orm";
import { eq } from "drizzle-orm";

// ── Config ──────────────────────────────────────────────────────────
const NEWS_API_KEY = process.env.NEWS_API_KEY ?? "";
const EMBEDDING_MODEL = openai.embedding("text-embedding-3-small");

// ── Types ───────────────────────────────────────────────────────────

interface NewsAPIArticle {
	source: { name: string };
	title: string;
	description: string | null;
	url: string;
	publishedAt: string;
}

interface IngestResult {
	ingested: number;
	skipped: number;
}

// ── Embedding helpers ───────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
	const { embedding } = await embed({ model: EMBEDDING_MODEL, value: text });
	return embedding;
}

async function generateEmbeddings(
	texts: string[],
): Promise<{ embedding: number[] }[]> {
	if (texts.length === 0) return [];
	const { embeddings } = await embedMany({
		model: EMBEDDING_MODEL,
		values: texts,
	});
	return embeddings.map((embedding) => ({ embedding }));
}

// ── NewsAPI fetch ───────────────────────────────────────────────────

/**
 * Fetch headlines from NewsAPI for a given query or set of tickers.
 * Uses the /v2/everything endpoint with keyword search.
 */
async function fetchNewsHeadlines(
	tickers?: string[],
	query?: string,
): Promise<NewsAPIArticle[]> {
	if (!NEWS_API_KEY) {
		console.warn("[news-rag] NEWS_API_KEY not set — skipping ingestion");
		return [];
	}

	// Build search query: combine tickers and custom query
	const searchParts: string[] = [];
	if (tickers && tickers.length > 0) {
		searchParts.push(tickers.map((t) => `"${t}"`).join(" OR "));
	}
	if (query) searchParts.push(query);
	const q = searchParts.length > 0 ? searchParts.join(" OR ") : "stock market";

	const url = new URL("https://newsapi.org/v2/everything");
	url.searchParams.set("q", q);
	url.searchParams.set("language", "en");
	url.searchParams.set("sortBy", "publishedAt");
	url.searchParams.set("pageSize", "50");
	url.searchParams.set("apiKey", NEWS_API_KEY);

	try {
		const res = await fetch(url.toString());
		if (!res.ok) {
			const body = await res.text();
			console.error(`[news-rag] NewsAPI error ${res.status}: ${body}`);
			return [];
		}
		const data = (await res.json()) as {
			status: string;
			totalResults: number;
			articles: NewsAPIArticle[];
		};
		return data.articles ?? [];
	} catch (err) {
		console.error(
			"[news-rag] Failed to fetch from NewsAPI:",
			err instanceof Error ? err.message : err,
		);
		return [];
	}
}

// ── Ingestion ───────────────────────────────────────────────────────

/**
 * Ingest news headlines for portfolio tickers into the market_documents table.
 * Generates embeddings via OpenAI and stores them with pgvector.
 *
 * @param tickers - Portfolio ticker symbols to search news for
 * @returns Number of documents ingested and skipped
 */
export async function ingestNewsHeadlines(
	tickers?: string[],
): Promise<IngestResult> {
	const articles = await fetchNewsHeadlines(tickers);
	if (articles.length === 0) return { ingested: 0, skipped: 0 };

	// Filter out articles without title or description
	const validArticles = articles.filter((a) => a.title && a.description);

	if (validArticles.length === 0) return { ingested: 0, skipped: 0 };

	// Deduplicate: check which titles already exist
	const existingTitles = new Set<string>();
	try {
		const existing = await db
			.select({ content: marketDocuments.content })
			.from(marketDocuments)
			.where(eq(marketDocuments.source, "news"));
		for (const row of existing) {
			// Content is stored as "TITLE: DESCRIPTION" — extract title
			const title = row.content.split(": ")[0];
			if (title) existingTitles.add(title);
		}
	} catch {
		// Table might be empty or not yet migrated — proceed
	}

	const newArticles = validArticles.filter((a) => !existingTitles.has(a.title));

	if (newArticles.length === 0)
		return { ingested: 0, skipped: validArticles.length };

	// Generate embeddings in batch
	const texts = newArticles.map((a) => `${a.title}: ${a.description}`);
	const embeddings = await generateEmbeddings(texts);

	// Insert into market_documents
	let ingested = 0;
	for (let i = 0; i < newArticles.length; i++) {
		const article = newArticles[i];
		const embedding = embeddings[i]?.embedding;
		if (!embedding) continue;

		try {
			await db.insert(marketDocuments).values({
				ticker: null, // News headlines aren't ticker-specific
				source: "news",
				content: texts[i],
				embedding: embedding,
				publishedAt: article.publishedAt ? new Date(article.publishedAt) : null,
			});
			ingested++;
		} catch (err) {
			console.error(
				"[news-rag] Failed to insert document:",
				err instanceof Error ? err.message : err,
			);
		}
	}

	console.log(
		`[news-rag] Ingested ${ingested} articles, skipped ${validArticles.length - ingested}`,
	);
	return { ingested, skipped: validArticles.length - ingested };
}

// ── Search (RAG) ────────────────────────────────────────────────────

export interface MarketDocumentResult {
	title: string;
	source: string;
	snippet: string;
	relevance: number;
}

/**
 * Search market documents using vector similarity (cosine distance).
 * Generates an embedding for the query and finds the closest documents.
 *
 * @param query - Natural language search query
 * @param tickers - Optional ticker filter
 * @param limit - Max results to return (default 5)
 */
export async function searchMarketDocumentsRAG(
	query: string,
	tickers?: string[],
	limit = 5,
): Promise<{ documents: MarketDocumentResult[]; total_found: number }> {
	const queryEmbedding = await generateEmbedding(query);
	const similarity = sql<number>`1 - (${cosineDistance(
		marketDocuments.embedding,
		queryEmbedding,
	)})`;

	const conditions = [gt(similarity, 0.5)];

	// Only search documents with embeddings
	conditions.push(isNotNull(marketDocuments.embedding));

	const results = await db
		.select({
			content: marketDocuments.content,
			source: marketDocuments.source,
			similarity,
		})
		.from(marketDocuments)
		.where(and(...conditions))
		.orderBy(desc(similarity))
		.limit(limit);

	const documents: MarketDocumentResult[] = results.map((r) => {
		// Split "TITLE: DESCRIPTION" format
		const parts = r.content.split(": ");
		const title = parts[0] ?? r.content;
		const snippet = parts.length > 1 ? parts.slice(1).join(": ") : "";

		return {
			title,
			source: r.source,
			snippet,
			relevance: Math.round(r.similarity * 100) / 100,
		};
	});

	return { documents, total_found: documents.length };
}
