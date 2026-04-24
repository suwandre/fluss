import { db } from "@/lib/db";
import { tickerMetadata } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tickers = url.searchParams.getAll("ticker");
  if (tickers.length === 0) {
    return Response.json([]);
  }

  const rows = await db
    .select()
    .from(tickerMetadata)
    .where(inArray(tickerMetadata.ticker, tickers));

  return Response.json(rows);
}
