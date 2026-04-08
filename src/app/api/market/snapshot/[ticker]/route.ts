import { getPrice, getPriceAutoDetect } from "@/lib/market";
import { ASSET_CLASSES } from "@/lib/types/visual";
import { z } from "zod";

const snapshotQuerySchema = z.object({
  assetClass: z.enum(ASSET_CLASSES).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  if (!ticker) {
    return Response.json({ error: "Missing ticker" }, { status: 400 });
  }

  const url = new URL(request.url);
  const parsed = snapshotQuerySchema.safeParse(Object.fromEntries(
    [...url.searchParams.entries()].filter(([key]) => key === "assetClass"),
  ));

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid query params", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { assetClass } = parsed.data;

  try {
    const snapshot = assetClass
      ? await getPrice(ticker, assetClass)
      : await getPriceAutoDetect(ticker);

    if (!snapshot) {
      return Response.json({ error: `No price data found for ${ticker}` }, { status: 404 });
    }

    return Response.json(snapshot);
  } catch (error) {
    console.error(`Failed to fetch snapshot for ${ticker}:`, error);
    return Response.json({ error: `Failed to fetch price for ${ticker}` }, { status: 500 });
  }
}
