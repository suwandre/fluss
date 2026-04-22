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
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Risk Analysis</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					{/* Verdict Banner */}
					{verdictConfig && (
						<div
							className={`rounded-md border-l-4 px-3 py-2 ${verdictConfig.bg} ${verdictConfig.border}`}
						>
							<div className="flex items-center gap-2">
								<span className="text-lg">{verdictConfig.icon}</span>
								<span className={`font-semibold text-sm ${verdictConfig.text}`}>
									{verdictConfig.label}
								</span>
							</div>
						</div>
					)}

					{/* VaR 95% */}
					{var95 !== null && (
						<div className="rounded-md border border-border bg-bg-elevated px-3 py-2">
							<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide">
								VaR 95%
							</div>
							<div className="text-xl font-mono font-semibold text-text">
								{var95}%
							</div>
							<div className="text-[11px] text-text-dim">
								Maximum expected daily loss at 95% confidence
							</div>
						</div>
					)}

					{/* Caveats */}
					{caveats.length > 0 && (
						<div>
							<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-1.5">
								Caveats
							</div>
							<div className="flex flex-wrap gap-1">
								{caveats.map((caveat: string, i: number) => (
									<span
										key={i}
										className="bg-bg-elevated border border-border rounded px-2 py-0.5 text-[12px] text-text"
									>
										{caveat}
									</span>
								))}
							</div>
						</div>
					)}

					{/* Risk Summary */}
					{riskSummary && (
						<div>
							<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-1.5">
								Risk Summary
							</div>
							<ul className="space-y-1">
								{splitSentences(riskSummary).map((sentence, i) => (
									<li
										key={i}
										className="text-[13px] text-text leading-snug flex gap-1.5"
									>
										<span className="text-amber shrink-0">•</span>
										<span>{sentence}</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Improvement Summary */}
					{(improvementSummary || null) && (
						<div>
							<div className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-1.5">
								Improvements
							</div>
							{improvementSummary ? (
								<ul className="space-y-1">
									{splitSentences(improvementSummary).map((sentence, i) => (
										<li
											key={i}
											className="text-[13px] text-text leading-snug flex gap-1.5"
										>
											<span className="text-green shrink-0">✓</span>
											<span>{sentence}</span>
										</li>
									))}
								</ul>
							) : (
								<div className="text-[12px] text-text-dim">
									No improvements identified
								</div>
							)}
						</div>
					)}

					{/* Stress Results count */}
					{stressResults.length > 0 && (
						<div className="text-[11px] font-mono text-text-dim">
							{stressResults.length} historical stress scenarios tested
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}