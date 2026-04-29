"use client";

import { useState } from "react";
import {
	AgentTimeline,
	type AgentStepData,
} from "@/components/agents/agent-timeline";
import { RunHistoryPanel } from "@/components/agents/run-history-panel";

import { cn } from "@/lib/utils";
import {
	RebalancePreferencesModal,
	type RebalancePreferences,
} from "@/components/agents/rebalance-preferences-modal";

interface StressResult {
	scenario: string;
	simulated_drawdown_pct: number;
	recovery_days: number | null;
}

interface RiskMetrics {
	current_var_95?: number | null;
	proposed_var_95?: number | null;
	current_avg_drawdown?: number | null;
	proposed_avg_drawdown?: number | null;
	current_max_drawdown?: number | null;
	proposed_max_drawdown?: number | null;
}

interface HistoryRun {
	runId: string;
	createdAt: string;
	durationMs: number | null;
	healthStatus: string | null;
	summary: string | null;
	output: Record<string, unknown> | null;
}

interface AgentReasoningPanelProps {
	steps: AgentStepData[];
	runId?: string | null;
	isRunning?: boolean;
	error?: string | null;
	onRun?: (preferences?: RebalancePreferences) => void;
	stressResults?: StressResult[] | null;
	riskMetrics?: RiskMetrics | null;
	riskStructuredOutput?: Record<string, unknown> | null;
	onRestoreRun?: (run: HistoryRun) => void;
	onRedesignViewDetails?: () => void;
}

type PanelTab = "current" | "history";

/**
 * Right sidebar panel: header with "Agent Reasoning" title + run ID badge,
 * tab toggle between current run and history, scrollable body.
 * Collapse toggle is a visual placeholder only — collapsed ~48px icon-strip
 * state is deferred per V §6.2.
 */
export function AgentReasoningPanel({
	steps,
	runId,
	isRunning,
	error,
	onRun,
	stressResults,
	riskMetrics,
	riskStructuredOutput,
	onRestoreRun,
	onRedesignViewDetails,
}: AgentReasoningPanelProps) {
	const [tab, setTab] = useState<PanelTab>("current");
	const [prefsModalOpen, setPrefsModalOpen] = useState(false);
	const riskDone = steps[3]?.status === "done";
	const showDecisionSupport = riskDone && (Boolean(riskMetrics) || Boolean(stressResults?.length));

	const handleSelectRun = (run: HistoryRun) => {
		onRestoreRun?.(run);
		setTab("current");
	};

	const allDone = steps.length > 0 && steps.every((s) => s.status === "done");
	const riskVerdict = typeof steps[3]?.structuredOutput?.verdict === "string"
		? steps[3].structuredOutput.verdict.toLowerCase()
		: null;
	const isApproved = allDone && (riskVerdict === "approved" || riskVerdict === "approved_with_caveats" || riskVerdict === "approve" || riskVerdict === "approve_with_caveats");
	const isRejected = allDone && (riskVerdict === "rejected" || riskVerdict === "reject");

	return (
	<>
		<aside
			className="flex flex-col min-w-[340px] max-w-[420px] flex-[3] border-l border-border bg-bg-card overflow-hidden"
			aria-label="Agent reasoning panel"
		>
			{/* Header */}
			<div className="flex items-center gap-2 px-4 h-10 border-b border-border shrink-0">
				<h2 className="text-[13px] font-semibold text-text leading-tight uppercase tracking-[0.04em]">
					Agent Reasoning
				</h2>
				{runId && tab === "current" && (
					<span className="text-[11px] font-mono text-text-dim bg-bg-elevated px-1.5 py-0.5 rounded select-none">
						{runId.slice(0, 8)}
					</span>
				)}

				{/* Collapse toggle placeholder — visual button only, not wired */}
				<button
					className="p-1 text-text-dim hover:text-text transition-colors cursor-pointer"
					aria-label="Toggle panel (not implemented)"
					title="Collapse panel"
					type="button"
				>
					<ChevronRightIcon />
				</button>

				{/* Tab toggle */}
				<div className="ml-auto flex items-center gap-0.5 rounded bg-bg-elevated p-0.5">
					<TabButton
						active={tab === "current"}
						onClick={() => setTab("current")}
						label="Current"
					/>
					<TabButton
						active={tab === "history"}
						onClick={() => setTab("history")}
						label="History"
					/>
				</div>

				{/* Run trigger */}
				{onRun && tab === "current" && (
					<button
						onClick={() => setPrefsModalOpen(true)}
						disabled={isRunning}
						className="px-2.5 py-1 text-[11px] font-mono rounded border border-border bg-bg-elevated text-text-dim hover:text-text hover:border-border-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
						type="button"
					>
						{isRunning ? "Running…" : "▶ Run"}
					</button>
				)}
			</div>

			{/* Error banner */}
			{error && tab === "current" && (
				<div className="px-4 py-2 text-[11px] font-mono text-red bg-bg-elevated border-b border-border">
					{error}
				</div>
			)}

			{/* Body */}
			{tab === "current" ? (
				<div className="flex-1 overflow-y-auto custom-scrollbar">
					<div className="p-4">
						<PipelineStatusBar steps={steps} />
						{isApproved ? (
							<div className="mb-4 space-y-2">
								<button
									type="button"
									className="w-full py-2 rounded bg-green/20 border border-green/30 text-green font-mono text-[13px] font-medium hover:bg-green/30 transition-colors cursor-pointer"
								>
									Apply Redesign
								</button>
								<button
									type="button"
									className="w-full py-1.5 rounded border border-border bg-bg-elevated text-text-dim font-mono text-[12px] hover:text-text hover:border-border-bright transition-colors cursor-pointer"
								>
									Keep Current Portfolio
								</button>
							</div>
						) : isRejected ? (
							<div className="mb-4 rounded border-l-2 border-amber bg-bg-elevated px-3 py-2 text-[12px] font-sans text-text">
								⚠️ Redesign rejected. No changes needed.
								<div className="mt-2 block">
									<button
										type="button"
										onClick={() => onRun?.()}
										className="px-2 py-1 text-[11px] font-mono rounded border border-border bg-bg-elevated text-text-dim hover:text-text transition-colors cursor-pointer"
									>
										Try Again
									</button>
								</div>
							</div>
						) : (
							<RunSummary steps={steps} />
						)}
						<AgentTimeline steps={steps} />
						{steps[2]?.status === "done" && onRedesignViewDetails && (
							<button
								type="button"
								onClick={onRedesignViewDetails}
								className="mt-4 w-full py-2.5 rounded border border-border-bright bg-bg-elevated text-text font-mono text-[13px] font-medium hover:bg-bg-card hover:border-border transition-colors cursor-pointer"
							>
								View Proposal
							</button>
						)}

						{/* Decision support — shown after Risk Agent completes */}
						{showDecisionSupport && (
							<div className="mt-4 pt-4 border-t border-border">
								<DecisionSupport
									steps={steps}
									stressResults={stressResults ?? []}
									riskMetrics={riskMetrics ?? null}
									riskStructuredOutput={riskStructuredOutput ?? null}
								/>
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="flex-1 overflow-hidden">
					<RunHistoryPanel
						onSelectRun={handleSelectRun}
						selectedRunId={runId}
					/>
				</div>
			)}
		</aside>

		{onRun && (
			<RebalancePreferencesModal
				open={prefsModalOpen}
				onOpenChange={setPrefsModalOpen}
				onConfirm={(prefs) => onRun(prefs)}
			/>
		)}
	</>
	);
}


function formatLossPercent(value: number): string {
	const abs = Math.abs(value).toFixed(1);
	if (abs === "0.0") return "0.0%";
	return `-${abs}%`;
}

function getMetricRows(riskMetrics: RiskMetrics | null) {
	if (!riskMetrics) return [];

	const rows = [
		{
			label: "VaR 95",
			current: riskMetrics.current_var_95,
			proposed: riskMetrics.proposed_var_95,
		},
		{
			label: "Avg stress DD",
			current: riskMetrics.current_avg_drawdown,
			proposed: riskMetrics.proposed_avg_drawdown,
		},
		{
			label: "Max stress DD",
			current: riskMetrics.current_max_drawdown,
			proposed: riskMetrics.proposed_max_drawdown,
		},
	];

	return rows.filter(
		(row): row is { label: string; current: number; proposed: number } =>
			typeof row.current === "number" && typeof row.proposed === "number",
	);
}

function getWorstStressResult(stressResults: StressResult[]) {
	if (stressResults.length === 0) return null;
	return stressResults.reduce((worst, current) =>
		Math.abs(current.simulated_drawdown_pct) >
		Math.abs(worst.simulated_drawdown_pct)
			? current
			: worst,
	);
}

function getRiskNotes({
	steps,
	stressResults,
	riskMetrics,
	riskStructuredOutput,
}: {
	steps: AgentStepData[];
	stressResults: StressResult[];
	riskMetrics: RiskMetrics | null;
	riskStructuredOutput: Record<string, unknown> | null;
}) {
	const notes: Array<{ text: string; tone: "red" | "amber" | "green" }> = [];
	const caveats = Array.isArray(riskStructuredOutput?.caveats)
		? (riskStructuredOutput.caveats as unknown[]).filter(
				(caveat): caveat is string => typeof caveat === "string",
			)
		: [];

	for (const caveat of caveats.slice(0, 2)) {
		notes.push({ text: caveat, tone: "amber" });
	}

	const bottleneck = steps[1]?.structuredOutput?.bottleneck;
	const severity = steps[1]?.structuredOutput?.severity;
	if (typeof bottleneck === "string" && typeof severity === "string") {
		notes.push({
			text: `${bottleneck} remains primary bottleneck (${severity})`,
			tone: severity.toLowerCase() === "high" ? "red" : "amber",
		});
	}

	const proposedMaxDrawdown = riskMetrics?.proposed_max_drawdown;
	if (typeof proposedMaxDrawdown === "number") {
		const absoluteDrawdown = Math.abs(proposedMaxDrawdown);
		if (absoluteDrawdown >= 25) {
			notes.push({
				text: `Max stress drawdown still critical at ${formatLossPercent(proposedMaxDrawdown)}`,
				tone: "red",
			});
		} else if (absoluteDrawdown >= 15) {
			notes.push({
				text: `Stress losses remain material at ${formatLossPercent(proposedMaxDrawdown)}`,
				tone: "amber",
			});
		}
	}

	const worst = getWorstStressResult(stressResults);
	if (worst) {
		notes.push({
			text: `Worst scenario: ${worst.scenario}`,
			tone: "amber",
		});
	}

	if (notes.length === 0) {
		return [{ text: "No major caveats surfaced.", tone: "green" as const }];
	}

	return notes.slice(0, 3);
}

function DecisionSupport({
	steps,
	stressResults,
	riskMetrics,
	riskStructuredOutput,
}: {
	steps: AgentStepData[];
	stressResults: StressResult[];
	riskMetrics: RiskMetrics | null;
	riskStructuredOutput: Record<string, unknown> | null;
}) {
	const metricRows = getMetricRows(riskMetrics);
	const riskNotes = getRiskNotes({
		steps,
		stressResults,
		riskMetrics,
		riskStructuredOutput,
	});

	return (
		<div className="space-y-3">
			{metricRows.length > 0 && (
				<div>
					<div className="text-[10px] font-mono text-text-dim uppercase tracking-wide mb-2">
						Before / After
					</div>
					<div className="rounded border border-border bg-bg-elevated divide-y divide-border/60">
						{metricRows.map((row) => {
							const current = Math.abs(row.current);
							const proposed = Math.abs(row.proposed);
							const delta = proposed - current;
							const improved = delta < 0;
							const worsened = delta > 0;
							const deltaClass = improved
								? "text-green"
								: worsened
									? "text-red"
									: "text-text-dim";
							const deltaLabel = improved
								? `${Math.abs(delta).toFixed(1)}pp better`
								: worsened
									? `${Math.abs(delta).toFixed(1)}pp worse`
									: "No change";

							return (
								<div
									key={row.label}
									className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-[12px] font-mono"
								>
									<span className="text-text-dim">{row.label}</span>
									<div className="text-right">
										<div className="text-text">
											{formatLossPercent(row.current)}
											<span className="mx-1.5 text-text-muted">-&gt;</span>
											<span className={improved ? "text-green" : "text-teal"}>
												{formatLossPercent(row.proposed)}
											</span>
										</div>
										<div className={`text-[10px] ${deltaClass}`}>
											{deltaLabel}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			<div>
				<div className="text-[10px] font-mono text-text-dim uppercase tracking-wide mb-2">
					Key Risks
				</div>
				<div className="space-y-1.5">
					{riskNotes.map((note) => (
						<div
							key={note.text}
							className={cn(
								"rounded border px-2.5 py-2 text-[11px] font-mono leading-snug",
								note.tone === "red" &&
									"border-red/20 bg-red/5 text-red",
								note.tone === "amber" &&
									"border-amber/20 bg-amber/5 text-amber",
								note.tone === "green" &&
									"border-green/20 bg-green/5 text-green",
							)}
						>
							{note.text}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function PipelineStatusBar({ steps }: { steps: AgentStepData[] }) {
	const labels = ["Monitor", "Bottleneck", "Redesign", "Risk", "Final"];
	return (
		<div className="grid grid-cols-5 gap-1 mb-4 py-3 px-3 rounded border border-border bg-bg-elevated">
			{labels.map((label, i) => {
				const step = steps[i];
				const isDone = step?.status === "done";
				const isRunning = step?.status === "running";
				const isError = step?.status === "error";
				const isLast = i === 4;

				let finalGreen = false;
				if (isLast) {
					const allDone = steps.length >= 4 && steps.slice(0, 4).every(s => s.status === "done");
					const riskVerdict = String(steps[3]?.structuredOutput?.verdict ?? "").toLowerCase();
					finalGreen = allDone && (riskVerdict === "approved" || riskVerdict === "approved_with_caveats" || riskVerdict === "approve" || riskVerdict === "approve_with_caveats");
				}

				let dotClass = "bg-bg-card border-text-muted";
				let labelColor = "text-text-dim";
				if (isLast) {
					if (finalGreen) {
						dotClass = "bg-green border-green";
						labelColor = "text-green";
					} else {
						dotClass = "bg-bg-card border-text-muted";
						labelColor = "text-text-dim";
					}
				} else if (isDone) {
					dotClass = "bg-green border-green";
					labelColor = "text-green";
				} else if (isRunning) {
					dotClass = "bg-amber border-amber animate-pulse";
					labelColor = "text-amber";
				} else if (isError) {
					dotClass = "bg-red border-red";
					labelColor = "text-red";
				}

				return (
					<div key={label} className="flex flex-col items-center gap-1">
						<div className={`size-4 rounded-full border flex items-center justify-center ${dotClass}`}>
							{(isDone || (isLast && finalGreen)) && (
								<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
									<path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							)}
						</div>
						<span className={`text-[10px] font-mono uppercase tracking-wide text-center truncate ${labelColor}`}>{label}</span>
					</div>
				);
			})}
		</div>
	);
}

function RunSummary({ steps }: { steps: AgentStepData[] }) {
	const allDone = steps.length > 0 && steps.every((s) => s.status === "done");
	const riskStep = steps[3];
	const verdict =
		typeof riskStep?.structuredOutput?.verdict === "string"
			? riskStep.structuredOutput.verdict
			: null;

	if (!allDone) {
		const anyRunning = steps.some((s) => s.status === "running");
		if (anyRunning) {
			return (
				<div className="mb-4 rounded border-l-2 border-amber bg-bg-elevated px-3 py-2 text-[12px] font-sans leading-relaxed text-text">
					<span className="font-medium">Analysis in progress…</span>{" "}
					Agents are still evaluating your portfolio. Summary will appear here when complete.
				</div>
			);
		}
		return null;
	}

	if (!verdict) return null;

	const lower = verdict.toLowerCase();

	const styles: Record<
		string,
		{ border: string; icon: string; text: string }
	> = {
		approved: {
			border: "border-green",
			icon: "✅",
			text: "The proposed rebalancing is approved. The Risk Agent found the changes safe to execute.",
		},
		approve: {
			border: "border-green",
			icon: "✅",
			text: "The proposed rebalancing is approved. The Risk Agent found the changes safe to execute.",
		},
		approved_with_caveats: {
			border: "border-amber",
			icon: "⚠️",
			text: "Approved with caveats. The changes are acceptable, but review the warnings below before proceeding.",
		},
		approve_with_caveats: {
			border: "border-amber",
			icon: "⚠️",
			text: "Approved with caveats. The changes are acceptable, but review the warnings below before proceeding.",
		},
		rejected: {
			border: "border-red",
			icon: "❌",
			text: "Rejected. The proposed rebalancing is too risky. Your current portfolio is unchanged — no action needed.",
		},
		reject: {
			border: "border-red",
			icon: "❌",
			text: "Rejected. The proposed rebalancing is too risky. Your current portfolio is unchanged — no action needed.",
		},
	};

	const config = styles[lower] ?? null;
	if (!config) return null;

	const improvement =
		typeof riskStep?.structuredOutput?.improvement_summary === "string"
			? (riskStep.structuredOutput.improvement_summary as string)
			: null;
	const hasImprovement =
		improvement != null &&
		/improved|better|lower|delta|→/.test(improvement.toLowerCase());

	let text = config.text;
	if (lower === "rejected" && hasImprovement) {
		text = `Risk Agent blocked this rebalancing, BUT your current portfolio is even riskier. ${improvement}. Consider an even more conservative redesign.`;
	}

	return (
		<div
			className={cn(
				"mb-4 rounded border-l-2 bg-bg-elevated px-3 py-2 text-[12px] font-sans leading-relaxed text-text",
				config.border,
			)}
		>
			<span className="font-medium">
				{config.icon} What this means for you
			</span>
			<br />
			{text}
		</div>
	);
}

function TabButton({
	active,
	onClick,
	label,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors cursor-pointer ${
				active
					? "bg-bg-card text-text shadow-sm"
					: "text-text-dim hover:text-text"
			}`}
		>
			{label}
		</button>
	);
}

function ChevronRightIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M9 3L5 7L9 11"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
