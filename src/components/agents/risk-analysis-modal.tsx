"use client";

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

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
			icon: "✅",
		};
	}
	if (lower === "approved_with_caveats" || lower === "approve_with_caveats") {
		return {
			label: "Approved with Caveats",
			bg: "bg-[rgba(245,158,11,0.12)]",
			border: "border-amber",
			text: "text-amber",
			icon: "⚠️",
		};
	}
	return {
		label: "Rejected",
		bg: "bg-[rgba(239,68,68,0.12)]",
		border: "border-red",
		text: "text-red",
		icon: "❌",
	};
}

function splitSentences(text: string): string[] {
	if (!text) return [];
	const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
	if (sentences.length === 0 && text.trim()) return [text.trim()];
	return sentences;
}

export function RiskAnalysisModal({
	open,
	onOpenChange,
	structuredOutput,
}: RiskAnalysisModalProps) {
	const verdict =
		typeof structuredOutput.verdict === "string"
			? structuredOutput.verdict
			: "";
	const caveats = Array.isArray(structuredOutput.caveats)
		? (structuredOutput.caveats as string[])
		: [];
	const riskSummary =
		typeof structuredOutput.risk_summary === "string"
			? structuredOutput.risk_summary
			: "";
	const improvementSummary =
		typeof structuredOutput.improvement_summary === "string"
			? structuredOutput.improvement_summary
			: "";
	const var95 =
		typeof structuredOutput.var_95 === "number"
			? structuredOutput.var_95
			: null;
	const stressResults = Array.isArray(structuredOutput.stress_results)
		? structuredOutput.stress_results
		: [];

	const verdictConfig = verdict ? getVerdictConfig(verdict) : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Risk Analysis Dashboard</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 overflow-y-auto max-h-[80vh] pr-2">
					{/* Verdict Banner */}
					{verdictConfig && (
						<div
							className={`rounded-md border-l-4 px-3 py-2.5 ${verdictConfig.bg} ${verdictConfig.border}`}
						>
							<div className="flex items-center gap-2">
								<span className="text-lg">{verdictConfig.icon}</span>
								<span className={`font-semibold text-sm ${verdictConfig.text}`}>
									{verdictConfig.label}
								</span>
							</div>
						</div>
					)}

					{/* Top Metrics Row */}
					<div className="grid grid-cols-2 gap-4">
						{/* VaR 95% KPI */}
						<div className="rounded-md border border-border bg-bg-elevated p-3 flex flex-col justify-center">
							<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-2 flex items-center justify-between">
								<span>Value at Risk (95%)</span>
								<span className="text-text-dim">Max Daily Loss</span>
							</div>
							<div className="flex items-end gap-3 mb-2">
								<div className="text-3xl font-mono font-semibold text-text leading-none">
									{var95 !== null ? `${var95}%` : "N/A"}
								</div>
							</div>
							{var95 !== null && (
								<div className="h-1.5 w-full bg-bg-card rounded-full overflow-hidden mt-1">
									<div 
										className={`h-full rounded-full transition-all duration-500 ${var95 > 15 ? 'bg-red' : var95 > 8 ? 'bg-amber' : 'bg-teal'}`} 
										style={{ width: `${Math.min(var95 * 2, 100)}%` }}
									/>
								</div>
							)}
						</div>

						{/* Concentration / Caveats */}
						<div className="rounded-md border border-border bg-bg-elevated p-3 flex flex-col justify-center">
							<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-2">
								Risk Concentration & Caveats
							</div>
							{caveats.length > 0 ? (
								<div className="flex flex-wrap gap-1.5 max-h-[60px] overflow-y-auto">
									{caveats.map((caveat: string, i: number) => (
										<span key={i} className="bg-amber/10 border border-amber/20 text-amber rounded px-2 py-0.5 text-[11px] leading-tight">
											{caveat}
										</span>
									))}
								</div>
							) : (
								<div className="text-sm text-text-dim italic flex items-center h-full">No major concentration risks identified.</div>
							)}
						</div>
					</div>

					{/* Split View: Current vs Proposed */}
					{(riskSummary || improvementSummary) && (
						<div className="grid grid-cols-2 gap-4">
							<div className="rounded-md border border-red/20 bg-[rgba(239,68,68,0.03)] p-3">
								<div className="text-[11px] font-mono text-red uppercase tracking-wide mb-2 pb-1 border-b border-red/10">
									Current Risks
								</div>
								{riskSummary ? (
									<ul className="space-y-2">
										{splitSentences(riskSummary).map((sentence, i) => (
											<li key={i} className="text-[12px] text-text leading-snug flex gap-2">
												<span className="text-red shrink-0 mt-0.5">✕</span>
												<span className="text-text/90">{sentence}</span>
											</li>
										))}
									</ul>
								) : (
									<div className="text-[12px] text-text-dim">No current risks specified.</div>
								)}
							</div>

							<div className="rounded-md border border-teal/20 bg-[rgba(20,184,166,0.03)] p-3">
								<div className="text-[11px] font-mono text-teal uppercase tracking-wide mb-2 pb-1 border-b border-teal/10">
									Proposed Improvements
								</div>
								{improvementSummary ? (
									<ul className="space-y-2">
										{splitSentences(improvementSummary).map((sentence, i) => (
											<li key={i} className="text-[12px] text-text leading-snug flex gap-2">
												<span className="text-teal shrink-0 mt-0.5">✓</span>
												<span className="text-text/90">{sentence}</span>
											</li>
										))}
									</ul>
								) : (
									<div className="text-[12px] text-text-dim">No improvements identified.</div>
								)}
							</div>
						</div>
					)}

					{/* Stress Scenarios */}
					{stressResults.length > 0 && (
						<div className="rounded-md border border-border bg-bg-elevated p-3">
							<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-3 flex items-center justify-between pb-2 border-b border-border">
								<span>Stress Scenarios</span>
								<span className="text-text-dim">Drawdown & Recovery KPIs</span>
							</div>
							<div className="space-y-4 mt-2">
								{stressResults.map((res: any, i: number) => {
									const drawdown = Math.abs(res.simulated_drawdown_pct || 0);
									const recovery = res.recovery_days;
									const isSevere = drawdown > 15;
									
									return (
										<div key={i} className="flex flex-col gap-1.5">
											<div className="flex justify-between items-end">
												<span className="text-[13px] text-text/90 font-medium">{res.scenario || `Scenario ${i+1}`}</span>
												<div className="flex items-center gap-4">
													{recovery !== null && recovery !== undefined && (
														<span className="font-mono text-[11px] text-amber flex items-center gap-1 bg-amber/10 px-1.5 py-0.5 rounded">
															<span>↺</span> {recovery}d recovery
														</span>
													)}
													<span className={`font-mono text-sm font-semibold ${isSevere ? 'text-red' : 'text-amber'}`}>
														-{drawdown.toFixed(1)}%
													</span>
												</div>
											</div>
											<div className="h-2 w-full bg-bg-card rounded-full overflow-hidden flex">
												<div 
													className={`h-full rounded-r-sm transition-all duration-500 ${isSevere ? 'bg-red' : 'bg-amber'}`}
													style={{ width: `${Math.min(drawdown * 2, 100)}%` }}
												/>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}