"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
	sectorExposure?: { current: Record<string, number>; proposed: Record<string, number> } | null;
}

const LABEL_TOOLTIPS: Record<string, string> = {
	"Positions": "Number of unique holdings in the portfolio.",
	"Position Changes": "New = tickers being added. Exited = tickers being fully sold.",
	"Rebalance Turnover": "% of portfolio value that must be traded to reach the proposed allocation.",
	"Sector Re-allocation": "How sector weights shift from current to proposed allocation.",
	"Sectors": "Number of distinct asset classes / sectors represented.",
	"Max Position %": "Weight of the single largest holding. Lower = more diversified.",
	"Risk Score": "Composite 0–100 score. Lower = safer. Weights: drawdown (45%), VaR (30%), concentration (25%).",
	"Proposal Summary": "The agent's own summary of the proposed changes.",
};

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

function splitSentences(text: string): string[] {
	if (!text) return [];
	const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
	if (sentences.length === 0 && text.trim()) return [text.trim()];
	return sentences;
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
						stroke="teal"
						strokeWidth={10}
						strokeLinecap="round"
					/>
					{/* Current dot */}
					<circle cx={currentDotX} cy={currentDotY} r={4} fill="rgba(255,255,255,0.4)" />
					{/* Proposed dot */}
					<circle cx={proposedDotX} cy={proposedDotY} r={4} fill="teal" />
				</svg>
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-2 flex flex-col items-center">
					<span className="text-3xl font-mono font-bold text-teal">{proposedScore.toFixed(1)}</span>
					<span className={`px-1.5 py-px rounded-full text-[10px] font-mono ${improved ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>
						Δ{delta > 0 ? "+" : ""}{delta.toFixed(2)} {improved ? "Improved" : "Worsened"}
					</span>
					<span className="text-[10px] text-text-dim mt-0.5">Lower is better</span>
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

	// Snapshot card computations
	const currentCount = currentAllocations.length;
	const proposedCount = (proposed_actions ?? []).length;
	const currentMaxPos = currentAllocations.length > 0 ? Math.max(...currentAllocations.map(c => c.weight)) : 0;
	const proposedMaxPos = (proposed_actions ?? []).length > 0 ? Math.max(...(proposed_actions ?? []).map(a => a.target_pct)) : 0;
	// Turnover
	const currentMap = new Map<string, number>();
	for (const c of currentAllocations) currentMap.set(c.ticker.toUpperCase(), c.weight);
	const allTickers = new Set<string>();
	for (const c of currentAllocations) allTickers.add(c.ticker.toUpperCase());
	for (const a of (proposed_actions ?? [])) allTickers.add(a.ticker.toUpperCase());
	let turnoverSum = 0;
	for (const t of allTickers) {
		const cur = currentMap.get(t) ?? 0;
		const prop = (proposed_actions ?? []).find(a => a.ticker.toUpperCase() === t)?.target_pct ?? 0;
		turnoverSum += Math.abs(prop - cur);
	}
	const turnover = turnoverSum / 2;
	// Sectors (use actual sector keys from exposure, fallback to ticker count)
	const currentSectorKeys = new Set(Object.keys(sectorExposure?.current ?? {}));
	const proposedSectorKeys = new Set(Object.keys(sectorExposure?.proposed ?? {}));
	const currentSectorCount = currentSectorKeys.size || currentCount;
	const proposedSectorCount = proposedSectorKeys.size || proposedCount;

	// Position changes
	const proposedTickerSet = new Set((proposed_actions ?? []).map(a => a.ticker.toUpperCase()));
	const newPositions = (proposed_actions ?? []).filter(a => a.target_pct > 0 && !(currentWeightMap.get(a.ticker.toUpperCase()) ?? 0)).length;
	const exitedPositions = currentAllocations.filter(c => c.weight > 0 && !proposedTickerSet.has(c.ticker.toUpperCase())).length;

	const snapshotItems = [
		{ label: "Positions", current: currentCount, proposed: proposedCount, unit: "", showProposed: true },
		{ label: "Position Changes", current: newPositions, proposed: exitedPositions, unit: "", showProposed: true },
		{ label: "Sectors", current: currentSectorCount, proposed: proposedSectorCount, unit: "", showProposed: true },
		{ label: "Max Position %", current: currentMaxPos, proposed: proposedMaxPos, unit: "%", showProposed: true },
	];

	// Risk Score inline line
	const riskScoreLine = (() => {
		if (!riskMetrics) return null;
		const currentVar = riskMetrics.current_var_95;
		const proposedVar = riskMetrics.proposed_var_95;
		const currentAvg = riskMetrics.current_avg_drawdown;
		const proposedAvg = riskMetrics.proposed_avg_drawdown;
		const currentMax = riskMetrics.current_max_drawdown;
		const proposedMax = riskMetrics.proposed_max_drawdown;
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl p-6">
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

					<div className="h-[65vh] overflow-y-auto pr-2 custom-scrollbar space-y-5">
						<TabsContent value="proposal">
							<div className="space-y-6">
								{/* Proposed Allocation Table */}
								<div className="rounded border border-border overflow-hidden">
									<div className="bg-bg-elevated text-[11px] font-mono text-text-dim uppercase tracking-wide px-4 py-3 grid grid-cols-[80px_100px_100px_100px_1fr] gap-4">
										<span>Ticker</span>
										<span className="text-right">Current</span>
										<span className="text-right">Proposed</span>
										<span className="text-right">Delta</span>
										<span className="pl-6">Rationale</span>
									</div>
									{rows.length > 0 ? (
										rows.map((row, i) => {
											const isExpanded = expandedRow === i;
											return (
												<div key={i}>
													<div
														className={`grid grid-cols-[80px_100px_100px_100px_1fr] gap-4 px-4 py-3 text-[12px] font-mono border-b border-border last:border-0 items-center transition-colors ${isExpanded ? "bg-bg-elevated/50" : ""}`}
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
														<span className={`text-right font-semibold ${row.delta > 0 ? "text-green" : row.delta < 0 ? "text-red" : "text-text-dim"}`}>
															{row.delta > 0 ? "+" : ""}{row.delta.toFixed(1)}%
														</span>
														<span className="flex items-center justify-center">
															<button
																onClick={(e) => { e.stopPropagation(); setExpandedRow(isExpanded ? null : i); }}
																className="text-teal text-[11px] font-mono underline underline-offset-2 hover:text-teal/70 cursor-pointer"
															>
																{isExpanded ? "Hide Rationale" : "View Rationale"}
															</button>
														</span>
													</div>
													{isExpanded && (
														<div className="px-4 py-2 text-[12px] font-mono text-text-dim bg-bg-elevated/30 border-b border-border">
															{row.rationale ?? "—"}
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
																		className="absolute top-0 h-full bg-teal"
																		style={{ left: 0, width: `${Math.min(s.proposed, 100)}%` }}
																	/>
																</div>
															<span className={`text-[10px] font-mono w-8 text-right ${
																delta >= 0 ? "text-green" : "text-red"
															}`}>
																{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
															</span>
															<span className="text-[10px] font-mono text-teal w-8 text-right">{s.proposed.toFixed(1)}%</span>
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
											<span className="text-[10px] font-mono text-teal/60">{item.label === "Position Changes" ? "Exited" : "Proposed"}</span>
											<span className="text-[11px] font-mono text-teal font-medium">{typeof item.proposed === "number" ? `${item.proposed.toFixed(item.unit === "%" ? 1 : 0)}${item.unit}` : "N/A"}</span>
										</div>
									)}
								</div>
										</div>
									))}
								</div>

							{/* Risk Score + Turnover Gauges */}
							<div className="grid grid-cols-2 gap-3">
								<TurnoverGauge turnover={turnover} />
								{(() => {
									if (!riskScoreLine) {
										if (!riskMetrics) {
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
								{proposal_summary && (
									<div className="rounded border border-border bg-bg-elevated p-4 space-y-3">
										<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-1">
											<LabelWithTooltip label="Proposal Summary" />
										</div>
										{splitSentences(proposal_summary).map((sentence, i) => (
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
								{riskStructuredOutput && (
									<RiskAnalysisContent
										structuredOutput={riskStructuredOutput}
										currentSharpe={currentSharpe}
										currentVolatility={currentVolatility}
										currentMaxDrawdown={currentMaxDrawdown}
										sharpeDelta={expected_improvement?.sharpe_delta ?? null}
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
