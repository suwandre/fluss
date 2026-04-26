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
	sectorExposure?: { current: Record<string, number>; proposed: Record<string, number> } | null;
}

const LABEL_TOOLTIPS: Record<string, string> = {
	"Positions": "Number of unique holdings in the portfolio.",
	"Max Position %": "Weight of the single largest holding. Lower = more diversified.",
	"Turnover": "% of portfolio value that must be traded to reach the proposed allocation.",
	"Sectors": "Number of distinct asset classes / sectors represented.",
	"Concentration": "Same as Max Position %. Measures portfolio concentration risk.",
	"Risk Score": "Composite 0–100 score. Lower = safer. Weights: drawdown (45%), VaR (30%), concentration (25%).",
};

function LabelWithTooltip({ label }: { label: string }) {
	const tooltip = LABEL_TOOLTIPS[label];
	return (
		<span title={tooltip ?? ""} className="cursor-help border-b border-dashed border-text-dim/40">
			{label}
			{tooltip && (
				<span className="inline-flex items-center justify-center w-3.5 h-3.5 ml-1 rounded-full text-[8px] font-mono bg-text-dim/15 text-text-dim align-middle">?</span>
			)}
		</span>
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

	const snapshotItems = [
		{ label: "Positions", current: currentCount, proposed: proposedCount, unit: "", showProposed: true },
		{ label: "Max Position %", current: currentMaxPos, proposed: proposedMaxPos, unit: "%", showProposed: true },
		{ label: "Turnover", current: turnover, proposed: turnover, unit: "%", showProposed: false },
		{ label: "Sectors", current: currentSectorCount, proposed: proposedSectorCount, unit: "", showProposed: true },
		{ label: "Concentration", current: currentMaxPos, proposed: proposedMaxPos, unit: "%", showProposed: true },
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
									<div className="bg-bg-elevated text-[11px] font-mono text-text-dim uppercase tracking-wide px-4 py-3 grid grid-cols-[1fr_120px_120px_80px_1fr] gap-2">
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
													className={`grid grid-cols-[1fr_120px_120px_80px_1fr] gap-2 px-4 py-3 text-[12px] font-mono border-b border-border last:border-0 items-center transition-colors cursor-pointer ${isExpanded ? "bg-bg-elevated/50" : ""}`}
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
										<div className="px-4 py-4 text-[12px] font-mono text-text-dim italic">
											No proposed actions available.
										</div>
									)}
								</div>

								{/* Sector Re-allocation Bars */}
								{sectorExposure && (
									<div className="rounded border border-border bg-bg-elevated p-5">
										<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-3">
											Sector Re-allocation
										</div>
										<div className="space-y-1">
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
													const maxBar = Math.max(s.current, s.proposed, 1);
													const currentW = (s.current / maxBar) * 100;
													const proposedW = (s.proposed / maxBar) * 100;
													return (
														<div key={s.sector} className="flex items-center gap-3">
															<span className="w-24 shrink-0 text-[11px] font-mono text-text-dim truncate">{s.sector}</span>
															<div className="flex-1 flex items-center gap-2">
																<div className="flex-1 h-2 bg-bg-card rounded overflow-hidden">
																	<div
																		className="h-full bg-[rgba(255,255,255,0.15)]"
																		style={{ width: `${currentW}%` }}
																	/>
																</div>
																<span className="text-[10px] font-mono text-text-dim w-8 text-right">{s.current.toFixed(1)}%</span>
																<span className={`text-[10px] font-mono w-8 text-center ${
																	delta >= 0 ? "text-green" : "text-red"
																}`}>
																	{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
																</span>
																<div className="flex-1 h-2 bg-bg-card rounded overflow-hidden">
																	<div
																		className="h-full bg-teal"
																		style={{ width: `${proposedW}%` }}
																	/>
																</div>
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
													<span className="text-[10px] font-mono text-text-muted">Current</span>
													<span className="text-[11px] font-mono text-text">{typeof item.current === "number" ? `${item.current.toFixed(item.unit === "%" ? 1 : 0)}${item.unit}` : "N/A"}</span>
												</div>
												{item.showProposed && (
													<div className="flex items-center justify-between">
														<span className="text-[10px] font-mono text-teal/60">Proposed</span>
														<span className="text-[11px] font-mono text-teal font-medium">{typeof item.proposed === "number" ? `${item.proposed.toFixed(item.unit === "%" ? 1 : 0)}${item.unit}` : "N/A"}</span>
													</div>
												)}
											</div>
										</div>
									))}
								</div>

								{/* Risk Score Inline */}
								{(() => {
									if (!riskScoreLine) {
										if (!riskMetrics) return null;
										return (
											<div className="text-[11px] font-mono text-text-dim">
												<LabelWithTooltip label="Risk Score" />: <span className="text-text-muted">N/A</span>
											</div>
										);
									}
									const { currentScore, proposedScore, delta, improved } = riskScoreLine;
									return (
										<div className="flex items-center gap-3 text-[11px] font-mono">
											<LabelWithTooltip label="Risk Score" />
											<span className="text-text">{currentScore.toFixed(2)}</span>
											<span className="text-text-dim">→</span>
											<span className="text-text font-medium">{proposedScore.toFixed(2)}</span>
											<span className={`px-1.5 py-px rounded-full ${improved ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>
												Δ{delta > 0 ? "+" : ""}{delta.toFixed(2)} {improved ? "Improved" : "Worsened"}
											</span>
										</div>
									);
								})()}

								{/* Proposal Summary Bullets */}
								{proposal_summary && (
									<div className="rounded border border-border bg-bg-elevated p-4 space-y-3">
										<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-1">
											<span title="The agent's own summary of the proposed changes." className="cursor-help border-b border-dashed border-text-dim/40">
												Proposal Summary
												<span className="inline-flex items-center justify-center w-3.5 h-3.5 ml-1 rounded-full text-[8px] font-mono bg-text-dim/15 text-text-dim align-middle">?</span>
											</span>
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
