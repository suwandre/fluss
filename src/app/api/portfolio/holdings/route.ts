import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { getBatchPriceSnapshots } from "@/lib/market/yahoo";
import { eq } from "drizzle-orm";
import { z } from "zod";

const createHoldingSchema = z.object({
  ticker: z.string().min(1),
  assetClass: z.enum(["equity", "etf", "crypto", "bond", "fx"]),
  quantity: z.string().refine((val) => !isNaN(Number(val)) && val.trim() !== "", "Must be a valid number"),
  avgCost: z.string().refine((val) => !isNaN(Number(val)) && val.trim() !== "", "Must be a valid number"),
  currency: z.string().default("USD"),
});

export async function GET() {
  try {
    const allHoldings = await db
      .select()
      .from(holdings)
      .where(eq(holdings.userId, "default"));

    if (allHoldings.length === 0) {
      return Response.json([]);
    }

    const tickers = [...new Set(allHoldings.map((h) => h.ticker))];
    const snapshots = await getBatchPriceSnapshots(tickers);

    const enriched = allHoldings.map((holding) => {
      const snapshot = snapshots.get(holding.ticker);
      return {
        ...holding,
        currentPrice: snapshot?.price ?? null,
        changePercent24h: snapshot?.changePercent1d ?? null,
      };
    });

    return Response.json(enriched);
  } catch (error) {
    console.error("Failed to fetch holdings:", error);
    return Response.json({ error: "Failed to fetch holdings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createHoldingSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { ticker, assetClass, quantity, avgCost, currency } = parsed.data;

  try {
    const [holding] = await db
      .insert(holdings)
      .values({
        userId: "default",
        ticker,
        assetClass,
        quantity,
        avgCost,
        currency,
      })
      .returning();

    return Response.json(holding, { status: 201 });
  } catch (error) {
    console.error("Failed to create holding:", error);
    return Response.json({ error: "Failed to create holding" }, { status: 500 });
  }
}
