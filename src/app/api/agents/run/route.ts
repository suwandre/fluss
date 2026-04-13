import { type UIMessageChunk, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { toAISdkStream } from "@mastra/ai-sdk";
import { randomUUID } from "crypto";
import { mastra } from "@/lib/mastra";
import { MonitorOutput } from "@/lib/agents/monitor";
import { db } from "@/lib/db";
import { agentRuns, holdings } from "@/lib/db/schema";
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
  const runId = randomUUID();
  const startedAt = Date.now();

  // Stream Monitor Agent via Mastra with structured output
  const agent = mastra.getAgent("monitorAgent");
  const agentStream = await agent.stream(prompt, {
    structuredOutput: { schema: MonitorOutput },
  });

  const convertedStream = toAISdkStream(agentStream, { from: "agent" });
  const reader = convertedStream.getReader();

  // Collect text chunks to reconstruct full output for persistence
  const textChunks: string[] = [];

  const uiMessageStream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Collect text-delta content for DB persistence
          if (value?.type === "text-delta" && typeof value.delta === "string") {
            textChunks.push(value.delta);
          }
          // Type assertion: @mastra/ai-sdk vendors AI SDK v5 types which are
          // structurally compatible with ai@6.x UIMessageChunk at runtime.
          writer.write(value as UIMessageChunk);
        }
      } finally {
        reader.releaseLock();
      }

      // Save agent run to DB after streaming completes
      const durationMs = Date.now() - startedAt;
      const fullText = textChunks.join("");

      let parsedOutput: Record<string, unknown> = {};
      try {
        parsedOutput = JSON.parse(fullText);
      } catch {
        parsedOutput = { raw: fullText };
      }

      await db.insert(agentRuns).values({
        runId,
        agentName: "monitor",
        input: { prompt, portfolioData },
        output: parsedOutput,
        reasoning: fullText,
        tokensUsed: null,
        durationMs,
      });
    },
  });

  return createUIMessageStreamResponse({ stream: uiMessageStream });
}
