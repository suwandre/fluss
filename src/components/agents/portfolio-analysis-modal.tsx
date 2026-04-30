"use client";

import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export interface PortfolioAnalysisContext {
	monitorSummary?: string | null;
	monitorConcerns?: string[];
	bottleneckTicker?: string | null;
	bottleneckSeverity?: string | null;
	bottleneckAnalysis?: string | null;
}

interface PortfolioAnalysisModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	analysisContext?: PortfolioAnalysisContext | null;
}

export function PortfolioAnalysisModal({
	open,
	onOpenChange,
	analysisContext,
}: PortfolioAnalysisModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[88vh] w-[min(920px,calc(100vw-32px))] flex-col overflow-hidden border-border bg-bg-card p-0 text-text">
				<DialogHeader className="border-b border-border px-6 py-5">
					<DialogTitle className="font-mono text-lg">
						Current Portfolio Analysis
					</DialogTitle>
					<p className="mt-1 text-[12px] text-text-dim">
						Monitor summary, bottleneck diagnosis, and portfolio concerns for
						the current run.
					</p>
				</DialogHeader>
				<div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
					<PortfolioAnalysisContent analysisContext={analysisContext} />
				</div>
			</DialogContent>
		</Dialog>
	);
}

function PortfolioAnalysisContent({
	analysisContext,
}: {
	analysisContext?: PortfolioAnalysisContext | null;
}) {
	const [expandedSections, setExpandedSections] = useState<Set<string>>(
		new Set(),
	);
	const concerns = analysisContext?.monitorConcerns ?? [];
	const monitorSummary = analysisContext?.monitorSummary ?? "";
	const bottleneckAnalysis = analysisContext?.bottleneckAnalysis ?? "";
	const hasAnalysis =
		Boolean(monitorSummary) ||
		Boolean(bottleneckAnalysis) ||
		concerns.length > 0;

	function toggleSection(section: string) {
		setExpandedSections((prev) => {
			const next = new Set(prev);
			if (next.has(section)) next.delete(section);
			else next.add(section);
			return next;
		});
	}

	function preview(text: string) {
		if (!text) return "No detail available.";
		const firstSentence = text.split(/(?<=[.!?])\s+/)[0]?.trim();
		if (!firstSentence) return text;
		return firstSentence.length > 180
			? `${firstSentence.slice(0, 177)}...`
			: firstSentence;
	}

	if (!hasAnalysis) {
		return (
			<div className="rounded border border-border bg-bg-elevated p-4 text-[12px] font-mono text-text-muted">
				No monitor or bottleneck analysis available for this run.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<AnalysisStatCard
					label="Health"
					value={concerns.length > 0 ? "Watch" : "Stable"}
					tone={concerns.length > 0 ? "amber" : "green"}
				/>
				<AnalysisStatCard
					label="Bottleneck"
					value={analysisContext?.bottleneckTicker ?? "N/A"}
					tone="teal"
				/>
				<AnalysisStatCard
					label="Severity"
					value={analysisContext?.bottleneckSeverity ?? "N/A"}
					tone={
						analysisContext?.bottleneckSeverity === "high" ? "red" : "amber"
					}
				/>
				<AnalysisStatCard
					label="Concerns"
					value={String(concerns.length)}
					tone={concerns.length > 0 ? "amber" : "green"}
				/>
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="rounded border border-border bg-bg-elevated p-4">
					<div className="font-mono text-[10px] uppercase tracking-wide text-text-dim">
						Why it matters
					</div>
					<div className="mt-2 text-[13px] leading-relaxed text-text-dim">
						{preview(monitorSummary)}
					</div>
				</div>
				<div className="rounded border border-border bg-bg-elevated p-4">
					<div className="font-mono text-[10px] uppercase tracking-wide text-text-dim">
						Primary driver
					</div>
					<div className="mt-2 text-[13px] leading-relaxed text-text-dim">
						{preview(bottleneckAnalysis)}
					</div>
				</div>
			</div>

			{concerns.length > 0 && (
				<div className="rounded border border-border bg-bg-elevated p-4">
					<div className="font-mono text-[10px] uppercase tracking-wide text-text-dim">
						Concerns
					</div>
					<div className="mt-3 grid gap-2 sm:grid-cols-2">
						{concerns.map((concern) => (
							<div
								key={concern}
								className="rounded border border-border/70 bg-bg-card px-3 py-2 text-[12px] text-text-dim"
							>
								{concern}
							</div>
						))}
					</div>
				</div>
			)}

			<div className="grid gap-3 sm:grid-cols-2">
				<AnalysisDetailCard
					title="Full monitor summary"
					content={monitorSummary || "No monitor summary available."}
					expanded={expandedSections.has("monitor")}
					onToggle={() => toggleSection("monitor")}
				/>
				<AnalysisDetailCard
					title="Full bottleneck analysis"
					content={bottleneckAnalysis || "No bottleneck analysis available."}
					expanded={expandedSections.has("bottleneck")}
					onToggle={() => toggleSection("bottleneck")}
				/>
			</div>
		</div>
	);
}

function AnalysisStatCard({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone: "green" | "amber" | "red" | "teal";
}) {
	return (
		<div className="rounded border border-border bg-bg-elevated p-3">
			<div className="font-mono text-[10px] uppercase tracking-wide text-text-dim">
				{label}
			</div>
			<div
				className={`mt-1 truncate font-mono text-[14px] font-semibold ${
					tone === "green"
						? "text-green"
						: tone === "red"
							? "text-red"
							: tone === "teal"
								? "text-teal"
								: "text-amber"
				}`}
			>
				{value}
			</div>
		</div>
	);
}

function AnalysisDetailCard({
	title,
	content,
	expanded,
	onToggle,
}: {
	title: string;
	content: string;
	expanded: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="rounded border border-border bg-bg-elevated p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="font-mono text-[10px] uppercase tracking-wide text-text-dim">
					{title}
				</div>
				<button
					type="button"
					onClick={onToggle}
					className="font-mono text-[11px] text-teal underline underline-offset-2 hover:text-teal/70"
				>
					{expanded ? "Hide" : "Show"}
				</button>
			</div>
			{expanded && (
				<div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap pr-2 text-[12px] leading-relaxed text-text-dim custom-scrollbar">
					{content}
				</div>
			)}
		</div>
	);
}
