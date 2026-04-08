import { getHistory } from "@/lib/market";
import { ASSET_CLASSES } from "@/lib/types/visual";
import { z } from "zod";

const VALID_INTERVALS = ["1d", "1wk", "1mo"] as const;
const VALID_DAYS = [1, 7, 14, 30, 90, 180, 365];

const historicalQuerySchema = z.object({
  assetClass: z.enum(ASSET_CLASSES).default("equity"),
  period1: z.string().optional(),
  period2: z.string().optional(),
  interval: z.enum(VALID_INTERVALS).optional(),
  days: z.coerce.number().refine((val) => VALID_DAYS.includes(val as 1 | 7 | 14 | 30 | 90 | 180 | 365), "Must be one of: 1, 7, 14, 30, 90, 180, 365").optional(),
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
  const parsed = historicalQuerySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid query params", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { assetClass, period1, period2, interval, days } = parsed.data;

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
