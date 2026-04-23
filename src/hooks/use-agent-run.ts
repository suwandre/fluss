"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentStepData } from "@/components/agents/agent-timeline";
import type { MonitorOutput } from "@/lib/agents/monitor";

const INITIAL_STEPS: AgentStepData[] = [
	{ name: "Monitor Agent", status: "queued" },
	{ name: "Bottleneck Agent", status: "queued" },
	{ name: "Redesign Agent", status: "queued" },
	{ name: "Risk Agent", status: "queued" },
];

/** Map Mastra workflow step IDs to timeline indices. */
const STEP_ID_TO_INDEX: Record<string, number> = {
	monitor: 0,
	bottleneck: 1,
	redesign: 2,
	risk: 3,
};

/**
 * Build a flat key/value summary for the AgentStep structured-output block.
 * `output` is either a MonitorOutput or the individual agent output extracted
 * from the WorkflowOutputSchema.
 */
function buildStructuredOutput(
	stepId: string,
	output: Record<string, unknown>,
): Record<string, unknown> | undefined {
	switch (stepId) {
		case "monitor":
			return {
				health: output.health_status,
				summary: output.summary,
				concerns: Array.isArray(output.concerns) ? output.concerns.length : 0,
				escalate: output.escalate,
			};
		case "bottleneck": {
			const pb = output.primary_bottleneck as
				| Record<string, unknown>
				| undefined;
			return {
				bottleneck: pb?.ticker,
				severity: pb?.severity,
				analysis: output.analysis,
			};
		}
		case "redesign": {
			const ei = output.expected_improvement as
				| Record<string, unknown>
				| undefined;
			return {
				actions: Array.isArray(output.proposed_actions)
					? output.proposed_actions.length
					: 0,
				confidence: output.confidence,
				improvement: ei?.narrative,
			};
		}
		case "risk":
			return {
				verdict: output.verdict,
				var95:
					typeof output.var_95 === "number"
						? output.var_95
						: typeof output.var_95 === "string"
							? parseFloat(output.var_95 as string) || null
							: null,
				scenarios: Array.isArray(output.stress_results)
					? output.stress_results.length
					: 0,
				caveats: output.caveats,
				risk_summary: output.risk_summary,
				improvement_summary: output.improvement_summary,
				current_avg_drawdown: output.current_avg_drawdown,
				proposed_avg_drawdown: output.proposed_avg_drawdown,
				current_max_drawdown: output.current_max_drawdown,
				proposed_max_drawdown: output.proposed_max_drawdown,
				current_concentration_score: output.current_concentration_score,
				proposed_concentration_score: output.proposed_concentration_score,
				current_var_95: output.current_var_95,
			};
		default:
			return undefined;
	}
}

export interface UseAgentRunReturn {
	steps: AgentStepData[];
	runId: string | null;
	isRunning: boolean;
	error: string | null;
	monitorOutput: MonitorOutput | null;
	workflowOutput: Record<string, unknown> | null;
	lastRunAt: Date | null;
	startRun: () => Promise<void>;
	setMonitorOutput: (v: MonitorOutput | null) => void;
	setWorkflowOutput: (v: Record<string, unknown> | null) => void;
	setRunId: (v: string | null) => void;
	setLastRunAt: (v: Date | null) => void;
	rebuildStepsFromOutput: (output: Record<string, unknown>) => void;
}

/**
 * Custom hook that POSTs to /api/agents/run and consumes the SSE UI message
 * stream. Parses Mastra workflow events to drive all 4 agent timeline slots.
 * On mount, fetches the most recent run from /api/agents/history to restore
 * lastRunAt and monitorOutput across page refreshes.
 */
export function useAgentRun(): UseAgentRunReturn {
	const [steps, setSteps] = useState<AgentStepData[]>(INITIAL_STEPS);
	const [runId, setRunId] = useState<string | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [monitorOutput, setMonitorOutput] = useState<MonitorOutput | null>(
		null,
	);
	const [workflowOutput, setWorkflowOutput] = useState<Record<
		string,
		unknown
	> | null>(null);
	const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	/** Rebuild timeline step statuses from a persisted workflow output. */
	const rebuildStepsFromOutput = useCallback(
		(output: Record<string, unknown>) => {
			const monitorResult = output.monitor as Record<string, unknown> | undefined;
			if (!monitorResult) return;

			const isNominal = monitorResult.health_status === "nominal";
			const agentKeys = ["bottleneck", "redesign", "risk"] as const;

			setSteps(
				INITIAL_STEPS.map((s, i) => {
					if (i === 0) return { ...s, status: "done" as const };
					if (isNominal) {
						return {
							...s,
							status: "skipped" as const,
							skipReason: "Health nominal — no action needed",
						};
					}
					const agentOutput = output[agentKeys[i - 1]];
					if (agentOutput) {
						return {
							...s,
							status: "done" as const,
							structuredOutput: buildStructuredOutput(
								agentKeys[i - 1],
								agentOutput as Record<string, unknown>,
							),
						};
					}
					return {
						...s,
						status: "skipped" as const,
						skipReason: "Health nominal — no action needed",
					};
				}),
			);
		},
		[],
	);

	// On mount, fetch the most recent run to restore lastRunAt + monitorOutput
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/api/agents/history?limit=1");
				if (!res.ok) return;
				const runs: Array<{
					runId: string;
					createdAt: string;
					healthStatus: string | null;
					summary: string | null;
					output: Record<string, unknown> | null;
				}> = await res.json();
				if (cancelled || runs.length === 0) return;

				const latest = runs[0];
				setLastRunAt(new Date(latest.createdAt));
				setRunId(latest.runId);

				// Restore monitorOutput from persisted workflow output
				if (latest.output?.monitor) {
					setMonitorOutput(latest.output.monitor as unknown as MonitorOutput);
				}

				// Restore workflowOutput for correlation matrix and stress results
				if (latest.output) {
					setWorkflowOutput(latest.output);
					rebuildStepsFromOutput(latest.output);
				}
			} catch {
				// Silently ignore — non-critical hydration from history
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const startRun = useCallback(async () => {
		// Abort any in-flight run
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		// Reset state — mark Monitor as running immediately for fast feedback
		setError(null);
		// Do not clear monitorOutput or workflowOutput here to retain previous state in UI
		setRunId(null);
		setIsRunning(true);
		setSteps(
			INITIAL_STEPS.map((s, i) =>
				i === 0 ? { ...s, status: "running" as const, isStreaming: true } : s,
			),
		);

		const stepStartTimes: Record<string, number> = { monitor: Date.now() };
		let escalationActive = false;
		const STREAM_TIMEOUT_MS = 90_000;

		try {
			const response = await fetch("/api/agents/run", {
				method: "POST",
				signal: controller.signal,
			});

			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw new Error(
					(body as Record<string, string>).error || `HTTP ${response.status}`,
				);
			}

			// Read SSE stream from response body
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let lastActivity = Date.now();

			// eslint-disable-next-line no-constant-condition
			while (true) {
				// Timeout check — if no data arrives for STREAM_TIMEOUT_MS, abort
				const readResult = await Promise.race([
					reader.read(),
					new Promise<never>((_, reject) =>
						setTimeout(
							() =>
								reject(
									new Error(
										"Agent stream timed out — no data received. Try again.",
									),
								),
							STREAM_TIMEOUT_MS - (Date.now() - lastActivity),
						),
					),
				]);
				const { done, value } = readResult;
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				// Split on newline (SSE event boundary)
				const events = buffer.split("\n");
				buffer = events.pop()!; // keep incomplete trailing line

				for (const line of events) {
					const trimmed = line.trim();
					if (!trimmed.startsWith("data: ")) continue;
					const payload = trimmed.slice(6);
					if (payload === "[DONE]") continue;

					let event: Record<string, unknown>;
					try {
						event = JSON.parse(payload);
					} catch {
						continue; // skip malformed JSON
					}

					// Only reset activity timer on real events, not keepalives
					if (event.type !== "data-keepalive") {
						lastActivity = Date.now();
					}

					// Extract runId from custom data part
					if (
						event.type === "data-run-id" &&
						typeof (event.data as Record<string, string>)?.runId === "string"
					) {
						setRunId((event.data as Record<string, string>).runId);
					}

					// ── Parse Mastra workflow stream events ──────────────────
					if (event.type === "data-workflow-event" && event.data) {
						const wfEvent = event.data as Record<string, unknown>;
						const wfType = wfEvent.type as string;
						const wfPayload = wfEvent.payload as
							| Record<string, unknown>
							| undefined;
						const stepId = wfPayload?.id as string | undefined;
						const timelineIndex = stepId ? STEP_ID_TO_INDEX[stepId] : undefined;

						// Handle workflow-step-start
						if (
							wfType === "workflow-step-start" &&
							timelineIndex !== undefined
						) {
							// Only mark as running for Monitor or when escalation is active
							if (timelineIndex === 0 || escalationActive) {
								stepStartTimes[stepId!] = Date.now();
								setSteps((prev) =>
									prev.map((s, i) =>
										i === timelineIndex
											? { ...s, status: "running" as const, isStreaming: true }
											: s,
									),
								);
							}
						}

						// Handle workflow-step-result
						if (
							wfType === "workflow-step-result" &&
							timelineIndex !== undefined &&
							wfPayload
						) {
							const output = wfPayload.output as
								| Record<string, unknown>
								| undefined;
							const durationMs = stepStartTimes[stepId!]
								? Date.now() - stepStartTimes[stepId!]
								: undefined;

							if (timelineIndex === 0 && output) {
								// Monitor step completed — set output and check health
								const monitorResult = output as unknown as MonitorOutput;
								setMonitorOutput(monitorResult);
								escalationActive = monitorResult.health_status !== "nominal";

								setSteps((prev) =>
									prev.map((s, i) =>
										i === 0
											? {
													...s,
													status: "done" as const,
													isStreaming: false,
													durationMs,
													structuredOutput: buildStructuredOutput(
														"monitor",
														output,
													),
												}
											: i > 0 && !escalationActive
												? {
															...s,
															status: "skipped" as const,
															skipReason: "Health nominal — no action needed",
														}
												: s,
									),
								);
							} else if (timelineIndex > 0 && escalationActive && output) {
								// Agent step completed in escalation path
								const agentKey = stepId!;
								const agentOutput = output[agentKey] as Record<
									string,
									unknown
								> | null;

								if (agentOutput) {
									setWorkflowOutput(output);
									setSteps((prev) =>
										prev.map((s, i) =>
											i === timelineIndex
												? {
														...s,
														status: "done" as const,
														isStreaming: false,
														durationMs,
														structuredOutput: buildStructuredOutput(
															stepId!,
															agentOutput,
														),
													}
												: s,
										),
									);
								}
							}
						}
					}

					// Surface stream errors
					if (event.type === "error" && typeof event.errorText === "string") {
						throw new Error(event.errorText);
					}
				}
			}

			// Stream complete
			setLastRunAt(new Date());
		} catch (err) {
			if ((err as Error).name === "AbortError") return;
			const message = err instanceof Error ? err.message : "Agent run failed";
			setError(message);
			setSteps((prev) =>
				prev.map((s) =>
					s.status === "running"
						? {
								...s,
								status: "error" as const,
								isStreaming: false,
								errorMessage: message,
							}
						: s,
				),
			);
		} finally {
			setIsRunning(false);
		}
	}, []);

	return {
		steps,
		runId,
		isRunning,
		error,
		monitorOutput,
		workflowOutput,
		lastRunAt,
		startRun,
		setMonitorOutput,
		setWorkflowOutput,
		setRunId,
		setLastRunAt,
		rebuildStepsFromOutput,
	};
}
