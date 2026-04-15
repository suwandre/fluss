import cron, { type ScheduledTask } from "node-cron";
import { mastra } from "@/lib/mastra";
import { db } from "@/lib/db";
import { holdings, agentRuns } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { ingestNewsHeadlines } from "@/lib/market/news-rag";

// ── Config ──────────────────────────────────────────────────────────
const TICK_INTERVAL_MS = parseInt(
	process.env.ORCHESTRATOR_TICK_INTERVAL_MS ?? "900000",
	10,
); // default 15 min

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

/**
 * Execute one orchestrator tick: ingest news, fetch holdings, run the workflow, persist result.
 * Skipped if a previous tick is still in progress (prevents overlap).
 */
async function tick(): Promise<void> {
	if (isRunning) {
		console.log("[scheduler] Tick skipped — previous run still in progress");
		return;
	}

	// Check if there are holdings before running
	const rows = await db.select().from(holdings);
	if (rows.length === 0) {
		console.log("[scheduler] Tick skipped — no holdings in portfolio");
		return;
	}

	isRunning = true;
	const runId = randomUUID();
	const startedAt = Date.now();

	console.log(
		`[scheduler] Tick started — runId=${runId}, holdings=${rows.length}`,
	);

	try {
		// Ingest latest news headlines for portfolio tickers (RAG context)
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
		const result = await run.start({ inputData: {} });
		const durationMs = Date.now() - startedAt;

		if (result.status === "success" && result.result) {
			await db.insert(agentRuns).values({
				runId,
				agentName: "workflow",
				input: { holdingsCount: rows.length, trigger: "cron" },
				output: result.result as Record<string, unknown>,
				reasoning: JSON.stringify(result.result, null, 2),
				tokensUsed: null,
				durationMs,
			});
			console.log(
				`[scheduler] Tick completed — runId=${runId}, duration=${durationMs}ms`,
			);
		} else {
			console.error(
				`[scheduler] Tick failed — runId=${runId}, status=${result.status}`,
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
