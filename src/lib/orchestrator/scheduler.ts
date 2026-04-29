import cron, { type ScheduledTask } from "node-cron";
import { mastra } from "@/lib/mastra";
import { db } from "@/lib/db";
import { holdings, agentRuns } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { ingestNewsHeadlines } from "@/lib/market/news-rag";
import { getBatchPrices } from "@/lib/market";
import { computePortfolioMetrics } from "@/lib/orchestrator/compute-metrics";
import { monitorAgent } from "@/lib/agents/monitor";
import { MonitorOutput } from "@/lib/agents/monitor";
import {
  isStructuredOutputError,
  normalizeMonitorOutput,
  recoverStructuredOutput,
} from "@/lib/agents/normalize-output";

// ── Config ──────────────────────────────────────────────────────────
const TICK_INTERVAL_MS = parseInt(
  process.env.ORCHESTRATOR_TICK_INTERVAL_MS ?? "900000",
  10,
);

// ── Memory context (mirrors workflow.ts) ─────────────────────────────
const MEMORY_THREADS = {
  monitor: "portfolio-factory-monitor",
};
const MEMORY_RESOURCE_ID = "portfolio-factory";

/** Convert a millisecond interval to a cron expression (minute granularity). */
function msToCronExpression(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.round(minutes / 60);
  return `0 */${hours} * * *`;
}

// ── State ───────────────────────────────────────────────────────────
let scheduledTask: ScheduledTask | null = null;
let isRunning = false;

interface PortfolioDataEntry {
  ticker: string;
  assetClass: string;
  quantity: number;
  avgCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  pnlPct: number | null;
}

function buildMonitorPrompt(
  portfolioData: PortfolioDataEntry[],
  totalValue: number,
  totalCost: number,
  metrics: { sharpeRatio: number | null; maxDrawdownPct: number },
): string {
  return [
    "CRITICAL: You must output ONLY raw, valid JSON matching the requested schema. Do not use markdown formatting. Do not wrap in ```json ... ```. No conversational text.",
    "",
    "CRITICAL: Output ONLY raw valid JSON matching this exact schema:",
    "{",
    '  "health_status": "nominal" | "warning" | "critical",',
    '  "portfolio_metrics": { "total_value": number, "unrealised_pnl_pct": number, "sharpe_ratio": number|null, "max_drawdown_pct": number, "largest_position_pct": number },',
    '  "concerns": [string, ...],',
    '  "escalate": boolean,',
    '  "summary": string,',
    '  "asset_health": [{ "ticker": string, "health": "nominal"|"warning"|"critical" }, ...]',
    "}",
    "",
    "Precomputed portfolio metrics (do not override unless you disagree strongly):",
    `Sharpe ratio: ${metrics.sharpeRatio ?? "insufficient data"}`,
    `Max drawdown: ${(metrics.maxDrawdownPct ?? 0).toFixed(2)}%`,
    "",
    "Analyze this portfolio and assess its health:",
    JSON.stringify(portfolioData, null, 2),
    `Total portfolio value: $${totalValue.toFixed(2)}`,
    `Total cost basis: $${totalCost.toFixed(2)}`,
  ].join("\n");
}

/**
 * Execute one orchestrator tick:
 * Tier 1 — lightweight Monitor health check every 15 min.
 * Tier 2 — full workflow only if Monitor returns warning/critical.
 */
async function tick(): Promise<void> {
  if (isRunning) {
    console.log("[scheduler] Tick skipped — previous run still in progress");
    return;
  }

  const rows = await db.select().from(holdings);
  if (rows.length === 0) {
    console.log("[scheduler] Tick skipped — no holdings in portfolio");
    return;
  }

  isRunning = true;
  const runId = randomUUID();
  const startedAt = Date.now();

  console.log(
    `[scheduler] Tier 1 started — runId=${runId}, holdings=${rows.length}`,
  );

  try {
    // ── Tier 1: lightweight health check ──────────────────────────
    const priceMap = await getBatchPrices(
      rows.map((r) => ({ ticker: r.ticker, assetClass: r.assetClass })),
    );

    let totalValue = 0;
    let totalCost = 0;
    const portfolioData: PortfolioDataEntry[] = rows.map((row) => {
      const snapshot = priceMap.get(row.ticker);
      const currentPrice = snapshot?.price ?? null;
      const marketValue =
        currentPrice != null ? currentPrice * row.quantity : null;
      const pnlPct =
        currentPrice != null && row.avgCost > 0
          ? ((currentPrice - row.avgCost) / row.avgCost) * 100
          : null;

      if (marketValue != null) totalValue += marketValue;
      totalCost += row.avgCost * row.quantity;

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

    const metrics = await computePortfolioMetrics(
      rows.map((r) => ({
        ticker: r.ticker,
        assetClass: r.assetClass,
        quantity: r.quantity,
      })),
    );

    const prompt = buildMonitorPrompt(
      portfolioData,
      totalValue,
      totalCost,
      metrics,
    );

    let monitorResult: Record<string, unknown>;
    try {
      const result = await monitorAgent.generate(prompt, {
        structuredOutput: { schema: MonitorOutput, jsonPromptInjection: true },
        memory: {
          thread: MEMORY_THREADS.monitor,
          resource: MEMORY_RESOURCE_ID,
        },
        modelSettings: { maxOutputTokens: 4096 },
        activeTools: [],
      });
      monitorResult = result.object as Record<string, unknown>;
    } catch (err) {
      if (!isStructuredOutputError(err)) throw err;
      monitorResult = await recoverStructuredOutput(
        monitorAgent,
        prompt,
        MonitorOutput,
        normalizeMonitorOutput,
        {
          memory: {
            thread: MEMORY_THREADS.monitor,
            resource: MEMORY_RESOURCE_ID,
          },
        },
      );
    }

    const healthStatus = (
      monitorResult.health_status as string | undefined
    )?.toLowerCase();

    if (healthStatus === "nominal") {
      // ── Tier 1 stop ──────────────────────────────────────────────
      const durationMs = Date.now() - startedAt;
      await db.insert(agentRuns).values({
        runId,
        agentName: "monitor",
        input: { holdingsCount: rows.length, trigger: "cron" },
        output: monitorResult as Record<string, unknown>,
        reasoning: JSON.stringify(monitorResult, null, 2),
        tokensUsed: null,
        durationMs,
      });
      console.log(
        `[scheduler] Tier 1 completed — nominal, runId=${runId}, duration=${durationMs}ms`,
      );
      return;
    }

    // ── Tier 2: full workflow ──────────────────────────────────
    console.log(
      `[scheduler] Tier 2 escalated — health=${healthStatus}, runId=${runId}`,
    );

    const tickers = rows.map((r) => r.ticker);
    try {
      await ingestNewsHeadlines(tickers);
    } catch (err) {
      console.error(
        "[scheduler] News ingestion failed (non-fatal):",
        err instanceof Error ? err.message : err,
      );
    }

    const workflow = mastra.getWorkflow("portfolioFactoryWorkflow");
    const run = await workflow.createRun({ runId });
    const result = await run.start({
      inputData: {
        sectorConstraint: "diversify",
        maxTurnoverPct: 30,
        excludedTickers: [],
      },
    });
    const durationMs = Date.now() - startedAt;

    if (result.status === "success" && result.result) {
      await db.insert(agentRuns).values({
        runId,
        agentName: "workflow",
        input: {
          holdingsCount: rows.length,
          trigger: "cron",
          sectorConstraint: "diversify",
        },
        output: result.result as Record<string, unknown>,
        reasoning: JSON.stringify(result.result, null, 2),
        tokensUsed: null,
        durationMs,
      });
      console.log(
        `[scheduler] Tier 2 completed — runId=${runId}, duration=${durationMs}ms`,
      );
    } else {
      console.error(
        `[scheduler] Tier 2 failed — runId=${runId}, status=${result.status}`,
      );
    }
  } catch (err) {
    console.error(
      `[scheduler] Tick error — runId=${runId}:`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Start the cron scheduler. Safe to call multiple times — subsequent calls
 * are no-ops if a scheduler is already running.
 */
export function startScheduler(): void {
  if (scheduledTask) return;

  const cronExpr = msToCronExpression(TICK_INTERVAL_MS);
  console.log(
    `[scheduler] Starting — interval=${TICK_INTERVAL_MS}ms, cron="${cronExpr}"`,
  );

  scheduledTask = cron.schedule(cronExpr, () => void tick(), {
    name: "portfolio-factory-tick",
  });
}

/**
 * Stop the cron scheduler. Useful for graceful shutdown.
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("[scheduler] Stopped");
  }
}
