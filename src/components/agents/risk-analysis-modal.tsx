"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StressResult {
	scenario: string;
	label: string;
	simulated_drawdown_pct: number;
	recovery_days: number | null;
}

interface RiskAnalysisModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	structuredOutput: Record<string, unknown>;
}

function getVerdictConfig(verdict: string) {
	const lower = verdict.toLowerCase();
	if (lower === "approved" || lower === "approve") {
		return {
			label: "Approved",
			bg: "bg-[rgba(34,197,94,0.12)]",
			border: "border-green",
			text: "text-green",
			icon: "\u2705",
		};
	}
	if (lower === "approved_with_caveats" || lower === "approve_with_caveats") {
		return {
			label: "Approved with Caveats",
			bg: "bg-[rgba(245,158,11,0.12)]",
			border: "border-amber",
			text: "text-amber",
			icon: "\u26A0\uFE0F",
		};
	}
	return {
		label: "Rejected",
		bg: "bg-[rgba(239,68,68,0.12)]",
		border: "border-red",
		text: "text-red",
		icon: "\u274C",
	};
}

function splitSentences(text: string): string[] {
	if (!text) return [];
	const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
	if (sentences.length === 0 && text.trim()) return [text.trim()];
	return sentences;
}

/* ------------------------------------------------------------------ */
/*  VaR Gauge — SVG semi-circle                                        */
/* ------------------------------------------------------------------ */

const GAUGE_R = 48;
const GAUGE_CENTER_X = 60;
const GAUGE_CENTER_Y = 50;
const GAUGE_STROKE = 8;
const GAUGE_MAX_VAL = 30; // 0–30% arc

function gaugeArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
	const start = polar(cx, cy, r, endDeg);
	const end = polar(cx, cy, r, startDeg);
	const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
	return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
	const rad = (Math.PI / 180) * angleDeg;
	return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function VaRGauge({ value }: { value: number | null }) {
	if (value === null) {
		return (
			<div className="flex flex-col items-center justify-center py-6">
				<div className="text-3xl font-mono font-bold text-text-dim">N/A</div>
				<div className="text-[11px] font-mono text-text-muted uppercase tracking-wide mt-0.5">
					Max Daily Loss (95%)
				</div>
				<div className="text-[11px] text-text-muted mt-1">Could not compute VaR</div>
			</div>
		);
	}

	const val = value;
	const clamped = Math.min(Math.max(val, 0), GAUGE_MAX_VAL);
	const pct = clamped / GAUGE_MAX_VAL;
	const endAngle = 180 - pct * 180; // 180° (left) → 0° (right)

	const color = val > 15 ? "var(--red)" : val > 8 ? "var(--amber)" : "var(--teal)";

	const arcPath = gaugeArcPath(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_R, endAngle, 180);

	return (
		<div className="flex flex-col items-center justify-center">
			<svg
				viewBox="0 0 120 70"
				className="w-40 h-auto"
			>
				{/* background track */}
				<path
					d={gaugeArcPath(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_R, 0, 180)}
					fill="none"
					stroke="var(--bg-elevated)"
					strokeWidth={GAUGE_STROKE}
					strokeLinecap="round"
				/>
				{/* animated fill */}
				<path
					d={arcPath}
					fill="none"
					stroke={color}
					strokeWidth={GAUGE_STROKE}
					strokeLinecap="round"
					className="transition-all duration-1000 ease-out"
				/>
				{/* needle */}
				<line
					x1={GAUGE_CENTER_X}
					y1={GAUGE_CENTER_Y}
					x2={polar(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_R - 2, endAngle).x}
					y2={polar(GAUGE_CENTER_X, GAUGE_CENTER_Y, GAUGE_R - 2, endAngle).y}
					stroke="var(--text)"
					strokeWidth={2}
					strokeLinecap="round"
					className="transition-all duration-1000 ease-out"
				/>
				{/* center pivot dot */}
				<circle cx={GAUGE_CENTER_X} cy={GAUGE_CENTER_Y} r={3.5} fill="var(--text)" />
			</svg>

			<div className="text-center -mt-1">
				<div className="text-3xl font-mono font-bold text-text">
					{val.toFixed(2)}%
				</div>
				<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mt-0.5">
					Max Daily Loss (95%)
				</div>
				<div className="text-[11px] text-text-muted mt-1">
					{val > 15
						? "High risk — consider diversification"
						: val > 8
							? "Elevated — monitor closely"
							: "Within acceptable range"}
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Stress Scenario Bars (HTML flex, no external chart lib)            */
/* ------------------------------------------------------------------ */

function StressBars({ data }: { data: StressResult[] }) {
	const maxDrawdown = Math.max(...data.map((d) => Math.abs(d.simulated_drawdown_pct || 0)), 1);

	return (
		<div className="space-y-3">
			{data.map((res, i) => {
				const drawdown = Math.abs(res.simulated_drawdown_pct || 0);
				const isSevere = drawdown > 15;
				const barWidth = (drawdown / maxDrawdown) * 100;
				const recovery = res.recovery_days != null ? `${res.recovery_days}d` : "—";

				return (
					<div key={i} className="flex items-center gap-3 text-[12px]">
						<span className="w-32 shrink-0 truncate text-text/80 font-medium" title={res.scenario}>
							{res.label || res.scenario}
						</span>

						<div className="flex-1 h-2.5 bg-bg-card rounded-full overflow-hidden">
							<div
								className="h-full rounded-full transition-all duration-700 ease-out"
								style={{
									width: `${barWidth}%`,
									backgroundColor: isSevere ? "var(--red)" : "var(--amber)",
								}}
							/>
						</div>

						<span className={`w-12 text-right font-mono font-semibold shrink-0 ${isSevere ? "text-red" : "text-amber"}`}>
							-{drawdown.toFixed(1)}%
						</span>

						<span className="w-10 text-right font-mono text-text-muted shrink-0">
							{recovery}
						</span>
					</div>
				);
			})}
		</div>
	);
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
}: {
	label: string;
	currentValue: number | undefined;
	proposedValue: number | undefined;
	unit: string;
	isBetterWhenLower: boolean;
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
	const color = worse ? "text-red" : better ? "text-teal" : "text-text-muted";
	const deltaSign = delta > 0 ? "+" : "";

	return (
		<div className="flex items-center justify-between px-1 py-1.5 border-b border-border/40 last:border-0">
			<span className="text-[11px] text-text-dim font-medium">{label}</span>
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
			/>
			<MetricRow
				label="Avg Stress Drawdown"
				currentValue={currentAvg}
				proposedValue={proposedAvg}
				unit="%"
				isBetterWhenLower={true}
			/>
			<MetricRow
				label="Max Stress Drawdown"
				currentValue={currentMax}
				proposedValue={proposedMax}
				unit="%"
				isBetterWhenLower={true}
			/>
			<MetricRow
				label="Concentration Score"
				currentValue={currentConc}
				proposedValue={proposedConc}
				unit=""
				isBetterWhenLower={true}
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
		// skip verdict sentences
		if (
			lower === "approved" ||
			lower === "rejected" ||
			lower === "approve" ||
			lower === "reject" ||
			lower.startsWith("approve with caveats") ||
			lower.startsWith("approved with caveats")
		) {
			return false;
		}
		return true;
	});
	if (sentences.length === 0) {
		return <div className="text-[12px] text-text-dim italic">No risks specified.</div>;
	}

	const severity = (s: string) => {
		const bad = /reject|catastrophic|critical|severe|excessive/i;
		return bad.test(s) ? { icon: "\u274C", border: "border-l-red", text: "text-red" } : { icon: "\u26A0\uFE0F", border: "border-l-amber", text: "text-amber" };
	};

	return (
		<div className="space-y-2">
			{sentences.map((s, i) => {
				const sev = severity(s);
				return (
					<div
						key={i}
						className={`rounded bg-[rgba(239,68,68,0.04)] border-l-3 ${sev.border} px-3 py-2 text-[12px] text-text/90 leading-snug flex items-start gap-2`}
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
	current_drawdown: number;
	proposed_drawdown: number;
	delta_pp: number;
}

function ScenarioComparisonTable({ data }: { data: ScenarioComparison[] }) {
	if (data.length === 0) return null;

	return (
		<div className="space-y-2">
			{data.map((row, i) => {
				const delta = row.delta_pp;
				const color =
					delta > 0
						? "text-red" // proposed worse (higher drawdown)
						: delta < 0
							? "text-teal" // proposed better
							: "text-text-muted"; // unchanged
				const bgColor =
					delta > 0
						? "bg-red/5"
						: delta < 0
							? "bg-teal/5"
							: "bg-bg-card";

				return (
					<div
						key={i}
						className={`flex items-center gap-3 px-3 py-2 rounded border border-border/40 text-[11px] ${bgColor}`}
					>
						<span className="w-28 shrink-0 truncate text-text/80 font-medium" title={row.scenario}>
							{row.scenario}
						</span>
						<span className="w-14 text-right font-mono text-text-dim">
							{row.current_drawdown.toFixed(1)}%
						</span>
						<span className="w-14 text-right font-mono text-text">→</span>
						<span className="w-14 text-right font-mono text-text">
							{row.proposed_drawdown.toFixed(1)}%
						</span>
						<span className={`w-16 text-right font-mono font-semibold ${color}`}>
							{delta > 0 ? "+" : ""}
							{delta.toFixed(1)}pp
						</span>
					</div>
				);
			})}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                   */
/* ------------------------------------------------------------------ */

export function RiskAnalysisModal({
	open,
	onOpenChange,
	structuredOutput,
}: RiskAnalysisModalProps) {
	const verdict = typeof structuredOutput.verdict === "string" ? structuredOutput.verdict : "";
	const caveats = Array.isArray(structuredOutput.caveats) ? (structuredOutput.caveats as string[]) : [];
	const riskSummary = typeof structuredOutput.risk_summary === "string" ? structuredOutput.risk_summary : "";
	const improvementSummary = typeof structuredOutput.improvement_summary === "string" ? structuredOutput.improvement_summary : "";
	const stressResults = Array.isArray(structuredOutput.stress_results) ? (structuredOutput.stress_results as StressResult[]) : [];
	const scenarioComparisons = Array.isArray(structuredOutput.scenario_comparisons)
		? (structuredOutput.scenario_comparisons as { scenario: string; current_drawdown: number; proposed_drawdown: number; delta_pp: number }[])
		: [];

	const rawVar = structuredOutput.var_95;
	let var95 = typeof rawVar === "number" ? rawVar : typeof rawVar === "string" ? parseFloat(rawVar) || null : null;
	if (var95 === 0 && stressResults.length > 0) {
		// Gauge guard: 0% with stress data present is almost certainly a parsing failure
		var95 = null;
	}

	const verdictConfig = verdict ? getVerdictConfig(verdict) : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Risk Analysis Dashboard</DialogTitle>
				</DialogHeader>

				<div className="space-y-5 overflow-y-auto max-h-[80vh] pr-2 custom-scrollbar">
					{/* Verdict Banner */}
					{verdictConfig && (
						<div className={`rounded-lg border-l-4 px-4 py-3 flex items-center gap-3 ${verdictConfig.bg} ${verdictConfig.border}`}>
							<span className="text-2xl">{verdictConfig.icon}</span>
							<div>
								<div className={`font-bold text-sm ${verdictConfig.text}`}>{verdictConfig.label}</div>
								<div className="text-[11px] text-text-dim mt-0.5">
									{verdictConfig.label === "Approved"
										? "Portfolio passes all risk thresholds."
										: verdictConfig.label === "Approved with Caveats"
											? "Portfolio is acceptable but watch flagged areas."
											: "Portfolio exceeds risk limits. Review changes."}
								</div>
							</div>
						</div>
					)}

					{/* VaR Gauge */}
					<div className="rounded-lg border border-border bg-bg-elevated p-3">
						<VaRGauge value={var95} />
					</div>

					{/* Stress Scenarios */}
					{stressResults.length > 0 && (
						<div className="rounded-lg border border-border bg-bg-elevated p-4">
							<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-3 pb-2 border-b border-border flex items-center justify-between">
								<span>Stress Scenarios</span>
								<span className="text-text-muted text-[10px] font-sans normal-case">Drawdown &rarr; Recovery</span>
							</div>
							<StressBars data={stressResults} />
						</div>
					)}

					{/* Scenario Comparison */}
					{scenarioComparisons.length > 0 && (
						<div className="rounded-lg border border-border bg-bg-elevated p-4">
							<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-3 pb-2 border-b border-border flex items-center justify-between">
								<span>Scenario Comparison</span>
								<span className="text-text-muted text-[10px] font-sans normal-case">Current → Proposed</span>
							</div>
							<ScenarioComparisonTable data={scenarioComparisons} />
						</div>
					)}

					{/* Before / After Metrics — Key Metrics Comparison */}
					{(typeof structuredOutput.current_var_95 === "number" || improvementSummary) && (
						<div className="rounded-lg border border-teal/15 bg-[rgba(20,184,166,0.04)] p-4">
							<div className="text-[11px] font-mono text-teal uppercase tracking-wide mb-3 pb-1 border-b border-teal/10">
								Portfolio Changes
							</div>
							<KeyMetricsComparison structuredOutput={structuredOutput} />
							{improvementSummary && (
								<p className="text-[12px] text-text-dim italic mt-3 pt-2 border-t border-teal/10">
									{improvementSummary}
								</p>
							)}
						</div>
					)}

					{/* Risk Factors */}
					{riskSummary && (
						<div className="rounded-lg border border-red/15 bg-[rgba(239,68,68,0.03)] p-4">
							<div className="text-[11px] font-mono text-red uppercase tracking-wide mb-3 pb-1 border-b border-red/10">
								Risk Factors
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
				</DialogContent>
			</Dialog>
		);
	}
