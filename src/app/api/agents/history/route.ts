import { db } from "@/lib/db";
import { agentRuns } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

/**
 * GET /api/agents/history
 * Returns the most recent agent run results for the workflow.
 * Query params:
 *   ?limit=N  — max runs to return (default 10)
 */
export async function GET(req: Request) {
	const url = new URL(req.url);
	const limit = Math.min(
		parseInt(url.searchParams.get("limit") ?? "10", 10),
		50,
	);

	const runs = await db
		.select()
		.from(agentRuns)
		.where(eq(agentRuns.agentName, "workflow"))
		.orderBy(desc(agentRuns.createdAt))
		.limit(limit);

	const results = runs.map((run) => {
		const output = run.output as Record<string, unknown> | null;
		const monitor = (output?.monitor as Record<string, unknown>) ?? null;

		return {
			runId: run.runId,
			createdAt: run.createdAt.toISOString(),
			durationMs: run.durationMs,
			healthStatus: (monitor?.health_status as string) ?? null,
			summary: (monitor?.summary as string) ?? null,
			output,
		};
	});

	return Response.json(results);
}
