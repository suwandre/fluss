import { getCryptoPriceSnapshot } from "@/lib/market/coingecko";
import { getPriceSnapshot } from "@/lib/market/yahoo";
import type { PriceSnapshot } from "@/lib/market";
import type { AssetClass } from "@/lib/market";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  if (!ticker) {
    return Response.json({ error: "Missing ticker" }, { status: 400 });
  }

  const url = new URL(_request.url);
  const assetClass = url.searchParams.get("assetClass") as AssetClass | null;

  try {
    let snapshot: PriceSnapshot | null = null;

    if (assetClass === "crypto") {
      snapshot = await getCryptoPriceSnapshot(ticker);
    } else if (assetClass) {
      snapshot = await getPriceSnapshot(ticker);
    } else {
      snapshot = await getPriceSnapshot(ticker);
      if (!snapshot) {
        snapshot = await getCryptoPriceSnapshot(ticker);
      }
    }

    if (!snapshot) {
      return Response.json({ error: `No price data found for ${ticker}` }, { status: 404 });
    }

    return Response.json(snapshot);
  } catch (error) {
    console.error(`Failed to fetch snapshot for ${ticker}:`, error);
    return Response.json({ error: `Failed to fetch price for ${ticker}` }, { status: 500 });
  }
}
