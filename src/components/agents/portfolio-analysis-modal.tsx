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
			<DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-6 sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Current Portfolio Analysis</DialogTitle>
				</DialogHeader>
				<div className="min-h-0 flex-1 overflow-y-auto pr-2 custom-scrollbar">
					<PortfolioAnalysisContent analysisContext={analysisContext} />
				</div>
			</DialogContent>
		</Dialog>
	);
}

type ConcernSeverity = "critical" | "warning" | "stable";

function parseConcern(concern: string): { severity: ConcernSeverity; text: string } {
	const match = concern.match(/^(CRITICAL|WARNING|STABLE|STATIC|RECURRING):\s*(.*)/i);
	if (match) {
		const raw = match[1].toUpperCase();
		const text = match[2];
		if (raw === "CRITICAL") return { severity: "critical", text };
		if (raw === "WARNING") return { severity: "warning", text };
		return { severity: "stable", text };
	}
	return { severity: "warning", text: concern };
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

	const parsed = concerns.map(parseConcern);
	const critical = parsed.filter((c) => c.severity === "critical");
	const warning = parsed.filter((c) => c.severity === "warning");
	const stable = parsed.filter((c) => c.severity === "stable");
	const [stableExpanded, setStableExpanded] = useState(stable.length <= 3);

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
				<div className="space-y-3">
					{critical.length > 0 && (
						<div>
							<div className="font-mono text-[10px] uppercase tracking-wide text-red">
								Critical ({critical.length})
							</div>
							<div className="mt-2 grid gap-2 sm:grid-cols-2">
								{critical.map((c, i) => (
									<div
										key={`critical-${i}`}
										className="rounded border border-border/70 border-l-2 border-l-red bg-bg-card px-3 py-2 text-[12px] text-text-muted"
									>
										{c.text}
									</div>
								))}
							</div>
						</div>
					)}

					{warning.length > 0 && (
						<div>
							<div className="font-mono text-[10px] uppercase tracking-wide text-amber">
								Warning ({warning.length})
							</div>
							<div className="mt-2 grid gap-2 sm:grid-cols-2">
								{warning.map((c, i) => (
									<div
										key={`warning-${i}`}
										className="rounded border border-border/70 border-l-2 border-l-amber bg-bg-card px-3 py-2 text-[12px] text-text-muted"
									>
										{c.text}
									</div>
								))}
							</div>
						</div>
					)}

					{stable.length > 0 && (
						<div>
							<div className="flex items-center justify-between gap-2">
								<div className="font-mono text-[10px] uppercase tracking-wide text-teal">
									Stable ({stable.length})
								</div>
								{stable.length > 3 && (
									<button
										type="button"
										onClick={() => setStableExpanded((v) => !v)}
										className="font-mono text-[10px] text-teal underline underline-offset-2 hover:text-teal/70"
									>
										{stableExpanded ? "Hide stable metrics" : "Show stable metrics"}
									</button>
								)}
							</div>
							{stableExpanded && (
								<div className="mt-2 grid gap-2 sm:grid-cols-2">
									{stable.map((c, i) => (
										<div
											key={`stable-${i}`}
											className="rounded border border-border/70 border-l-2 border-l-teal bg-bg-card px-3 py-2 text-[12px] text-text-muted"
										>
											{c.text}
										</div>
									))}
								</div>
							)}
						</div>
					)}
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
