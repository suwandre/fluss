"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { pnlPercent } from "@/lib/format";
import { useState } from "react";
import { RiskAnalysisContent } from "./risk-analysis-modal";

interface ProposedAction {
	action?: "reduce" | "increase" | "replace" | "add" | "remove";
	ticker: string;
	target_pct: number;
	rationale?: string;
}

interface CurrentAllocation {
	ticker: string;
	weight: number;
}

interface RedesignProposalModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	proposals?: ProposalOption[];
	recommendedProposalId?: string;
	confidence?: string;
	proposal_summary?: string;
	proposed_actions?: ProposedAction[];
	expected_improvement?: {
		sharpe_delta?: number | null;
		volatility_delta_pct?: number | null;
		max_drawdown_delta_pct?: number | null;
		narrative?: string;
	};
	currentAllocations: CurrentAllocation[];
	currentSharpe?: number | null;
	currentMaxDrawdown?: number | null;
	currentVolatility?: number | null;
	riskMetrics?: {
		current_var_95?: number | null;
		proposed_var_95?: number | null;
		current_avg_drawdown?: number | null;
		proposed_avg_drawdown?: number | null;
		current_max_drawdown?: number | null;
		proposed_max_drawdown?: number | null;
	} | null;
	riskStructuredOutput?: Record<string, unknown> | null;
	sectorExposure?: { current: Record<string, number>; proposed: Record<string, number> } | null;
}

interface ProposalRiskMetrics {
	current_var_95?: number | null;
	proposed_var_95?: number | null;
	current_avg_drawdown?: number | null;
	proposed_avg_drawdown?: number | null;
	current_max_drawdown?: number | null;
	proposed_max_drawdown?: number | null;
}

interface ProposalOption {
	id: string;
	label: string;
	confidence?: string;
	proposal_summary?: string;
	proposed_actions?: ProposedAction[];
	expected_improvement?: {
		sharpe_delta?: number | null;
		volatility_delta_pct?: number | null;
		max_drawdown_delta_pct?: number | null;
		narrative?: string;
	};
	tradeoff_notes?: string;
	riskMetrics?: ProposalRiskMetrics | null;
	riskStructuredOutput?: Record<string, unknown> | null;
	fitScore?: number | null;
	fitReasons?: string[];
	fitTradeoff?: string | null;
}

const LABEL_TOOLTIPS: Record<string, string> = {
	"Positions": "Number of unique holdings in the portfolio.",
	"Position Changes": "New = tickers being added. Exited = tickers being fully sold.",
	"Rebalance Turnover": "% of portfolio value that must be traded to reach the proposed allocation.",
	"Sector Re-allocation": "How sector weights shift from current to proposed allocation.",
	"Sectors": "Number of distinct asset classes / sectors represented.",
	"Max Position %": "Weight of the single largest holding. Lower = more diversified.",
	"Risk Score": "Composite 0–100 score. Lower = safer. Weights: drawdown (45%), VaR (30%), concentration (25%).",
	"Overall Fit": "Aggregate 0–100 proposal score. Higher = better. Combines risk, expected return, turnover, confidence, and caveats.",
	"Proposal Summary": "The agent's own summary of the proposed changes.",
	"Opportunity Snapshot": "Return-side metrics that help judge whether the rebalance is worth the trade-off.",
	"Expected Return": "Historical 90-day portfolio return estimate using current market data. Higher = better.",
	"Sharpe Ratio": "Risk-adjusted return metric. Higher = better.",
	"Upside/Downside": "Ratio of positive daily returns to negative daily returns over the lookback window. Higher = better.",
};

function isRoundedZeroPercent(value: number): boolean {
	return Math.abs(value).toFixed(1) === "0.0";
}

function deltaTextClassName(value: number): string {
	if (isRoundedZeroPercent(value)) return "text-text-dim";
	return value > 0 ? "text-green" : "text-red";
}

function proposedTextClassName(delta: number): string {
	if (isRoundedZeroPercent(delta)) return "text-text-dim";
	return "text-teal";
}

function isSameSnapshotValue(current: number, proposed: number, unit: string): boolean {
	if (unit === "%") return isRoundedZeroPercent(proposed - current);
	return current === proposed;
}

function LabelWithTooltip({ label }: { label: string }) {
	const tooltip = LABEL_TOOLTIPS[label];
	if (!tooltip) {
		return <span>{label}</span>;
	}

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span className="inline-flex cursor-help items-center gap-1"
						style={{ borderBottom: "none" }}
					/>
				}
			>
				<span className="border-b border-dashed border-text-dim/40">{label}</span>
				<span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-text-muted font-mono text-[8px] leading-none text-text-muted transition-colors hover:border-text hover:text-text">
					?
				</span>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				className="max-w-[220px] border border-border bg-bg-elevated text-[11px] font-mono leading-snug text-text shadow-lg"
			>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}

function confidenceBadge(confidence?: string) {
	const lower = (confidence ?? "").toLowerCase();
	if (lower === "high") {
		return { label: "High", className: "bg-[rgba(34,197,94,0.12)] text-green" };
	}
	if (lower === "medium") {
		return { label: "Medium", className: "bg-[rgba(245,158,11,0.12)] text-amber" };
	}
	if (lower === "low") {
		return { label: "Low", className: "bg-[rgba(239,68,68,0.12)] text-red" };
	}
	return { label: "—", className: "bg-bg-elevated text-text-dim" };
}

function verdictBadge(verdict?: unknown) {
	const lower = typeof verdict === "string" ? verdict.toLowerCase() : "";
	if (lower === "approved") return { label: "Approved", className: "bg-green/10 text-green" };
	if (lower === "approved_with_caveats" || lower === "approve_with_caveats") return { label: "Caveats", className: "bg-amber/10 text-amber" };
	if (lower === "rejected" || lower === "reject") return { label: "Rejected", className: "bg-red/10 text-red" };
	return { label: "Pending", className: "bg-bg-card text-text-dim" };
}

function fitScoreBadge(score?: number | null) {
	if (typeof score !== "number") {
		return { label: "N/A", className: "bg-bg-card text-text-dim" };
	}
	if (score >= 80) return { label: `${score}/100`, className: "bg-green/10 text-green" };
	if (score >= 60) return { label: `${score}/100`, className: "bg-teal/10 text-teal" };
	if (score >= 40) return { label: `${score}/100`, className: "bg-amber/10 text-amber" };
	return { label: `${score}/100`, className: "bg-red/10 text-red" };
}

function fitScoreTone(score?: number | null) {
	if (typeof score !== "number") {
		return { label: "Pending", className: "bg-bg-card text-text-dim", stroke: "rgba(255,255,255,0.22)" };
	}
	if (score >= 80) {
		return { label: "Strong fit", className: "bg-green/10 text-green", stroke: "rgb(34,197,94)" };
	}
	if (score >= 60) {
		return { label: "Good fit", className: "bg-teal/10 text-teal", stroke: "teal" };
	}
	if (score >= 40) {
		return { label: "Mixed fit", className: "bg-amber/10 text-amber", stroke: "rgb(245,158,11)" };
	}
	return { label: "Weak fit", className: "bg-red/10 text-red", stroke: "rgb(239,68,68)" };
}

function splitSentences(text: string): string[] {
	if (!text) return [];
	const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
	if (sentences.length === 0 && text.trim()) return [text.trim()];
	return sentences;
}

function FitScoreGauge({
	score,
	isRecommended,
	confidenceLabel,
	reasons,
	tradeoff,
}: {
	score?: number | null;
	isRecommended: boolean;
	confidenceLabel: string;
	reasons: string[];
	tradeoff?: string | null;
}) {
	const normalizedScore = typeof score === "number" ? Math.min(Math.max(score, 0), 100) : 0;
	const tone = fitScoreTone(score);
	const cx = 100;
	const cy = 100;
	const r = 80;
	const startAngle = Math.PI;
	const angle = Math.PI - (normalizedScore / 100) * Math.PI;

	function arcPath(angleEnd: number): string {
		const x1 = cx + r * Math.cos(startAngle);
		const y1 = cy - r * Math.sin(startAngle);
		const x2 = cx + r * Math.cos(angleEnd);
		const y2 = cy - r * Math.sin(angleEnd);
		return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
	}

	const fillArc = arcPath(angle);
	const dotX = cx + r * Math.cos(angle);
	const dotY = cy - r * Math.sin(angle);
	const reasonSummary = reasons.slice(0, 2).join(" • ");

	return (
		<div className="grid grid-cols-[150px_1fr] gap-4 rounded border border-border bg-bg-elevated px-4 py-2.5">
			<div className="min-w-0">
				<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide">
					<LabelWithTooltip label="Overall Fit" />
				</div>
				<div className="relative mt-1 flex items-center justify-center">
					<svg viewBox="0 0 200 120" className="w-full max-w-[145px]">
						<path
							d="M 20 100 A 80 80 0 0 1 180 100"
							fill="none"
							stroke="rgba(255,255,255,0.08)"
							strokeWidth={12}
							strokeLinecap="round"
						/>
						<path
							d={fillArc}
							fill="none"
							stroke={tone.stroke}
							strokeWidth={10}
							strokeLinecap="round"
						/>
						<circle cx={dotX} cy={dotY} r={4} fill={tone.stroke} />
					</svg>
					<div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 translate-y-0 flex-col items-center">
						<span className="font-mono text-2xl font-bold text-teal">
							{typeof score === "number" ? score : "--"}
						</span>
						<span className="text-[10px] font-mono text-text-dim">/100</span>
					</div>
				</div>
			</div>

			<div className="flex min-w-0 flex-col justify-center gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<span className={`rounded-full px-1.5 py-px text-[10px] font-mono ${tone.className}`}>
						{tone.label}
					</span>
					<span className="rounded-full bg-bg-card px-1.5 py-px text-[10px] font-mono text-text-dim">
						{confidenceLabel} confidence
					</span>
					{isRecommended && (
						<span className="rounded-full bg-teal/10 px-1.5 py-px text-[10px] font-mono text-teal">
							Recommended
						</span>
					)}
				</div>
				{reasonSummary && (
					<div className="truncate text-[12px] font-mono text-text-dim">
						{reasonSummary}
					</div>
				)}
				{tradeoff && (
					<div className="truncate text-[11px] font-mono text-text-muted">
						<span className="text-text-dim">Trade-off:</span> {tradeoff}
					</div>
				)}
			</div>
		</div>
	);
}

function RiskScoreGauge({
	currentScore,
	proposedScore,
	delta,
	improved,
}: {
	currentScore: number;
	proposedScore: number;
	delta: number;
	improved: boolean;
}) {
	const isUnchanged = isRoundedZeroPercent(delta);
	const deltaClassName = isUnchanged
		? "bg-bg-card text-text-dim"
		: improved
			? "bg-green/10 text-green"
			: "bg-red/10 text-red";
	const deltaLabel = isUnchanged ? "No change" : improved ? "Improved" : "Worsened";
	const proposedClassName = isUnchanged ? "text-text-dim" : "text-teal";
	const maxScore = Math.max(currentScore, proposedScore, 60);
	const cx = 100;
	const cy = 100;
	const r = 80;

	const startAngle = Math.PI; // leftmost
	// Arc: from left end to angle proportional to score
	const currentAngle = Math.PI - (currentScore / maxScore) * Math.PI;
	const proposedAngle = Math.PI - (proposedScore / maxScore) * Math.PI;

	function arcPath(angleStart: number, angleEnd: number): string {
		const x1 = cx + r * Math.cos(angleStart);
		const y1 = cy - r * Math.sin(angleStart);
		const x2 = cx + r * Math.cos(angleEnd);
		const y2 = cy - r * Math.sin(angleEnd);
		const largeArc = Math.abs(angleEnd - angleStart) > Math.PI ? 1 : 0;
		const sweep = angleEnd > angleStart ? 0 : 1;
		return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
	}

	const currentArc = arcPath(startAngle, currentAngle);
	const proposedArc = arcPath(startAngle, proposedAngle);

	// Dot positions
	const currentDotX = cx + r * Math.cos(currentAngle);
	const currentDotY = cy - r * Math.sin(currentAngle);
	const proposedDotX = cx + r * Math.cos(proposedAngle);
	const proposedDotY = cy - r * Math.sin(proposedAngle);

	return (
		<div className="rounded border border-border bg-bg-elevated p-4 h-full flex flex-col">
			<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-2">
				<LabelWithTooltip label="Risk Score" />
			</div>
			<div className="relative flex flex-col items-center flex-1 justify-center">
				<svg viewBox="0 0 200 120" className="w-full max-w-[240px] mx-auto">
					{/* Background track */}
					<path
						d="M 20 100 A 80 80 0 0 1 180 100"
						fill="none"
						stroke="rgba(255,255,255,0.08)"
						strokeWidth={12}
						strokeLinecap="round"
					/>
					{/* Current score arc */}
					<path
						d={currentArc}
						fill="none"
						stroke="rgba(255,255,255,0.15)"
						strokeWidth={10}
						strokeLinecap="round"
					/>
					{/* Proposed score arc */}
					<path
						d={proposedArc}
						fill="none"
						stroke={isUnchanged ? "transparent" : "teal"}
						strokeWidth={10}
						strokeLinecap="round"
					/>
					{/* Current dot */}
					<circle cx={currentDotX} cy={currentDotY} r={4} fill="rgba(255,255,255,0.4)" />
					{/* Proposed dot */}
					<circle cx={proposedDotX} cy={proposedDotY} r={4} fill={isUnchanged ? "rgba(255,255,255,0.4)" : "teal"} />
				</svg>
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-2 flex flex-col items-center">
					<span className={`text-3xl font-mono font-bold ${proposedClassName}`}>{proposedScore.toFixed(1)}</span>
				<span className={`px-1.5 py-px rounded-full text-[10px] font-mono ${deltaClassName}`}>
									Δ{isUnchanged ? "0.00" : delta.toFixed(2)} {deltaLabel}
								</span>
				</div>
							</div>
							<div className="flex items-center justify-center mt-1 text-[11px] font-mono">
								<span className="text-text-dim">Current: {currentScore.toFixed(2)}</span>
							</div>
						</div>
	);
}

function TurnoverGauge({ turnover }: { turnover: number }) {
	const cx = 100;
	const cy = 100;
	const r = 80;
	const startAngle = Math.PI;
	const angle = Math.PI - (Math.min(turnover, 100) / 100) * Math.PI;

	function arcPath(angleEnd: number): string {
		const x1 = cx + r * Math.cos(startAngle);
		const y1 = cy - r * Math.sin(startAngle);
		const x2 = cx + r * Math.cos(angleEnd);
		const y2 = cy - r * Math.sin(angleEnd);
		const largeArc = 0;
		const sweep = angleEnd > startAngle ? 0 : 1;
		return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
	}

	const fillArc = arcPath(angle);
	const dotX = cx + r * Math.cos(angle);
	const dotY = cy - r * Math.sin(angle);

	return (
		<div className="rounded border border-border bg-bg-elevated p-4 flex flex-col">
			<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-2">
				<LabelWithTooltip label="Rebalance Turnover" />
			</div>
			<div className="relative flex flex-col items-center flex-1 justify-center">
				<svg viewBox="0 0 200 120" className="w-full max-w-[240px] mx-auto">
					<path
						d="M 20 100 A 80 80 0 0 1 180 100"
						fill="none"
						stroke="rgba(255,255,255,0.08)"
						strokeWidth={12}
						strokeLinecap="round"
					/>
					<path
						d={fillArc}
						fill="none"
						stroke="teal"
						strokeWidth={10}
						strokeLinecap="round"
					/>
					<circle cx={dotX} cy={dotY} r={4} fill="teal" />
				</svg>
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-2 flex flex-col items-center">
					<span className="text-3xl font-mono font-bold text-teal">{turnover.toFixed(1)}%</span>
					<span className="text-[10px] text-text-dim mt-0.5">Cost to execute</span>
				</div>
			</div>
		</div>
	);
}


export function RedesignProposalModal({
	open,
	onOpenChange,
	proposals,
	recommendedProposalId,
	confidence,
	proposal_summary,
	proposed_actions,
	expected_improvement,
	currentAllocations,
	currentSharpe,
	currentMaxDrawdown,
	currentVolatility,
	riskMetrics,
	riskStructuredOutput,
	sectorExposure,
}: RedesignProposalModalProps) {
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
	const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<"proposal" | "risk">("proposal");
	const proposalOptions: ProposalOption[] = proposals?.length
		? proposals
		: [
				{
					id: "recommended",
					label: "Recommended",
					confidence,
				proposal_summary,
				proposed_actions,
				expected_improvement,
				riskMetrics,
				riskStructuredOutput,
				fitScore: typeof riskStructuredOutput?.proposal_fit_score === "number" ? riskStructuredOutput.proposal_fit_score : null,
				fitReasons: Array.isArray(riskStructuredOutput?.proposal_fit_reasons)
					? riskStructuredOutput.proposal_fit_reasons.filter((reason): reason is string => typeof reason === "string")
					: [],
				fitTradeoff: typeof riskStructuredOutput?.proposal_fit_tradeoff === "string" ? riskStructuredOutput.proposal_fit_tradeoff : null,
			},
		];
	const activeProposal =
		proposalOptions.find((proposal) => proposal.id === selectedProposalId) ??
		proposalOptions.find((proposal) => proposal.id === recommendedProposalId) ??
		proposalOptions[0];
	const activeConfidence = activeProposal?.confidence ?? confidence;
	const activeProposalSummary = activeProposal?.proposal_summary ?? proposal_summary;
	const activeProposedActions = activeProposal?.proposed_actions ?? proposed_actions;
	const activeExpectedImprovement = activeProposal?.expected_improvement ?? expected_improvement;
	const activeRiskMetrics = activeProposal?.riskMetrics ?? riskMetrics;
	const activeRiskStructuredOutput = activeProposal?.riskStructuredOutput ?? riskStructuredOutput;
	const badge = confidenceBadge(activeConfidence);
	const activeFitReasons = activeProposal?.fitReasons ?? [];
	const activeFitTradeoff = activeProposal?.fitTradeoff ?? activeProposal?.tradeoff_notes;

	const currentWeightMap = new Map<string, number>();
	for (const c of currentAllocations) {
		currentWeightMap.set(c.ticker.toUpperCase(), c.weight);
	}

	const proposedActionMap = new Map<string, ProposedAction>();
	for (const action of activeProposedActions ?? []) {
		proposedActionMap.set(action.ticker.toUpperCase(), action);
	}

	const allTickers = new Set<string>();
	for (const c of currentAllocations) allTickers.add(c.ticker.toUpperCase());
	for (const ticker of proposedActionMap.keys()) allTickers.add(ticker);

	const proposedWeightMap = new Map<string, number>();
	for (const ticker of allTickers) {
		const action = proposedActionMap.get(ticker);
		const current = currentWeightMap.get(ticker) ?? 0;
		const target = action
			? action.action === "remove"
				? 0
				: Math.max(action.target_pct, 0)
			: current;
		proposedWeightMap.set(ticker, target);
	}
	const proposedTotalWeight = Array.from(proposedWeightMap.values()).reduce(
		(sum, weight) => sum + weight,
		0,
	);
	const proposedScale = proposedTotalWeight > 0 ? 100 / proposedTotalWeight : 1;

	const rows = Array.from(allTickers).map((ticker) => {
		const action = proposedActionMap.get(ticker);
		const current = currentWeightMap.get(ticker) ?? 0;
		const target_pct = (proposedWeightMap.get(ticker) ?? 0) * proposedScale;
		const delta = target_pct - current;
		return {
			ticker: action?.ticker ?? ticker,
			target_pct,
			action: action?.action,
			hasAction: Boolean(action),
			rationale: action?.rationale,
			current,
			delta,
		};
	});
	const rowKeys = rows.map((row) => row.ticker.toUpperCase());
	const hasRows = rows.length > 0;
	const allRationalesExpanded = hasRows && rowKeys.every((key) => expandedRows.has(key));

	function toggleRationale(rowKey: string) {
		setExpandedRows((prev) => {
			const next = new Set(prev);
			if (next.has(rowKey)) next.delete(rowKey);
			else next.add(rowKey);
			return next;
		});
	}

	function expandAllRationales() {
		setExpandedRows(new Set(rowKeys));
	}

	function collapseAllRationales() {
		setExpandedRows(new Set());
	}

	// Snapshot card computations
	const currentCount = currentAllocations.length;
	const proposedCount = rows.filter((row) => row.target_pct > 0).length;
	const currentMaxPos = currentAllocations.length > 0 ? Math.max(...currentAllocations.map(c => c.weight)) : 0;
	const proposedMaxPos = rows.length > 0 ? Math.max(...rows.map((row) => row.target_pct)) : 0;
	// Turnover
	const turnover = rows.reduce((sum, row) => sum + Math.abs(row.delta), 0) / 2;
	// Sectors (use actual sector keys from exposure, fallback to ticker count)
	const currentSectorKeys = new Set(Object.keys(sectorExposure?.current ?? {}));
	const proposedSectorKeys = new Set(Object.keys(sectorExposure?.proposed ?? {}));
	const currentSectorCount = currentSectorKeys.size || currentCount;
	const proposedSectorCount = proposedSectorKeys.size || proposedCount;

	// Position changes
	const newPositions = rows.filter((row) => row.current === 0 && row.target_pct > 0).length;
	const exitedPositions = rows.filter((row) => row.current > 0 && row.target_pct === 0).length;

	const snapshotItems = [
		{ label: "Positions", current: currentCount, proposed: proposedCount, unit: "", showProposed: true },
		{ label: "Position Changes", current: newPositions, proposed: exitedPositions, unit: "", showProposed: true },
		{ label: "Sectors", current: currentSectorCount, proposed: proposedSectorCount, unit: "", showProposed: true },
		{ label: "Max Position %", current: currentMaxPos, proposed: proposedMaxPos, unit: "%", showProposed: true },
	];

	// Risk Score inline line
	const riskScoreLine = (() => {
		if (!activeRiskMetrics) return null;
		const currentVar = activeRiskMetrics.current_var_95;
		const proposedVar = activeRiskMetrics.proposed_var_95;
		const currentAvg = activeRiskMetrics.current_avg_drawdown;
		const proposedAvg = activeRiskMetrics.proposed_avg_drawdown;
		const currentMax = activeRiskMetrics.current_max_drawdown;
		const proposedMax = activeRiskMetrics.proposed_max_drawdown;
		if (
			typeof currentAvg !== "number" || typeof proposedAvg !== "number" ||
			typeof currentMax !== "number" || typeof proposedMax !== "number" ||
			typeof currentVar !== "number" || typeof proposedVar !== "number"
		) return null;
		const currentScore = (currentAvg * 0.45) + (currentMax * 0.3) + (currentVar * 0.25);
		const proposedScore = (proposedAvg * 0.45) + (proposedMax * 0.3) + (proposedVar * 0.25);
		const delta = proposedScore - currentScore;
		const improved = proposedScore < currentScore;
		return { currentScore, proposedScore, delta, improved };
	})();

	const opportunityItems = (() => {
		const currentExpectedReturn =
			typeof activeRiskStructuredOutput?.current_expected_return_90d === "number"
				? activeRiskStructuredOutput.current_expected_return_90d
				: null;
		const proposedExpectedReturn =
			typeof activeRiskStructuredOutput?.proposed_expected_return_90d === "number"
				? activeRiskStructuredOutput.proposed_expected_return_90d
				: null;
		const currentUpsideDownside =
			typeof activeRiskStructuredOutput?.current_upside_downside_ratio === "number"
				? activeRiskStructuredOutput.current_upside_downside_ratio
				: null;
		const proposedUpsideDownside =
			typeof activeRiskStructuredOutput?.proposed_upside_downside_ratio === "number"
				? activeRiskStructuredOutput.proposed_upside_downside_ratio
				: null;
		const proposedSharpe =
			typeof currentSharpe === "number" && typeof activeExpectedImprovement?.sharpe_delta === "number"
				? currentSharpe + activeExpectedImprovement.sharpe_delta
				: null;

		return [
			{
				label: "Expected Return",
				current: currentExpectedReturn,
				proposed: proposedExpectedReturn,
				unit: "%",
			},
			{
				label: "Sharpe Ratio",
				current: currentSharpe ?? null,
				proposed: proposedSharpe,
				unit: "",
			},
			{
				label: "Upside/Downside",
				current: currentUpsideDownside,
				proposed: proposedUpsideDownside,
				unit: "",
			},
		].filter(
			(item) =>
				typeof item.current === "number" || typeof item.proposed === "number",
		);
	})();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-6 sm:max-w-3xl">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<DialogTitle>Portfolio Redesign Proposal</DialogTitle>
						<span
							className={`text-[10px] font-mono font-medium px-1.5 py-px rounded-full ${badge.className}`}
						>
							{badge.label} confidence
						</span>
					</div>
				</DialogHeader>

				{proposalOptions.length > 1 && (
					<div className="grid grid-cols-3 gap-2">
						{proposalOptions.map((proposal) => {
							const selected = proposal.id === activeProposal?.id;
							const risk = proposal.riskStructuredOutput;
							const verdict = verdictBadge(risk?.verdict);
							const fit = fitScoreBadge(proposal.fitScore);
							const isRecommended = proposal.id === recommendedProposalId;
							const expectedReturn =
								typeof risk?.proposed_expected_return_90d === "number"
									? risk.proposed_expected_return_90d
									: null;
							const drawdown =
								typeof risk?.proposed_avg_drawdown === "number"
									? risk.proposed_avg_drawdown
									: null;
							const turnover =
								typeof risk?.proposal_turnover_pct === "number"
									? risk.proposal_turnover_pct
									: null;
							return (
								<button
									key={proposal.id}
									type="button"
									onClick={() => setSelectedProposalId(proposal.id)}
									className={`rounded border p-2.5 text-left transition-colors ${selected ? "border-teal bg-teal/5" : "border-border bg-bg-elevated hover:border-border-bright"}`}
								>
									<div className="flex items-center justify-between gap-2">
										<span className="truncate text-[12px] font-mono font-semibold text-text">
											{proposal.label}
										</span>
										<span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-mono ${fit.className}`}>
											{fit.label}
										</span>
									</div>
									<div className="mt-1 flex items-center justify-between gap-2">
										<span className={`rounded-full px-1.5 py-px text-[9px] font-mono ${verdict.className}`}>
											{verdict.label}
										</span>
										{isRecommended && (
											<span className="text-[10px] font-mono text-teal">Recommended</span>
										)}
									</div>
									<div className="mt-2 space-y-0.5 text-[10px] font-mono">
										<div className="flex justify-between gap-2">
											<span className="text-text-muted">Return</span>
											<span className="text-text">{expectedReturn == null ? "N/A" : `${expectedReturn.toFixed(2)}%`}</span>
										</div>
										<div className="flex justify-between gap-2">
											<span className="text-text-muted">Avg DD</span>
											<span className="text-text">{drawdown == null ? "N/A" : `${drawdown.toFixed(2)}%`}</span>
										</div>
										<div className="flex justify-between gap-2">
											<span className="text-text-muted">Turnover</span>
											<span className="text-text">{turnover == null ? "N/A" : `${turnover.toFixed(1)}%`}</span>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}

				<FitScoreGauge
					score={activeProposal?.fitScore}
					isRecommended={activeProposal?.id === recommendedProposalId}
					confidenceLabel={badge.label}
					reasons={activeFitReasons}
					tradeoff={activeFitTradeoff}
				/>

				<Tabs
					value={activeTab}
					onValueChange={(v) => setActiveTab(v as "proposal" | "risk")}
					className="min-h-0 flex-1"
				>
					<TabsList className="flex gap-2 border-b border-border pb-1 mb-4">
						<TabsTrigger
							value="proposal"
							className="text-[12px] font-mono font-medium px-2 py-1 rounded text-text-dim hover:text-text transition-colors data-[state=active]:text-teal data-[state=active]:border-b-2 data-[state=active]:border-teal"
						>
							Proposal
						</TabsTrigger>
						<TabsTrigger
							value="risk"
							className="text-[12px] font-mono font-medium px-2 py-1 rounded text-text-dim hover:text-text transition-colors data-[state=active]:text-teal data-[state=active]:border-b-2 data-[state=active]:border-teal"
						>
							Risk & Return
						</TabsTrigger>
					</TabsList>

					<div className="min-h-0 flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-5">
						<TabsContent value="proposal">
							<div className="space-y-6">
								{/* Proposed Allocation Table */}
								<div className="rounded border border-border overflow-hidden">
									<div className="bg-bg-elevated/60 border-b border-border px-4 py-2 flex items-center justify-between gap-3">
										<span className="text-[10px] font-mono uppercase tracking-wide text-text-dim">
											Allocation Rationales
										</span>
										<div className="flex items-center gap-3">
											<button
												type="button"
												onClick={expandAllRationales}
												disabled={!hasRows || allRationalesExpanded}
												className="text-[11px] font-mono text-teal underline underline-offset-2 hover:text-teal/70 disabled:text-text-muted disabled:no-underline disabled:cursor-not-allowed"
											>
												Expand all
											</button>
											<button
												type="button"
												onClick={collapseAllRationales}
												disabled={expandedRows.size === 0}
												className="text-[11px] font-mono text-teal underline underline-offset-2 hover:text-teal/70 disabled:text-text-muted disabled:no-underline disabled:cursor-not-allowed"
											>
												Collapse all
											</button>
										</div>
									</div>
									<div className="bg-bg-elevated text-[11px] font-mono text-text-dim uppercase tracking-wide px-4 py-3 grid grid-cols-[80px_100px_100px_100px_1fr] gap-4">
										<span>Ticker</span>
										<span className="text-right">Current</span>
										<span className="text-right">Proposed</span>
										<span className="text-right">Delta</span>
										<span className="pl-6">Rationale</span>
									</div>
									{rows.length > 0 ? (
										rows.map((row) => {
											const rowKey = row.ticker.toUpperCase();
											const isExpanded = expandedRows.has(rowKey);
											const rationale =
												row.rationale ??
												(row.hasAction
													? row.target_pct === 0
														? "Position removed from the proposed allocation."
														: "Target allocation changed by this proposal."
													: "No change proposed; current allocation carried forward.");
											return (
												<div key={rowKey}>
													<div
														className={`grid grid-cols-[80px_100px_100px_100px_1fr] gap-4 px-4 py-3 text-[12px] font-mono border-b border-border last:border-0 items-center transition-colors ${isExpanded ? "bg-bg-elevated/50" : ""}`}
													>
														<span className="truncate font-medium text-text">
															{row.ticker}
														</span>
														<span className="text-right text-text-dim">
															{row.current.toFixed(1)}%
														</span>
														<span className={`text-right font-medium ${proposedTextClassName(row.delta)}`}>
															{row.target_pct.toFixed(1)}%
														</span>
														<span className={`text-right font-semibold ${deltaTextClassName(row.delta)}`}>
															{pnlPercent(row.delta)}
														</span>
														<span className="flex items-center justify-center">
															<button
																type="button"
																onClick={(e) => { e.stopPropagation(); toggleRationale(rowKey); }}
																className="text-teal text-[11px] font-mono underline underline-offset-2 hover:text-teal/70 cursor-pointer"
															>
																{isExpanded ? "Hide Rationale" : "View Rationale"}
															</button>
														</span>
													</div>
													{isExpanded && (
														<div className="px-4 py-2 text-[12px] font-mono text-text-dim bg-bg-elevated/30 border-b border-border">
															{rationale}
														</div>
													)}
												</div>
											);
										})
									) : (
										<div className="px-4 py-4 text-[12px] font-mono text-text-dim italic grid grid-cols-[80px_100px_100px_100px_1fr] gap-4">
											No proposed actions available.
										</div>
									)}
								</div>

							{/* Sector Re-allocation Bars */}
							{sectorExposure && (
								<div className="rounded border border-border bg-bg-elevated p-5">
							<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-3">
								<LabelWithTooltip label="Sector Re-allocation" />
							</div>
									<div className="space-y-3">
										{(() => {
											const allSectorKeys = Array.from(new Set([
												...Object.keys(sectorExposure.current ?? {}),
												...Object.keys(sectorExposure.proposed ?? {}),
											]));
											const sectors = allSectorKeys.map((sector) => ({
												sector,
												current: sectorExposure.current?.[sector] ?? 0,
												proposed: sectorExposure.proposed?.[sector] ?? 0,
											}));
											if (sectors.length === 0) return null;
											sectors.sort((a, b) => Math.max(b.current, b.proposed) - Math.max(a.current, a.proposed));
											return sectors.map((s) => {
												const delta = s.proposed - s.current;
												const isUnchanged = isRoundedZeroPercent(delta);
												return (
													<div key={s.sector} className="flex items-center gap-3">
														<span className="w-24 shrink-0 text-[11px] font-mono text-text-dim truncate">{s.sector}</span>
														<div className="flex-1 flex items-center gap-2">
																<div className="flex-1 h-2 bg-bg-card rounded overflow-hidden relative">
																	<div
																		className="h-full bg-[rgba(255,255,255,0.15)]"
																		style={{ width: `${Math.min(s.current, 100)}%` }}
																	/>
																	<div
																		className={`absolute top-0 h-full ${isUnchanged ? "bg-transparent" : "bg-teal"}`}
																		style={{ left: 0, width: `${Math.min(s.proposed, 100)}%` }}
																	/>
																</div>
															<span className={`text-[10px] font-mono w-8 text-right ${deltaTextClassName(delta)}`}>
																{pnlPercent(delta)}
															</span>
															<span className={`text-[10px] font-mono w-8 text-right ${proposedTextClassName(delta)}`}>{s.proposed.toFixed(1)}%</span>
														</div>
													</div>
												);
											});
										})()}
									</div>
								</div>
							)}

								{/* Snapshot Cards */}
								<div className="grid grid-cols-2 gap-3">
									{snapshotItems.map((item) => (
										<div key={item.label} className="rounded border border-border bg-bg-elevated p-4">
											<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-3">
												<LabelWithTooltip label={item.label} />
											</div>
								<div className="space-y-1">
									<div className="flex items-center justify-between">
										<span className="text-[10px] font-mono text-text-muted">{item.label === "Position Changes" ? "New" : "Current"}</span>
										<span className="text-[11px] font-mono text-text">{typeof item.current === "number" ? `${item.current.toFixed(item.unit === "%" ? 1 : 0)}${item.unit}` : "N/A"}</span>
									</div>
									{item.showProposed && (
										<div className="flex items-center justify-between">
											{(() => {
												const proposedIsNumber = typeof item.proposed === "number";
												const currentIsNumber = typeof item.current === "number";
												const isUnchanged = item.label !== "Position Changes" && currentIsNumber && proposedIsNumber
													? isSameSnapshotValue(item.current, item.proposed, item.unit)
													: false;
												const proposedClassName = isUnchanged ? "text-text-dim" : "text-teal";
												return (
													<>
														<span className={`text-[10px] font-mono ${isUnchanged ? "text-text-muted" : "text-teal/60"}`}>{item.label === "Position Changes" ? "Exited" : "Proposed"}</span>
														<span className={`text-[11px] font-mono font-medium ${proposedClassName}`}>{proposedIsNumber ? `${item.proposed.toFixed(item.unit === "%" ? 1 : 0)}${item.unit}` : "N/A"}</span>
													</>
												);
											})()}
										</div>
									)}
								</div>
										</div>
									))}
								</div>

								{opportunityItems.length > 0 && (
									<div className="rounded border border-border bg-bg-elevated p-5">
										<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-3">
											<LabelWithTooltip label="Opportunity Snapshot" />
										</div>
										<div className="grid grid-cols-3 gap-3">
											{opportunityItems.map((item) => {
												const current = item.current;
												const proposed = item.proposed;
												const delta =
													typeof current === "number" && typeof proposed === "number"
														? proposed - current
														: null;
												const isUnchanged =
													typeof delta === "number" && isSameSnapshotValue(current ?? 0, proposed ?? 0, item.unit);
												return (
													<div key={item.label} className="rounded border border-border bg-bg-card p-3">
														<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-2">
															<LabelWithTooltip label={item.label} />
														</div>
														<div className="space-y-1">
															<div className="flex items-center justify-between">
																<span className="text-[10px] font-mono text-text-muted">Current</span>
																<span className="text-[11px] font-mono text-text">
																	{typeof current === "number" ? `${current.toFixed(2)}${item.unit}` : "N/A"}
																</span>
															</div>
															<div className="flex items-center justify-between">
																<span className={`text-[10px] font-mono ${isUnchanged ? "text-text-muted" : "text-teal/60"}`}>Proposed</span>
																<span className={`text-[11px] font-mono font-medium ${isUnchanged ? "text-text-dim" : "text-teal"}`}>
																	{typeof proposed === "number" ? `${proposed.toFixed(2)}${item.unit}` : "N/A"}
																</span>
															</div>
															{typeof delta === "number" && (
																<div className="flex items-center justify-between pt-1 border-t border-border/40">
																	<span className="text-[10px] font-mono text-text-muted">Delta</span>
																	<span className={`text-[11px] font-mono font-semibold ${deltaTextClassName(delta)}`}>
																		{delta > 0 ? "+" : ""}{delta.toFixed(2)}{item.unit}
																	</span>
																</div>
															)}
														</div>
													</div>
												);
											})}
										</div>
									</div>
								)}

							{/* Risk Score + Turnover Gauges */}
							<div className="grid grid-cols-2 gap-3">
								<TurnoverGauge turnover={turnover} />
								{(() => {
									if (!riskScoreLine) {
										if (!activeRiskMetrics) {
											return (
												<div className="rounded border border-border bg-bg-elevated p-4 h-full flex flex-col">
													<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-2">
														<LabelWithTooltip label="Risk Score" />
													</div>
													<div className="text-[11px] font-mono text-text-muted flex-1 flex items-center justify-center">N/A</div>
												</div>
											);
										}
										return null;
									}
									const { currentScore, proposedScore, delta, improved } = riskScoreLine;
									return (
										<RiskScoreGauge
											currentScore={currentScore}
											proposedScore={proposedScore}
											delta={delta}
											improved={improved}
										/>
									);
								})()}
							</div>

								{/* Proposal Summary Bullets */}
								{activeProposalSummary && (
									<div className="rounded border border-border bg-bg-elevated p-4 space-y-3">
										<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-1">
											<LabelWithTooltip label="Proposal Summary" />
										</div>
										{splitSentences(activeProposalSummary).map((sentence, i) => (
											<div key={i} className="flex items-start gap-2 text-[13px] text-text-dim leading-relaxed">
												<span className="text-teal mt-1 shrink-0">•</span>
												<span>{sentence}</span>
											</div>
										))}
									</div>
								)}
							</div>
						</TabsContent>

						<TabsContent value="risk">
							<div>
								{activeRiskStructuredOutput && (
									<RiskAnalysisContent
										structuredOutput={activeRiskStructuredOutput}
										currentSharpe={currentSharpe}
										currentVolatility={currentVolatility}
										currentMaxDrawdown={currentMaxDrawdown}
										sharpeDelta={activeExpectedImprovement?.sharpe_delta ?? null}
									/>
								)}
							</div>
						</TabsContent>
					</div>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
