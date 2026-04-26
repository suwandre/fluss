"use client";

import { useState } from "react";
import {
	AgentTimeline,
	type AgentStepData,
} from "@/components/agents/agent-timeline";
import { RunHistoryPanel } from "@/components/agents/run-history-panel";
import { StressTestChart } from "@/components/charts/stress-test-chart";

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
	onRestoreRun,
	onRedesignViewDetails,
}: AgentReasoningPanelProps) {
	const [tab, setTab] = useState<PanelTab>("current");
	const [prefsModalOpen, setPrefsModalOpen] = useState(false);
	const riskDone = steps[3]?.status === "done";
	const showChart = riskDone && stressResults && stressResults.length > 0;

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
						<AgentTimeline steps={steps} onRedesignViewDetails={onRedesignViewDetails} />
						{steps[2]?.status === "done" && onRedesignViewDetails && (
							<button
								type="button"
								onClick={onRedesignViewDetails}
								className="mt-4 w-full py-2.5 rounded border border-border-bright bg-bg-elevated text-text font-mono text-[13px] font-medium hover:bg-bg-card hover:border-border transition-colors cursor-pointer"
							>
								View Proposal
							</button>
						)}

						{/* Stress test chart — shown after Risk Agent completes */}
						{showChart && (
							<div className="mt-4 pt-4 border-t border-border">
								<StressTestChart data={stressResults} />
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
