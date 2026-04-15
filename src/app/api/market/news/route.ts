import { NextRequest, NextResponse } from "next/server";
import {
	ingestNewsHeadlines,
	searchMarketDocumentsRAG,
} from "@/lib/market/news-rag";

/**
 * POST /api/market/news — Ingest latest news headlines for portfolio tickers.
 * Body: { tickers?: string[] }
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const tickers: string[] | undefined = body.tickers;
		const result = await ingestNewsHeadlines(tickers);
		return NextResponse.json(result);
	} catch (err) {
		console.error("[/api/market/news] Ingestion error:", err);
		return NextResponse.json(
			{ error: "Failed to ingest news" },
			{ status: 500 },
		);
	}
}

/**
 * GET /api/market/news?q=...&tickers=AAPL,TSLA — Search market documents (RAG).
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const query = searchParams.get("q");
		if (!query) {
			return NextResponse.json(
				{ error: "Missing query parameter 'q'" },
				{ status: 400 },
			);
		}
		const tickersParam = searchParams.get("tickers");
		const tickers = tickersParam ? tickersParam.split(",") : undefined;
		const result = await searchMarketDocumentsRAG(query, tickers);
		return NextResponse.json(result);
	} catch (err) {
		console.error("[/api/market/news] Search error:", err);
		return NextResponse.json(
			{ error: "Failed to search documents" },
			{ status: 500 },
		);
	}
}
