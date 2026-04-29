"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { useState } from "react";

interface StressResult {
	scenario: string;
	label: string;
	simulated_drawdown_pct: number;
	simulated_return_pct?: number;
	data_coverage_pct?: number;
	skipped_assets?: string[];
	recovery_days: number | null;
}

function splitSentences(text: string): string[] {
	if (!text) return [];
	const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
	if (sentences.length === 0 && text.trim()) return [text.trim()];
	return sentences;
}

/* ------------------------------------------------------------------ */
/*  Key Metrics Comparison                                             */
/* ------------------------------------------------------------------ */

function MetricRow({
	label,
	currentValue,
	proposedValue,
	unit,
	isBetterWhenLower,
	tooltip,
}: {
	label: string;
	currentValue: number | undefined;
	proposedValue: number | undefined;
	unit: string;
	isBetterWhenLower: boolean;
	tooltip?: string;
}) {
	const curr = typeof currentValue === "number" ? currentValue : null;
	const prop = typeof proposedValue === "number" ? proposedValue : null;

	if (curr === null || prop === null) {
		return (
			<div className="flex items-center justify-between px-1 py-1.5">
				<span className="text-[11px] text-text-dim font-medium">{label}</span>
				<span className="text-[11px] text-text-muted italic">N/A</span>
			</div>
		);
	}

	const delta = prop - curr;
	const better = isBetterWhenLower ? delta < 0 : delta > 0;
	const worse = isBetterWhenLower ? delta > 0 : delta < 0;
	const color = worse ? "text-red" : better ? "text-green" : "text-text-muted";
	const deltaSign = delta > 0 ? "+" : "";
	const arrow = better ? "▼" : worse ? "▲" : "→";

	const labelContent = tooltip ? (
		<Tooltip>
			<TooltipTrigger
				render={
					<span className="inline-flex cursor-help items-center gap-1"
						style={{ borderBottom: "none" }}
					/>
				}
			>
				<span className="border-b border-dashed border-text-dim/40">{label}</span>
				<span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-mono bg-text-dim/15 text-text-dim align-middle">?</span>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				className="max-w-[220px] border border-border bg-bg-elevated text-[11px] font-mono leading-snug text-text shadow-lg"
			>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	) : (
		<span>{label}</span>
	);

	return (
		<div className="flex items-center justify-between px-1 py-1.5 border-b border-border/40 last:border-0">
			<span className="text-[11px] text-text-dim font-medium">{labelContent}</span>
			<div className="flex items-center gap-3">
				<div className="text-right">
					<div className="text-[10px] text-text-muted">Current</div>
					<div className="text-[11px] font-mono text-text">{curr.toFixed(2)}{unit}</div>
				</div>
				<div className="text-right">
					<div className="text-[10px] text-teal/60">Proposed</div>
					<div className="text-[11px] font-mono text-teal font-medium">{prop.toFixed(2)}{unit}</div>
				</div>
				<div className="w-16 text-right">
					<div className={`text-[11px] font-mono font-semibold ${color}`}>
						{deltaSign}{delta.toFixed(2)}pp
						<span className="ml-1">{arrow}</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function KeyMetricsComparison({
	structuredOutput,
}: {
	structuredOutput: Record<string, unknown>;
}) {
	const currentVar95 = typeof structuredOutput.current_var_95 === "number" ? structuredOutput.current_var_95 : undefined;
	const proposedVar95 = typeof structuredOutput.var_95 === "number" ? structuredOutput.var_95 : undefined;
	const currentAvg = typeof structuredOutput.current_avg_drawdown === "number" ? structuredOutput.current_avg_drawdown : undefined;
	const proposedAvg = typeof structuredOutput.proposed_avg_drawdown === "number" ? structuredOutput.proposed_avg_drawdown : undefined;
	const currentMax = typeof structuredOutput.current_max_drawdown === "number" ? structuredOutput.current_max_drawdown : undefined;
	const proposedMax = typeof structuredOutput.proposed_max_drawdown === "number" ? structuredOutput.proposed_max_drawdown : undefined;
	const currentConc = typeof structuredOutput.current_concentration_score === "number" ? structuredOutput.current_concentration_score : undefined;
	const proposedConc = typeof structuredOutput.proposed_concentration_score === "number" ? structuredOutput.proposed_concentration_score : undefined;

	return (
		<div className="space-y-0">
			<MetricRow
				label="VaR 95%"
				currentValue={currentVar95}
				proposedValue={proposedVar95}
				unit="%"
				isBetterWhenLower={true}
				tooltip="Value at Risk: worst expected daily loss at 95% confidence. Lower = better."
			/>
			<MetricRow
				label="Avg Stress Drawdown"
				currentValue={currentAvg}
				proposedValue={proposedAvg}
				unit="%"
				isBetterWhenLower={true}
				tooltip="Average drawdown across all stress scenarios. Lower = better."
			/>
			<MetricRow
				label="Max Stress Drawdown"
				currentValue={currentMax}
				proposedValue={proposedMax}
				unit="%"
				isBetterWhenLower={true}
				tooltip="Worst-case single-scenario drawdown. Lower = better."
			/>
			<MetricRow
				label="Concentration Score"
				currentValue={currentConc}
				proposedValue={proposedConc}
				unit=""
				isBetterWhenLower={true}
				tooltip="Portfolio concentration risk measure. Lower = more diversified."
			/>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Risk Factor Cards                                                */
/* ------------------------------------------------------------------ */

function RiskCards({ text }: { text: string }) {
	const sentences = splitSentences(text).filter((s) => {
		const lower = s.trim().toLowerCase();
		// skip verdict / CTA sentences
		if (
			lower === "approved" ||
			lower === "rejected" ||
			lower === "approve" ||
			lower === "reject" ||
			lower === "approve with caveats" ||
			lower === "approved with caveats" ||
			lower.startsWith("approve with caveats") ||
			lower.startsWith("approved with caveats") ||
			lower === "approve this proposal" ||
			lower.startsWith("approve this proposal") ||
			lower === "reject this proposal" ||
			lower.startsWith("reject this proposal")
		) {
			return false;
		}
		return true;
	});
	if (sentences.length === 0) {
		return <div className="text-[12px] text-text-dim italic">No risks specified.</div>;
	}

	function sentimentConfig(s: string) {
		const lower = s.toLowerCase();
		const bad = /reject|catastrophic|critical|severe|excessive|worse|higher|increased|dangerous|fragile|vulnerable|fails|breach/i;
		const good = /improve|better|lower|approved|less risky|reduce|within range|shallower|shorter|passes|broad-based|safe|meaningfully less|reduction|decrease|falling|improvement|decline|recover/i;
		if (bad.test(lower)) return { icon: "❌", border: "border-l-red", text: "text-red", bg: "bg-[rgba(239,68,68,0.04)]" };
		if (good.test(lower)) return { icon: "✅", border: "border-l-green", text: "text-green", bg: "bg-[rgba(34,197,94,0.04)]" };
		return { icon: "⚠️", border: "border-l-amber", text: "text-amber", bg: "bg-[rgba(245,158,11,0.04)]" };
	}

	return (
		<div className="space-y-2">
			{sentences.map((s, i) => {
				const sev = sentimentConfig(s);
				return (
					<div
						key={i}
						className={`rounded ${sev.bg} border-l-3 ${sev.border} px-3 py-2 text-[12px] text-text/90 leading-snug flex items-start gap-2`}
					>
						<span className="shrink-0 mt-0.5">{sev.icon}</span>
						<span>{s}</span>
					</div>
				);
			})}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Scenario Comparison Table                                        */
/* ------------------------------------------------------------------ */

interface ScenarioComparison {
	scenario: string;
	current_drawdown?: number;
	proposed_drawdown?: number;
	delta_pp?: number;
	current_return?: number;
	proposed_return?: number;
	delta_return_pp?: number;
	current_data_coverage_pct?: number;
	proposed_data_coverage_pct?: number;
}

function StressTooltip({ label, tip }: { label: string; tip: string }) {
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
			</TooltipTrigger>
			<TooltipContent
				side="top"
				className="max-w-[220px] border border-border bg-bg-elevated text-[11px] font-mono leading-snug text-text shadow-lg"
			>
				{tip}
			</TooltipContent>
		</Tooltip>
	);
}

function parseScenario(full: string): { name: string; period: string } {
	// "Name (Period)" format
	const m = full.match(/^(.+?)\s*\((.+)\)\s*$/);
	if (m) return { name: m[1].trim(), period: m[2].trim() };
	// "Month YYYY Name" format (e.g. "May 2021 Crypto Crash")
	const m2 = full.match(/^([A-Za-z]+\s+\d{4})\s+(.+)$/);
	if (m2) return { name: m2[2].trim(), period: m2[1].trim() };
	return { name: full.trim(), period: "" };
}

function UnifiedStressBars({
	stressResults,
	scenarioComparisons,
}: {
	stressResults: StressResult[];
	scenarioComparisons: ScenarioComparison[];
}) {
	const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

	const recoveryMap = new Map<string, number | null>();
	for (const r of stressResults) {
		recoveryMap.set(r.scenario, r.recovery_days);
	}

	return (
		<div>
			<div className="bg-bg-elevated text-[11px] font-mono text-text-dim uppercase tracking-wide px-4 py-3 grid grid-cols-[minmax(120px,1fr)_110px_80px_80px_80px_80px] gap-3 border-b border-border">
				<span>
					<StressTooltip label="Scenario" tip="Historical stress event name." />
				</span>
				<span>
					<StressTooltip label="Period" tip="Date range of the historical stress event." />
				</span>
				<span className="text-right">
					<StressTooltip label="Current" tip="Drawdown under current portfolio allocation" />
				</span>
				<span className="text-right">
					<StressTooltip label="Proposed" tip="Drawdown under proposed portfolio allocation" />
				</span>
				<span className="text-right">
					<StressTooltip label="Delta" tip="Difference in percentage points. Negative = improvement" />
				</span>
				<span className="text-right">
					<StressTooltip label="Recovery" tip="Estimated days to recover to breakeven" />
				</span>
			</div>
			{scenarioComparisons.map((row, i) => {
				const currentDd = typeof row.current_drawdown === "number" ? Math.abs(row.current_drawdown) : null;
				const proposedDd = typeof row.proposed_drawdown === "number" ? Math.abs(row.proposed_drawdown) : null;
				const delta = row.delta_pp;
				const recovery = recoveryMap.get(row.scenario);
				const recoveryText = recovery != null ? `${recovery}d` : "—";
				const isProposedSevere = proposedDd != null && proposedDd > 15;
				const deltaColor =
					typeof delta !== "number"
						? "text-text-muted"
						: delta > 0
							? "text-red"
							: delta < 0
								? "text-green"
								: "text-text-muted";
				const isExpanded = expandedRows.has(i);
				const { name, period } = parseScenario(row.scenario);
				const currentCoverage = row.current_data_coverage_pct;
				const proposedCoverage = row.proposed_data_coverage_pct;
				const hasCoverageGap =
					(typeof currentCoverage === "number" && currentCoverage < 99.5) ||
					(typeof proposedCoverage === "number" && proposedCoverage < 99.5) ||
					currentDd == null ||
					proposedDd == null;

				return (
					<div key={i} className="border-b border-border last:border-0">
						<div
							className="grid grid-cols-[minmax(120px,1fr)_110px_80px_80px_80px_80px] gap-3 px-4 py-3 text-[12px] font-mono items-center cursor-pointer transition-colors hover:bg-bg-elevated/30"
							onClick={() =>
								setExpandedRows((prev) => {
									const next = new Set(prev);
									if (next.has(i)) next.delete(i);
									else next.add(i);
									return next;
								})
							}
						>
							<span className={isExpanded ? "whitespace-normal break-words" : "truncate"}>
								<span className="font-medium text-text">{name}</span>
								{hasCoverageGap && (
									<span className="block text-[10px] text-text-muted">
										Coverage {typeof currentCoverage === "number" ? `${currentCoverage.toFixed(0)}%` : "N/A"} / {typeof proposedCoverage === "number" ? `${proposedCoverage.toFixed(0)}%` : "N/A"}
									</span>
								)}
							</span>
							<span className={`text-text-dim ${isExpanded ? "whitespace-normal break-words" : "truncate"}`}>{period}</span>
							<span className="text-right text-text-dim">
								{currentDd == null ? "N/A" : `-${currentDd.toFixed(1)}%`}
							</span>
							<span className={`text-right font-semibold ${isProposedSevere ? "text-red" : "text-amber"}`}>
								{proposedDd == null ? "N/A" : `-${proposedDd.toFixed(1)}%`}
							</span>
							<span className={`text-right font-semibold ${deltaColor}`}>
								{typeof delta === "number" ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp` : "N/A"}
							</span>
							<span className="text-right text-text-muted">{recoveryText}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function UpsideScenariosTable({
	scenarioComparisons,
}: {
	scenarioComparisons: ScenarioComparison[];
}) {
	const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
	const upsideRows = scenarioComparisons
		.filter(
			(row) =>
				typeof row.current_return === "number" &&
				typeof row.proposed_return === "number" &&
				(row.current_return > 0 || row.proposed_return > 0),
		)
		.sort((a, b) => (b.proposed_return ?? 0) - (a.proposed_return ?? 0));

	if (upsideRows.length === 0) return null;

	return (
		<div>
			{upsideRows.length < 4 && (
				<div className="px-4 pb-3 text-[11px] font-mono text-amber">
					Limited upside evidence: only {upsideRows.length} applicable positive historical {upsideRows.length === 1 ? "regime" : "regimes"} found for both portfolios.
				</div>
			)}
			<div className="bg-bg-elevated text-[11px] font-mono text-text-dim uppercase tracking-wide px-4 py-3 grid grid-cols-[minmax(120px,1fr)_110px_90px_90px_80px] gap-3 border-b border-border">
				<span>
					<StressTooltip label="Scenario" tip="Historical scenario name." />
				</span>
				<span>
					<StressTooltip label="Period" tip="Date range of the historical scenario." />
				</span>
				<span className="text-right">
					<StressTooltip label="Current" tip="Return under current portfolio allocation" />
				</span>
				<span className="text-right">
					<StressTooltip label="Proposed" tip="Return under proposed portfolio allocation" />
				</span>
				<span className="text-right">
					<StressTooltip label="Delta" tip="Difference in percentage points. Positive = more upside" />
				</span>
			</div>
			{upsideRows.slice(0, 5).map((row, i) => {
				const { name, period } = parseScenario(row.scenario);
				const currentReturn = row.current_return ?? 0;
				const proposedReturn = row.proposed_return ?? 0;
				const delta = row.delta_return_pp ?? proposedReturn - currentReturn;
				const deltaColor = delta > 0 ? "text-green" : delta < 0 ? "text-red" : "text-text-muted";

				return (
					<div
						key={`${row.scenario}-${i}`}
						className="grid grid-cols-[minmax(120px,1fr)_110px_90px_90px_80px] gap-3 px-4 py-3 text-[12px] font-mono items-center border-b border-border last:border-0 cursor-pointer transition-colors hover:bg-bg-elevated/30"
						onClick={() =>
							setExpandedRows((prev) => {
								const next = new Set(prev);
								if (next.has(i)) next.delete(i);
								else next.add(i);
								return next;
							})
						}
					>
						<span className={`font-medium text-text ${expandedRows.has(i) ? "whitespace-normal break-words" : "truncate"}`}>{name}</span>
						<span className={`text-text-dim ${expandedRows.has(i) ? "whitespace-normal break-words" : "truncate"}`}>{period}</span>
						<span className="text-right text-text-dim">
							{currentReturn > 0 ? "+" : ""}{currentReturn.toFixed(1)}%
						</span>
						<span className="text-right font-semibold text-teal">
							{proposedReturn > 0 ? "+" : ""}{proposedReturn.toFixed(1)}%
						</span>
						<span className={`text-right font-semibold ${deltaColor}`}>
							{delta > 0 ? "+" : ""}{delta.toFixed(1)}pp
						</span>
					</div>
				);
			})}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Inline Metric Card (mirrors Proposal tab style)                    */
/* ------------------------------------------------------------------ */

function InlineMetricCard({
	label,
	current,
	proposed,
	delta,
	unit,
	isBetterWhenLower,
	tooltip,
}: {
	label: string;
	current: number | null | undefined;
	proposed: number | null | undefined;
	delta: number | null | undefined;
	unit: string;
	isBetterWhenLower: boolean;
	tooltip?: string;
}) {
	const hasCurrent = typeof current === "number";
	const hasProposed = typeof proposed === "number";
	const hasDelta = typeof delta === "number";
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
		<div className="rounded border border-border bg-bg-elevated p-4">
			<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-3">
				<Tooltip>
					<TooltipTrigger
						render={
							<span className="inline-flex cursor-help items-center gap-1"
								style={{ borderBottom: "none" }}
							/>
						}
					>
						<span className="border-b border-dashed border-text-dim/40">{label}</span>
						{tooltip && (
							<span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-mono bg-text-dim/15 text-text-dim align-middle">?</span>
						)}
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="max-w-[220px] border border-border bg-bg-elevated text-[11px] font-mono leading-snug text-text shadow-lg"
					>
						{tooltip}
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="space-y-1">
				<div className="flex items-center justify-between">
					<span className="text-[10px] font-mono text-text-muted">Current</span>
					<span className="text-[11px] font-mono text-text">
						{hasCurrent ? `${current.toFixed(2)}${unit}` : "N/A"}
					</span>
				</div>
				{hasProposed && (
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

/* ------------------------------------------------------------------ */
/*  Risk Analysis Content                                                                                         */
/* ------------------------------------------------------------------ */

export function RiskAnalysisContent({
	structuredOutput,
	currentSharpe,
	currentVolatility,
	currentMaxDrawdown,
	sharpeDelta,
}: {
	structuredOutput: Record<string, unknown>;
	currentSharpe?: number | null;
	currentVolatility?: number | null;
	currentMaxDrawdown?: number | null;
	sharpeDelta?: number | null;
}) {
	const caveats = Array.isArray(structuredOutput.caveats) ? (structuredOutput.caveats as string[]) : [];
	const riskSummary = typeof structuredOutput.risk_summary === "string" ? structuredOutput.risk_summary : "";
	const improvementSummary = typeof structuredOutput.improvement_summary === "string" ? structuredOutput.improvement_summary : "";
	const stressResults = Array.isArray(structuredOutput.stress_results) ? (structuredOutput.stress_results as StressResult[]) : [];
	const scenarioComparisons = Array.isArray(structuredOutput.scenario_comparisons)
		? (structuredOutput.scenario_comparisons as ScenarioComparison[])
		: [];
	const currentExpectedReturn =
		typeof structuredOutput.current_expected_return_90d === "number"
			? structuredOutput.current_expected_return_90d
			: null;
	const proposedExpectedReturn =
		typeof structuredOutput.proposed_expected_return_90d === "number"
			? structuredOutput.proposed_expected_return_90d
			: null;
	const currentUpsideDownside =
		typeof structuredOutput.current_upside_downside_ratio === "number"
			? structuredOutput.current_upside_downside_ratio
			: null;
	const proposedUpsideDownside =
		typeof structuredOutput.proposed_upside_downside_ratio === "number"
			? structuredOutput.proposed_upside_downside_ratio
			: null;

	const rawVar = structuredOutput.var_95;
	let var95 = typeof rawVar === "number" ? rawVar : typeof rawVar === "string" ? parseFloat(rawVar) || null : null;
	if (var95 === 0 && stressResults.length > 0) {
		// Gauge guard: 0% with stress data present is almost certainly a parsing failure
		var95 = null;
	}

	return (
		<>
			<div className="space-y-5">
				{/* Risk Metric Cards (from Proposal tab) */}
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<InlineMetricCard
						label="Sharpe Ratio"
						current={currentSharpe ?? null}
						proposed={typeof currentSharpe === "number" && typeof sharpeDelta === "number" ? currentSharpe + sharpeDelta : (typeof sharpeDelta === "number" ? sharpeDelta : null)}
						delta={sharpeDelta ?? null}
						unit=""
						isBetterWhenLower={false}
						tooltip="Risk-adjusted return metric. Higher = better."
					/>
					<InlineMetricCard
						label="Expected Return"
						current={currentExpectedReturn}
						proposed={proposedExpectedReturn}
						delta={
							typeof currentExpectedReturn === "number" &&
							typeof proposedExpectedReturn === "number"
								? proposedExpectedReturn - currentExpectedReturn
								: null
						}
						unit="%"
						isBetterWhenLower={false}
						tooltip="Historical 90-day portfolio return estimate. Higher = better."
					/>
					<InlineMetricCard
						label="Upside / Downside"
						current={currentUpsideDownside}
						proposed={proposedUpsideDownside}
						delta={
							typeof currentUpsideDownside === "number" &&
							typeof proposedUpsideDownside === "number"
								? proposedUpsideDownside - currentUpsideDownside
								: null
						}
						unit=""
						isBetterWhenLower={false}
						tooltip="Positive daily returns divided by absolute negative daily returns over the lookback window. Higher = better."
					/>
					<InlineMetricCard
						label="Avg Stress Drawdown"
						current={typeof structuredOutput.current_avg_drawdown === "number" ? structuredOutput.current_avg_drawdown as number : currentVolatility ?? null}
						proposed={typeof structuredOutput.proposed_avg_drawdown === "number" ? structuredOutput.proposed_avg_drawdown as number : null}
						delta={
							typeof structuredOutput.current_avg_drawdown === "number" && typeof structuredOutput.proposed_avg_drawdown === "number"
								? (structuredOutput.proposed_avg_drawdown as number) - (structuredOutput.current_avg_drawdown as number)
								: null
						}
						unit="%"
						isBetterWhenLower={true}
						tooltip="Average drawdown across all stress scenarios. Lower = better."
					/>
					<InlineMetricCard
						label="Peak-to-Trough Drawdown"
						current={typeof structuredOutput.current_max_drawdown === "number" ? structuredOutput.current_max_drawdown as number : currentMaxDrawdown ?? null}
						proposed={typeof structuredOutput.proposed_max_drawdown === "number" ? structuredOutput.proposed_max_drawdown as number : null}
						delta={
							typeof structuredOutput.current_max_drawdown === "number" && typeof structuredOutput.proposed_max_drawdown === "number"
								? (structuredOutput.proposed_max_drawdown as number) - (structuredOutput.current_max_drawdown as number)
								: null
						}
						unit="%"
						isBetterWhenLower={true}
						tooltip="Worst-case single-scenario drawdown. Lower = better."
					/>
					<InlineMetricCard
						label="Max Daily Loss (95%)"
						current={typeof structuredOutput.current_var_95 === "number" ? structuredOutput.current_var_95 as number : null}
						proposed={var95}
						delta={
							typeof structuredOutput.current_var_95 === "number" && typeof var95 === "number"
								? var95 - (structuredOutput.current_var_95 as number)
								: null
						}
						unit="%"
						isBetterWhenLower={true}
						tooltip="Value at Risk: worst expected daily loss at 95% confidence. Lower = better."
					/>
				</div>

				{/* Stress Comparison — merged scenarios */}
				{scenarioComparisons.length > 0 && (
					<div className="rounded-lg border border-border bg-bg-elevated p-4">
						<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-3 pb-2 border-b border-border flex items-center justify-between">
							<StressTooltip label="Stress Scenarios" tip="Scenario-by-scenario stress test comparing current vs proposed portfolio drawdowns" />
						</div>
						<UnifiedStressBars stressResults={stressResults} scenarioComparisons={scenarioComparisons} />
					</div>
				)}

				{scenarioComparisons.some(
					(row) =>
						typeof row.proposed_return === "number" &&
						typeof row.current_return === "number" &&
						(row.current_return > 0 || row.proposed_return > 0),
				) && (
					<div className="rounded-lg border border-border bg-bg-elevated p-4">
						<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-3 pb-2 border-b border-border flex items-center justify-between">
							<StressTooltip label="Upside Scenarios" tip="Historical scenario returns comparing current vs proposed portfolio allocations." />
						</div>
						<UpsideScenariosTable scenarioComparisons={scenarioComparisons} />
					</div>
				)}

				{/* Before / After Metrics — Key Metrics Comparison */}
				{(typeof structuredOutput.current_var_95 === "number" || improvementSummary) && (
					<div className="rounded-lg border border-border bg-bg-elevated p-4">
						<div className="text-[10px] font-mono uppercase text-text-dim tracking-wide mb-3 pb-2 border-b border-border flex items-center justify-between">
							<StressTooltip label="Portfolio Changes" tip="Aggregated risk metrics comparing current vs proposed portfolio." />
						</div>
						<KeyMetricsComparison structuredOutput={structuredOutput} />
					</div>
				)}

				{/* Risk Assessment Summary */}
				{riskSummary && (
					<div className="rounded-lg border border-border bg-bg-elevated p-4">
						<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-3 pb-1 border-b border-border">
							Risk Assessment Summary
						</div>
						<RiskCards text={riskSummary} />
					</div>
				)}

				{/* Caveats */}
				{caveats.length > 0 && (
					<div className="rounded-lg border border-border bg-bg-elevated p-4">
						<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-2">
							Caveats
						</div>
						<div className="flex flex-col gap-2">
							{caveats.map((c, i) => (
								<div
									key={i}
									className="bg-amber/10 border border-amber/20 text-amber rounded px-3 py-1.5 text-[11px]"
								>
									{c}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</>
	);
}
