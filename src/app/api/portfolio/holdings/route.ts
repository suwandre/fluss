import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { z } from "zod";

const createHoldingSchema = z.object({
  ticker: z.string().min(1),
  assetClass: z.enum(["equity", "etf", "crypto", "bond", "fx"]),
  quantity: z.string().min(1),
  avgCost: z.string().min(1),
  currency: z.string().default("USD"),
});

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
