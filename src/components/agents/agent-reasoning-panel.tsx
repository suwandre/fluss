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

interface CurrentAllocation {
	ticker: string;
	weight: number;
}

interface ProposedAction {
	action?: "reduce" | "increase" | "replace" | "add" | "remove";
	ticker: string;
	target_pct: number;
	rationale?: string;
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
	currentAllocations?: CurrentAllocation[];
	proposedActions?: ProposedAction[];
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
	currentAllocations = [],
	proposedActions = [],
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

						{/* Decision support — shown after Risk Agent completes */}
						{showDecisionSupport && (
							<div className="mt-4 pt-4 border-t border-border">
								<DecisionSupport
									steps={steps}
									riskMetrics={riskMetrics ?? null}
									currentAllocations={currentAllocations}
									proposedActions={proposedActions}
									riskStructuredOutput={riskStructuredOutput ?? null}
								/>
							</div>
						)}

						{steps[2]?.status === "done" && onRedesignViewDetails && (
							<button
								type="button"
								onClick={onRedesignViewDetails}
								className="mt-3 w-full rounded border border-teal/40 bg-teal/15 px-3 py-2.5 text-left font-mono text-[12px] font-medium text-teal transition-colors hover:bg-teal/25 hover:text-teal cursor-pointer"
							>
								<span className="block text-[13px]">Review Proposals</span>
								<span className="mt-0.5 block text-[10px] font-normal text-teal/70">
									Compare 3 options, risk, and return
								</span>
							</button>
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

function formatSignedPercent(value: number): string {
	if (Math.abs(value).toFixed(1) === "0.0") return "0.0%";
	const sign = value > 0 ? "+" : "";
	return `${sign}${value.toFixed(1)}%`;
}

function getStepProposedActions(steps: AgentStepData[]): ProposedAction[] {
	const actions = steps[2]?.structuredOutput?.proposed_actions;
	if (!Array.isArray(actions)) return [];

	return actions.filter((action): action is ProposedAction => {
		if (!action || typeof action !== "object") return false;
		const candidate = action as Record<string, unknown>;
		return (
			typeof candidate.ticker === "string" &&
			typeof candidate.target_pct === "number"
		);
	});
}

function getAllocationRows(
	currentAllocations: CurrentAllocation[],
	proposedActions: ProposedAction[],
) {
	const currentWeightMap = new Map<string, number>();
	for (const allocation of currentAllocations) {
		currentWeightMap.set(allocation.ticker.toUpperCase(), allocation.weight);
	}

	const proposedActionMap = new Map<string, ProposedAction>();
	for (const action of proposedActions) {
		proposedActionMap.set(action.ticker.toUpperCase(), action);
	}

	const tickers = new Set<string>();
	for (const allocation of currentAllocations) {
		tickers.add(allocation.ticker.toUpperCase());
	}
	for (const ticker of proposedActionMap.keys()) {
		tickers.add(ticker);
	}

	const proposedWeightMap = new Map<string, number>();
	for (const ticker of tickers) {
		const action = proposedActionMap.get(ticker);
		const current = currentWeightMap.get(ticker) ?? 0;
		const target = action
			? action.action === "remove"
				? 0
				: Math.max(action.target_pct, 0)
			: current;
		proposedWeightMap.set(ticker, target);
	}

	const totalWeight = Array.from(proposedWeightMap.values()).reduce(
		(sum, weight) => sum + weight,
		0,
	);
	const scale = totalWeight > 0 ? 100 / totalWeight : 1;

	return Array.from(tickers)
		.map((ticker) => {
			const action = proposedActionMap.get(ticker);
			const current = currentWeightMap.get(ticker) ?? 0;
			const proposed = (proposedWeightMap.get(ticker) ?? 0) * scale;
			return {
				ticker: action?.ticker ?? ticker,
				action: action?.action,
				current,
				proposed,
				delta: proposed - current,
				hasAction: Boolean(action),
			};
		})
		.filter((row) => row.hasAction || Math.abs(row.delta) >= 0.05)
		.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function getVerdictSummary(steps: AgentStepData[]) {
	const verdict = typeof steps[3]?.structuredOutput?.verdict === "string"
		? steps[3].structuredOutput.verdict.toLowerCase()
		: null;

	if (verdict === "rejected" || verdict === "reject") {
		return {
			label: "Blocked",
			detail: "Keep current portfolio",
			tone: "red" as const,
		};
	}

	if (verdict === "approved_with_caveats" || verdict === "approve_with_caveats") {
		return {
			label: "Approved",
			detail: "Caveats attached",
			tone: "amber" as const,
		};
	}

	if (verdict === "approved" || verdict === "approve") {
		return {
			label: "Approved",
			detail: "Ready to apply",
			tone: "green" as const,
		};
	}

	return {
		label: "Complete",
		detail: "Review proposal",
		tone: "green" as const,
	};
}

function getTurnover(allocationRows: ReturnType<typeof getAllocationRows>) {
	if (allocationRows.length === 0) return null;
	return allocationRows.reduce((sum, row) => sum + Math.abs(row.delta), 0) / 2;
}

function getStressDrawdown(riskMetrics: RiskMetrics | null) {
	const current = riskMetrics?.current_max_drawdown;
	const proposed = riskMetrics?.proposed_max_drawdown;
	if (typeof current !== "number" || typeof proposed !== "number") return null;

	return {
		current: Math.abs(current),
		proposed: Math.abs(proposed),
		improvement: Math.abs(current) - Math.abs(proposed),
	};
}

function getResidualRisk({
	allocationRows,
	riskMetrics,
	riskStructuredOutput,
}: {
	allocationRows: ReturnType<typeof getAllocationRows>;
	riskMetrics: RiskMetrics | null;
	riskStructuredOutput: Record<string, unknown> | null;
}) {
	const largestPosition = allocationRows.reduce<
		{ ticker: string; proposed: number } | null
	>((largest, row) => {
		if (!largest || row.proposed > largest.proposed) {
			return { ticker: row.ticker, proposed: row.proposed };
		}
		return largest;
	}, null);

	if (largestPosition && largestPosition.proposed >= 50) {
		return `${largestPosition.ticker} still ${largestPosition.proposed.toFixed(1)}%`;
	}

	if (
		typeof riskMetrics?.proposed_max_drawdown === "number" &&
		Math.abs(riskMetrics.proposed_max_drawdown) >= 25
	) {
		return `Max stress DD ${formatLossPercent(riskMetrics.proposed_max_drawdown)}`;
	}

	const caveats = Array.isArray(riskStructuredOutput?.caveats)
		? (riskStructuredOutput.caveats as unknown[]).filter(
				(caveat): caveat is string => typeof caveat === "string",
			)
		: [];
	if (caveats.length > 0) return `${caveats.length} caveat${caveats.length === 1 ? "" : "s"}`;

	return "No major blocker";
}

function DecisionSupport({
	steps,
	riskMetrics,
	currentAllocations,
	proposedActions,
	riskStructuredOutput,
}: {
	steps: AgentStepData[];
	riskMetrics: RiskMetrics | null;
	currentAllocations: CurrentAllocation[];
	proposedActions: ProposedAction[];
	riskStructuredOutput: Record<string, unknown> | null;
}) {
	const finalProposedActions =
		proposedActions.length > 0 ? proposedActions : getStepProposedActions(steps);
	const allocationRows = getAllocationRows(currentAllocations, finalProposedActions);
	const verdict = getVerdictSummary(steps);
	const stressDrawdown = getStressDrawdown(riskMetrics);
	const primaryChange = allocationRows[0] ?? null;
	const turnover = getTurnover(allocationRows);
	const residualRisk = getResidualRisk({
		allocationRows,
		riskMetrics,
		riskStructuredOutput,
	});
	const proposalCount = Array.isArray(riskStructuredOutput?.proposal_risks)
		? riskStructuredOutput.proposal_risks.length
		: null;
	const proposalLabel =
		typeof riskStructuredOutput?.proposal_label === "string"
			? riskStructuredOutput.proposal_label
			: "Recommended";
	const fitScore =
		typeof riskStructuredOutput?.proposal_fit_score === "number"
			? `${riskStructuredOutput.proposal_fit_score}/100`
			: null;

	return (
		<div>
			<div className="text-[10px] font-mono text-text-dim uppercase tracking-wide mb-2">
				Recommendation
			</div>
			<div className="rounded border border-border bg-bg-elevated p-2.5">
				<div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2">
					<div>
						<div className="text-[10px] font-mono text-text-dim uppercase tracking-wide">
							Recommended proposal
						</div>
						<div
							className={cn(
								"mt-1 text-[16px] font-mono font-semibold",
								verdict.tone === "green" && "text-green",
								verdict.tone === "amber" && "text-amber",
								verdict.tone === "red" && "text-red",
							)}
						>
							{proposalLabel}
						</div>
					</div>
					<div
						className={cn(
							"rounded-full border px-2 py-0.5 text-[11px] font-mono",
							verdict.tone === "green" && "border-green/20 bg-green/10 text-green",
							verdict.tone === "amber" && "border-amber/20 bg-amber/10 text-amber",
							verdict.tone === "red" && "border-red/20 bg-red/10 text-red",
						)}
					>
						{fitScore ?? verdict.detail}
					</div>
				</div>

				<div className="mt-2 grid gap-1.5">
					{proposalCount != null && proposalCount > 1 && (
						<FinalResultRow
							label="Compared"
							value={`${proposalCount} proposals evaluated`}
							detail={verdict.label}
							tone={verdict.tone === "red" ? "red" : verdict.tone === "amber" ? "amber" : "green"}
						/>
					)}
					{stressDrawdown && (
						<StressDrawdownBars
							current={stressDrawdown.current}
							proposed={stressDrawdown.proposed}
							improvement={stressDrawdown.improvement}
						/>
					)}
					{primaryChange && (
						<FinalResultRow
							label="Main fix"
							value={`${primaryChange.ticker} ${primaryChange.current.toFixed(1)}% -> ${primaryChange.proposed.toFixed(1)}%`}
							detail={formatSignedPercent(primaryChange.delta)}
							tone={primaryChange.delta < 0 ? "amber" : "green"}
						/>
					)}
					{turnover != null && (
						<FinalResultRow
							label="Trade size"
							value={`${turnover.toFixed(1)}% turnover`}
							detail={`${finalProposedActions.length} action${finalProposedActions.length === 1 ? "" : "s"}`}
							tone="teal"
						/>
					)}
					<FinalResultRow
						label="Residual risk"
						value={residualRisk}
						detail="After rebalance"
						tone={residualRisk === "No major blocker" ? "green" : "amber"}
					/>
				</div>
			</div>
		</div>
	);
}

function StressDrawdownBars({
	current,
	proposed,
	improvement,
}: {
	current: number;
	proposed: number;
	improvement: number;
}) {
	const max = Math.max(current, proposed, 1);
	const currentWidth = Math.max((current / max) * 100, 4);
	const proposedWidth = Math.max((proposed / max) * 100, 4);
	const improved = improvement >= 0;

	return (
		<div className="rounded border border-border/70 bg-bg-card px-2.5 py-2 font-mono">
			<div className="mb-1.5 flex items-center justify-between gap-3">
				<div className="text-[10px] uppercase tracking-wide text-text-dim">
					Stress Drawdown
				</div>
				<div className={cn("text-[11px]", improved ? "text-green" : "text-red")}>
					{Math.abs(improvement).toFixed(1)}pp {improved ? "better" : "worse"}
				</div>
			</div>
			<div className="space-y-1.5">
				<StressDrawdownBar
					label="Current"
					value={current}
					width={currentWidth}
					className="bg-text-muted/40"
				/>
				<StressDrawdownBar
					label="Proposed"
					value={proposed}
					width={proposedWidth}
					className={improved ? "bg-green" : "bg-red"}
				/>
			</div>
		</div>
	);
}

function StressDrawdownBar({
	label,
	value,
	width,
	className,
}: {
	label: string;
	value: number;
	width: number;
	className: string;
}) {
	return (
		<div className="grid grid-cols-[58px_1fr_48px] items-center gap-2 text-[10px]">
			<span className="text-text-dim">{label}</span>
			<div className="h-2 overflow-hidden rounded bg-bg-elevated">
				<div
					className={cn("h-full rounded", className)}
					style={{ width: `${width}%` }}
				/>
			</div>
			<span className="text-right text-text">{formatLossPercent(value)}</span>
		</div>
	);
}

function FinalResultRow({
	label,
	value,
	detail,
	tone,
}: {
	label: string;
	value: string;
	detail: string;
	tone: "green" | "amber" | "red" | "teal";
}) {
	return (
		<div className="grid grid-cols-[1fr_auto] gap-3 rounded border border-border/70 bg-bg-card px-2.5 py-1.5 font-mono">
			<div className="min-w-0">
				<div className="text-[10px] uppercase tracking-wide text-text-dim">
					{label}
				</div>
				<div className="truncate text-[11px] text-text">{value}</div>
			</div>
			<div
				className={cn(
					"self-center text-right text-[11px]",
					tone === "green" && "text-green",
					tone === "amber" && "text-amber",
					tone === "red" && "text-red",
					tone === "teal" && "text-teal",
				)}
			>
				{detail}
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
