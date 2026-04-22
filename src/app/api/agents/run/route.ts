import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { randomUUID } from "crypto";
import { mastra } from "@/lib/mastra";
import { db } from "@/lib/db";
import { agentRuns, holdings } from "@/lib/db/schema";

export async function POST(req: Request) {
  // Quick check — workflow's fetchMarketSnapshot step also checks, but this
  // gives an immediate 400 instead of a long-running stream that fails late.
  const rows = await db.select().from(holdings);

  if (rows.length === 0) {
    return Response.json(
      { error: "No holdings found. Add holdings first." },
      { status: 400 },
    );
  }

  const runId = randomUUID();
  const startedAt = Date.now();

  // Create and start the full portfolio factory workflow
  const workflow = mastra.getWorkflow("portfolioFactoryWorkflow");
  const run = await workflow.createRun({ runId });
  const runOutput = run.stream({ inputData: {} });

  const uiMessageStream = createUIMessageStream({
    execute: async ({ writer }) => {
      let writeChain = Promise.resolve();
      function safeWrite(chunk: Parameters<typeof writer.write>[0]) {
        writeChain = writeChain.then(() => writer.write(chunk));
        return writeChain;
      }

      await safeWrite({
        type: "data-run-id" as const,
        data: { runId },
      } as Parameters<typeof writer.write>[0]);

      try {
        // Forward workflow stream events to the client as custom data parts.
        // The client (useAgentRun hook) parses these to update the timeline.
        const KEEPALIVE_MS = 30_000;
        const reader = runOutput.fullStream.getReader();
        const keepaliveTimer = setInterval(
          () =>
            safeWrite({
              type: "data-keepalive" as const,
              data: {},
            } as Parameters<typeof writer.write>[0]),
          KEEPALIVE_MS,
        );

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            await safeWrite({
              type: "data-workflow-event" as const,
              data: JSON.parse(JSON.stringify(value)),
            } as Parameters<typeof writer.write>[0]);
          }
        } finally {
          clearInterval(keepaliveTimer);
          await writeChain;
          reader.releaseLock();
        }

        // Persist result to DB
        const result = await runOutput.result;
        const durationMs = Date.now() - startedAt;

        if (result.status === "success" && result.result) {
          await db.insert(agentRuns).values({
            runId,
            agentName: "workflow",
            input: { holdingsCount: rows.length },
            output: result.result as Record<string, unknown>,
            reasoning: JSON.stringify(result.result, null, 2),
            tokensUsed: null,
            durationMs,
          });
        }
      } catch (err) {
        await safeWrite({
          type: "error" as const,
          errorText:
            err instanceof Error
              ? err.message
              : "Workflow execution failed",
        } as Parameters<typeof writer.write>[0]);
      }
    },
  });

  return createUIMessageStreamResponse({ stream: uiMessageStream });
}
