"use client";

import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { StatusDot } from "@/components/ui/status-dot";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import type { AgentStatus, HealthState } from "@/lib/types/visual";

interface AgentStepProps {
	name: string;
	status: AgentStatus;
	durationMs?: number;
	structuredOutput?: Record<string, unknown>;
	reasoning?: string;
	isStreaming?: boolean;
	errorMessage?: string;
	skipReason?: string;
}

const STATUS_LABEL_MAP: Record<AgentStatus, string> = {
	done: "Done",
	running: "Running",
	queued: "Queued",
	skipped: "Skipped",
	error: "Error",
};

const BADGE_STYLES: Record<AgentStatus, string> = {
	done: "bg-[rgba(34,197,94,0.12)] text-green",
	running: "bg-[rgba(245,158,11,0.12)] text-amber",
	queued: "bg-[rgba(82,82,91,0.2)] text-text-dim",
	skipped: "bg-[rgba(82,82,91,0.15)] text-text-dim",
	error: "bg-[rgba(239,68,68,0.12)] text-red",
};

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function renderValue(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

function getDotStatus(
	status: AgentStatus,
	structuredOutput?: Record<string, unknown>,
): HealthState {
	if (status === "error") return "critical";
	if (status !== "done") return "warning";
	if (!structuredOutput) return "nominal";

	const criticalValues = new Set(["critical", "high", "reject"]);
	const warningValues = new Set(["warning", "medium", "approve_with_caveats"]);
	const fields = ["health_status", "severity", "confidence", "verdict"];

	for (const key of fields) {
		const val = structuredOutput[key];
		if (typeof val !== "string") continue;
		const lower = val.toLowerCase();
		if (criticalValues.has(lower)) return "critical";
		if (warningValues.has(lower)) return "warning";
	}

	return "nominal";
}

const TRUNCATE_THRESHOLD = 80;

function formatRiskField(key: string, value: unknown): string {
	if (key === "verdict" && typeof value === "string") {
		const map: Record<string, string> = {
			reject: "\u274c Rejected",
			approve_with_caveats: "\u26a0\ufe0f Approved with caveats",
			approve: "\u2705 Approved",
		};
		return map[value.toLowerCase()] ?? value;
	}
	if (key === "var_95" && typeof value === "number") {
		return `VaR 95%: ${value}% (max daily loss at 95% confidence)`;
	}
	if (key === "stress_results" && Array.isArray(value)) {
		return `${value.length} historical stress scenarios tested`;
	}
	return renderValue(value);
}

function ExpandableValue({ value }: { value: string }) {
	const [expanded, setExpanded] = useState(false);

	if (value.length <= TRUNCATE_THRESHOLD) {
		return <span className="text-text break-words min-w-0 select-text">{value}</span>;
	}

	return (
		<div className="flex flex-col min-w-0">
			<span
				className={cn(
					"text-text break-words min-w-0 select-text",
					!expanded && "line-clamp-2",
					expanded && "whitespace-pre-wrap",
				)}
			>
				{value}
			</span>
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="mt-0.5 text-[11px] text-text-muted hover:text-text transition-colors w-fit"
			>
				{expanded ? "Show less" : "Show more"}
			</button>
		</div>
	);
}

export function AgentStep({
	name,
	status,
	durationMs,
	structuredOutput,
	reasoning,
	isStreaming = false,
	errorMessage,
	skipReason,
}: AgentStepProps) {
	const [reasoningOpen, setReasoningOpen] = useState(false);
	const reducedMotion = useReducedMotion();

	const dotVariant = status === "queued" || status === "skipped" ? "hollow" : "filled";
	const dotStatus = getDotStatus(status, structuredOutput);
	const dotAnimate = status === "running";

	const showStructuredOutput = status === "done" || status === "running";
	const hasReasoning = !!reasoning || isStreaming;

	return (
		<div data-slot="agent-step" className="flex gap-3">
			{/* Status dot — 12px to match draft */}
			<div className="flex flex-col items-center pt-1">
				<StatusDot
					status={dotStatus}
					size="md"
					variant={dotVariant}
					animate={dotAnimate}
					className="size-3"
				/>
			</div>

			{/* Content */}
			<div className="min-w-0 flex-1">
				{/* Header row: name · status badge · duration */}
				<div className="flex items-center gap-2">
					<span className="font-semibold text-[13px] text-text leading-tight truncate">
						{name}
					</span>

					<span
						className={`text-[11px] font-mono font-medium px-2 py-px rounded-full ${BADGE_STYLES[status]}`}
					>
						{status === "running" && isStreaming
							? "Streaming…"
							: STATUS_LABEL_MAP[status]}
					</span>

					{durationMs != null && (
						<span className="ml-auto text-[11px] font-mono text-text-dim">
							{formatDuration(durationMs)}
						</span>
					)}
				</div>

				{/* Error message */}
				{status === "error" && errorMessage && (
					<div className="mt-1 text-[11px] font-mono text-red leading-snug break-words">
						{errorMessage}
					</div>
				)}

				{/* Skip reason */}
				{status === "skipped" && skipReason && (
					<div className="mt-1 text-[11px] text-text-dim leading-snug">
						{skipReason}
					</div>
				)}

				{/* Structured output */}
				{showStructuredOutput && structuredOutput && (
					<div className="mt-1.5 space-y-0.5">
						{Object.entries(structuredOutput).map(([key, value]) => {
							const rendered = formatRiskField(key, value);
							return (
								<div
									key={key}
									className="flex gap-1.5 text-[12px] font-mono leading-snug"
								>
								<span className="text-text-dim shrink-0">{key}:</span>
								<ExpandableValue value={rendered} />
							</div>
							);
						})}
					</div>
				)}

				{/* Collapsible reasoning */}
				{hasReasoning && (
					<Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}>
						<CollapsibleTrigger className="mt-1.5 text-[11px] text-text-muted hover:text-text transition-colors cursor-pointer">
							{reasoningOpen ? "▾ Hide reasoning" : "▸ Show reasoning"}
						</CollapsibleTrigger>

						<CollapsibleContent>
							<div
								className={`mt-1.5 rounded bg-bg-elevated border-l-2 pl-3 pr-2 py-2 text-[13px] text-text leading-relaxed font-sans ${isStreaming ? "border-amber" : "border-border-bright"}`}
							>
								{reasoning}
								{isStreaming && (
									<span
										className={`inline-block w-[2px] h-[14px] bg-amber ml-0.5 align-middle ${
											reducedMotion ? "" : "animate-cursor-blink"
										}`}
									/>
								)}
							</div>
						</CollapsibleContent>
					</Collapsible>
				)}

				{/* Streaming cursor when no reasoning yet */}
				{isStreaming && !reasoning && (
					<div className="mt-1.5 flex items-center gap-1.5">
						<span
							className={`inline-block w-[2px] h-[14px] bg-amber ${
								reducedMotion ? "" : "animate-cursor-blink"
							}`}
						/>
						<span className="text-[11px] text-text-dim font-mono">
							streaming…
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
