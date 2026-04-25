"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { RiskAnalysisContent } from "./risk-analysis-modal";

interface ProposedAction {
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

function splitSentences(text: string): string[] {
	if (!text) return [];
	const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
	if (sentences.length === 0 && text.trim()) return [text.trim()];
	return sentences;
}

function MetricCard({
	label,
	current,
	proposed,
	delta,
	unit,
	isBetterWhenLower,
	showProposed = true,
}: {
	label: string;
	current: number | null | undefined;
	proposed: number | null | undefined;
	delta: number | null | undefined;
	unit: string;
	isBetterWhenLower: boolean;
	showProposed?: boolean;
}) {
	const hasCurrent = typeof current === "number";
	const hasDelta = typeof delta === "number";
	const hasProposed = typeof proposed === "number";
	const showDelta = hasDelta && (hasCurrent || hasProposed);

	let direction = "→";
	let directionColor = "text-text-dim";
	if (hasDelta) {
		if (isBetterWhenLower) {
			direction = delta < 0 ? "▼" : delta > 0 ? "▲" : "→";
			directionColor = delta < 0 ? "text-green" : delta > 0 ? "text-red" : "text-text-dim";
		} else {
			direction = delta > 0 ? "▲" : delta < 0 ? "▼" : "→";
			directionColor = delta > 0 ? "text-green" : delta < 0 ? "text-red" : "text-text-dim";
		}
	}

	return (
		<div className="rounded border border-border bg-bg-elevated p-3">
			<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-2">
				{label}
			</div>
			<div className="space-y-1">
				<div className="flex items-center justify-between">
					<span className="text-[10px] font-mono text-text-muted">Current</span>
					<span className="text-[11px] font-mono text-text">
						{hasCurrent ? `${current.toFixed(2)}${unit}` : "N/A"}
					</span>
				</div>
				{showProposed && (
					<div className="flex items-center justify-between">
						<span className="text-[10px] font-mono text-teal/60">Proposed</span>
						<span className="text-[11px] font-mono text-teal font-medium">
							{typeof proposed === "number" ? `${proposed.toFixed(2)}${unit}` : "N/A"}
						</span>
					</div>
				)}
				{showDelta && (
					<div className="flex items-center justify-between pt-1 border-t border-border/40">
						<span className="text-[10px] font-mono text-text-muted">Delta</span>
						<span className="text-[13px] font-mono font-semibold text-text">
							{delta > 0 ? "+" : ""}{delta.toFixed(2)}{unit}
							<span className={`ml-1 text-[11px] ${directionColor}`}>{direction}</span>
						</span>
					</div>
				)}
			</div>
		</div>
	);
}

export function RedesignProposalModal({
	open,
	onOpenChange,
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
}: RedesignProposalModalProps) {
	const [expandedRow, setExpandedRow] = useState<number | null>(null);
	const [activeTab, setActiveTab] = useState<"proposal" | "risk">("proposal");
	const badge = confidenceBadge(confidence);

	const currentWeightMap = new Map<string, number>();
	for (const c of currentAllocations) {
		currentWeightMap.set(c.ticker.toUpperCase(), c.weight);
	}

	const rows = (proposed_actions ?? []).map((action) => {
		const current = currentWeightMap.get(action.ticker.toUpperCase()) ?? 0;
		const delta = action.target_pct - current;
		return { ...action, current, delta };
	});

	const hasSharpe = typeof expected_improvement?.sharpe_delta === "number";
	const hasVol = typeof expected_improvement?.volatility_delta_pct === "number";
	const hasMaxDd = typeof expected_improvement?.max_drawdown_delta_pct === "number";
	const showStressMetric = typeof riskMetrics?.current_avg_drawdown === "number";

	const proposedSharpe = hasSharpe
		? (typeof currentSharpe === "number"
			? currentSharpe + expected_improvement.sharpe_delta!
			: expected_improvement.sharpe_delta!)
		: null;

	const proposedMaxDrawdown = hasMaxDd
		? (typeof currentMaxDrawdown === "number"
			? currentMaxDrawdown + expected_improvement.max_drawdown_delta_pct!
			: expected_improvement.max_drawdown_delta_pct!)
		: null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
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

				<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "proposal" | "risk")}>
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
							Risk Analysis
						</TabsTrigger>
					</TabsList>

					<TabsContent value="proposal">
						<div className="overflow-y-auto max-h-[70vh] pr-2 custom-scrollbar space-y-5">
							{/* Proposed Allocation Table */}
							<div className="rounded border border-border overflow-hidden">
								<div className="bg-bg-elevated text-[11px] font-mono text-text-dim uppercase tracking-wide px-3 py-2 grid grid-cols-[1fr_120px_120px_80px_1fr] gap-2">
									<span>Ticker</span>
									<span className="text-right">Current</span>
									<span className="text-right">Proposed</span>
									<span className="text-right">Delta</span>
									<span>Rationale</span>
								</div>
								{rows.length > 0 ? (
									rows.map((row, i) => {
										const isExpanded = expandedRow === i;
										return (
											<div
												key={i}
												className={`grid grid-cols-[1fr_120px_120px_80px_1fr] gap-2 px-3 py-2 text-[12px] font-mono border-b border-border last:border-0 items-center transition-colors cursor-pointer ${isExpanded ? "bg-bg-elevated/50" : ""}`}
												onClick={() => setExpandedRow(isExpanded ? null : i)}
											>
												<span className="truncate font-medium text-text">
													{row.ticker}
												</span>
												<span className="text-right text-text-dim">
													{row.current.toFixed(1)}%
												</span>
												<span className="text-right text-teal font-medium">
													{row.target_pct.toFixed(1)}%
												</span>
												<span
													className={`text-right font-semibold ${
														row.delta > 0
															? "text-green"
																: row.delta < 0
																	? "text-red"
																	: "text-text-dim"
													}`}
												>
													{row.delta > 0 ? "+" : ""}{row.delta.toFixed(1)}%
												</span>
												<span className={`text-text-dim leading-snug ${isExpanded ? "whitespace-normal" : "truncate"}`}>
													{row.rationale ?? "—"}
												</span>
											</div>
										);
										})
									) : (
										<div className="px-3 py-4 text-[12px] font-mono text-text-dim italic">
											No proposed actions available.
										</div>
									)}
							</div>

							{/* Metric Cards */}
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
								<MetricCard
									label="Sharpe Ratio"
									current={currentSharpe}
									proposed={proposedSharpe}
									delta={expected_improvement?.sharpe_delta ?? null}
									unit=""
									isBetterWhenLower={false}
									showProposed={hasSharpe || proposedSharpe != null}
								/>
								<MetricCard
									label={showStressMetric ? "Avg Stress Drawdown" : "Volatility"}
									current={showStressMetric ? riskMetrics?.current_avg_drawdown ?? null : currentVolatility ?? null}
									proposed={showStressMetric ? riskMetrics?.proposed_avg_drawdown ?? null : (currentVolatility != null && hasVol ? currentVolatility + expected_improvement.volatility_delta_pct! : null)}
									delta={showStressMetric
										? (typeof riskMetrics?.proposed_avg_drawdown === "number" && typeof riskMetrics?.current_avg_drawdown === "number"
											? riskMetrics.proposed_avg_drawdown - riskMetrics.current_avg_drawdown
											: null)
										: expected_improvement?.volatility_delta_pct ?? null}
									unit="%"
									isBetterWhenLower={true}
									showProposed={showStressMetric ? (riskMetrics?.proposed_avg_drawdown != null || riskMetrics?.current_avg_drawdown != null) : hasVol}
								/>
								<MetricCard
									label="Max Drawdown"
									current={currentMaxDrawdown}
									proposed={proposedMaxDrawdown}
									delta={expected_improvement?.max_drawdown_delta_pct ?? null}
									unit="%"
									isBetterWhenLower={true}
									showProposed={hasMaxDd || proposedMaxDrawdown != null}
								/>
							</div>

							{/* Proposal Summary Bullets */}
							{proposal_summary && (
								<div className="rounded border border-border bg-bg-elevated p-3 space-y-2">
									{splitSentences(proposal_summary).map((sentence, i) => (
										<div key={i} className="flex items-start gap-2 text-[13px] text-text-dim leading-snug">
											<span className="text-teal mt-1 shrink-0">•</span>
											<span>{sentence}</span>
										</div>
										))}
									</div>
								)}
							</div>
						</TabsContent>

						<TabsContent value="risk">
							<div className="overflow-y-auto max-h-[70vh] pr-2 custom-scrollbar">
								{riskStructuredOutput && (
									<RiskAnalysisContent structuredOutput={riskStructuredOutput} />
								)}
							</div>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
