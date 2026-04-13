import { type UIMessageChunk, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { toAISdkStream } from "@mastra/ai-sdk";
import { mastra } from "@/lib/mastra";
import { MonitorOutput } from "@/lib/agents/monitor";
import { db } from "@/lib/db";
import { holdings } from "@/lib/db/schema";
import { getBatchPrices } from "@/lib/market";

export async function POST(req: Request) {
  // Fetch current holdings from DB
  const rows = await db.select().from(holdings);

  if (rows.length === 0) {
    return Response.json(
      { error: "No holdings found. Add holdings first." },
      { status: 400 },
    );
  }

  // Build portfolio context for the agent
  const priceMap = await getBatchPrices(
    rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
  );

  const portfolioData = rows.map((row) => {
    const snapshot = priceMap.get(row.ticker);
    const currentPrice = snapshot?.price ?? null;
    const marketValue = currentPrice != null ? currentPrice * row.quantity : null;
    const pnlPct =
      currentPrice != null && row.avgCost > 0
        ? ((currentPrice - row.avgCost) / row.avgCost) * 100
        : null;

    return {
      ticker: row.ticker,
      assetClass: row.assetClass,
      quantity: row.quantity,
      avgCost: row.avgCost,
      currentPrice,
      marketValue,
      pnlPct,
    };
  });

  const prompt = `Analyze this portfolio and assess its health:\n${JSON.stringify(portfolioData, null, 2)}`;

  // Stream Monitor Agent via Mastra with structured output
  const agent = mastra.getAgent("monitorAgent");
  const agentStream = await agent.stream(prompt, {
    structuredOutput: { schema: MonitorOutput },
  });

  const convertedStream = toAISdkStream(agentStream, { from: "agent" });
  const reader = convertedStream.getReader();

  const uiMessageStream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Type assertion: @mastra/ai-sdk vendors AI SDK v5 types which are
          // structurally compatible with ai@6.x UIMessageChunk at runtime.
          writer.write(value as UIMessageChunk);
        }
      } finally {
        reader.releaseLock();
      }
    },
  });

  return createUIMessageStreamResponse({ stream: uiMessageStream });
}
