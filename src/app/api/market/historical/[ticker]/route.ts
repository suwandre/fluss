import { getHistory } from "@/lib/market";
import type { AssetClass } from "@/lib/market";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  if (!ticker) {
    return Response.json({ error: "Missing ticker" }, { status: 400 });
  }

  const url = new URL(request.url);
  const assetClass = (url.searchParams.get("assetClass") ?? "equity") as AssetClass;
  const period1 = url.searchParams.get("period1") ?? undefined;
  const period2 = url.searchParams.get("period2") ?? undefined;
  const interval = (url.searchParams.get("interval") as "1d" | "1wk" | "1mo" | null) ?? undefined;
  const days = url.searchParams.has("days") ? Number(url.searchParams.get("days")) as 1 | 7 | 14 | 30 | 90 | 180 | 365 : undefined;

  try {
    const history = await getHistory(ticker, assetClass, { period1, period2, interval, days });

    if (!history) {
      return Response.json({ error: `No historical data found for ${ticker}` }, { status: 404 });
    }

    return Response.json(history);
  } catch (error) {
    console.error(`Failed to fetch history for ${ticker}:`, error);
    return Response.json({ error: `Failed to fetch history for ${ticker}` }, { status: 500 });
  }
}
