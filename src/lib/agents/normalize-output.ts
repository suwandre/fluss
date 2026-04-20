import { z } from "zod";
import { MonitorOutput } from "./monitor";

// ── Raw text parsing ────────────────────────────────────────────────

/** Strip markdown code fences and parse JSON from raw LLM text. */
export function parseRawAgentText(text: string): unknown {
	const cleaned = text
		.replace(/^```(?:json)?\s*\n?/i, "")
		.replace(/\n?```\s*$/i, "")
		.trim();

	try {
		return JSON.parse(cleaned);
	} catch {
		return null;
	}
}

// ── Monitor output normalization ────────────────────────────────────

/**
 * Normalize LLM output that doesn't match MonitorOutput schema.
 * Models like minimax-m2.5:cloud often return their own field names
 * (e.g. "status": "UNHEALTHY" instead of "health_status": "critical").
 */
export function normalizeMonitorOutput(
	raw: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...raw };

	// ── health_status ──
	if (!result.health_status) {
		const status = result.status as string | undefined;
		const healthScore = result.healthScore as number | undefined;

		if (status) {
			const lower = status.toLowerCase();
			if (
				lower === "unhealthy" ||
				lower === "critical" ||
				lower === "bad" ||
				lower === "danger"
			) {
				result.health_status = "critical";
			} else if (
				lower === "healthy" ||
				lower === "nominal" ||
				lower === "good" ||
				lower === "ok"
			) {
				result.health_status = "nominal";
			} else if (
				lower === "warning" ||
				lower === "moderate" ||
				lower === "caution" ||
				lower === "at_risk"
			) {
				result.health_status = "warning";
			}
		} else if (typeof healthScore === "number") {
			if (healthScore <= 3) result.health_status = "critical";
			else if (healthScore <= 6) result.health_status = "warning";
			else result.health_status = "nominal";
		}
	}

	// ── portfolio_metrics ──
	if (!result.portfolio_metrics || typeof result.portfolio_metrics !== "object") {
		const portfolioValue = result.portfolioValue as number | undefined;
		const totalPnlPct = result.totalPnlPct as number | undefined;

		if (portfolioValue !== undefined) {
			const assets = result.assets as
				| Array<Record<string, unknown>>
				| undefined;
			let largestPositionPct = 0;
			let maxDrawdownPct = 0;

			if (Array.isArray(assets)) {
				for (const asset of assets) {
					const alloc = (asset.allocationPct as number) ?? 0;
					if (alloc > largestPositionPct) largestPositionPct = alloc;
					const dd = (asset.drawdownPct as number) ?? 0;
					if (dd > maxDrawdownPct) maxDrawdownPct = dd;
				}
			}

			result.portfolio_metrics = {
				total_value: portfolioValue,
				unrealised_pnl_pct: totalPnlPct ?? 0,
				sharpe_ratio: null,
				max_drawdown_pct: maxDrawdownPct,
				largest_position_pct: largestPositionPct,
			};
		}
	}

	// ── concerns ──
	if (!Array.isArray(result.concerns)) {
		const risks = result.risks as
			| Array<Record<string, unknown>>
			| undefined;
		if (Array.isArray(risks)) {
			result.concerns = risks.map(
				(r) =>
					(r.description as string) || (r.type as string) || String(r),
			);
		} else {
			result.concerns = [];
		}
	}

	// ── escalate ──
	if (typeof result.escalate !== "boolean") {
		const hs = result.health_status as string | undefined;
		result.escalate = hs === "critical" || hs === "warning";
	}

	// ── summary ──
	if (typeof result.summary !== "string") {
		const rec = result.recommendation as string | undefined;
		if (typeof rec === "string" && rec.length > 0) {
			result.summary = rec;
		} else {
			const hs = result.health_status as string;
			const concernList = result.concerns as string[];
			result.summary =
				concernList.length > 0
					? `Portfolio health: ${hs}. Concerns: ${concernList.join("; ")}`
					: `Portfolio health: ${hs}. No concerns identified.`;
		}
	}

	// ── asset_health ──
	if (!Array.isArray(result.asset_health)) {
		const assets = result.assets as
			| Array<Record<string, unknown>>
			| undefined;

		if (Array.isArray(assets)) {
			const globalHealth = result.health_status as string;
			result.asset_health = assets.map((asset) => {
				const ticker = (asset.ticker as string) || "UNKNOWN";
				const pnlPct = (asset.pnlPct as number) ?? 0;
				const drawdownPct = (asset.drawdownPct as number) ?? 0;

				let health: "nominal" | "warning" | "critical" = "nominal";
				if (drawdownPct > 15 || (globalHealth === "critical" && pnlPct < 0)) {
					health = "critical";
				} else if (drawdownPct > 10 || pnlPct < -5) {
					health = "warning";
				}

				return { ticker, health };
			});
		} else {
			result.asset_health = [];
		}
	}

	// Clean extra fields
	delete result.status;
	delete result.healthScore;
	delete result.recommendation;
	delete result.portfolioValue;
	delete result.costBasis;
	delete result.totalPnlPct;
	delete result.assets;
	delete result.risks;

	return result;
}

/**
 * Try to parse and normalize any raw agent output into MonitorOutput.
 * Returns null if normalization + validation fails.
 */
export function tryNormalizeMonitorOutput(
	raw: unknown,
): z.infer<typeof MonitorOutput> | null {
	if (!raw || typeof raw !== "object") return null;

	try {
		const normalized = normalizeMonitorOutput(
			raw as Record<string, unknown>,
		);
		return MonitorOutput.parse(normalized);
	} catch {
		return null;
	}
}

// ── Generic structured output recovery ──────────────────────────────

type AgentLike = {
	generate: (
		prompt: string,
		opts: Record<string, unknown>,
	) => Promise<{ object?: unknown; text: string }>;
};

/**
 * Recover from a structuredOutput validation error by re-generating
 * without structured output, parsing the raw text, normalizing, and
 * validating against the schema.
 */
export async function recoverStructuredOutput<T>(
	agent: AgentLike,
	prompt: string,
	schema: z.ZodType<T>,
	normalizer: (raw: Record<string, unknown>) => Record<string, unknown>,
	memoryConfig: Record<string, unknown>,
): Promise<T> {
	const rawResult = await agent.generate(prompt, {
		...memoryConfig,
		modelSettings: { maxOutputTokens: 4096 },
		activeTools: [],
	});

	const parsed = parseRawAgentText(rawResult.text);
	if (!parsed || typeof parsed !== "object") {
		throw new Error(
			"Structured output recovery failed: could not parse raw text as JSON",
		);
	}

	const normalized = normalizer(parsed as Record<string, unknown>);
	return schema.parse(normalized);
}

/**
 * Is the error a structured output schema validation failure?
 */
export function isStructuredOutputError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return err.message.includes("Structured output validation failed");
}