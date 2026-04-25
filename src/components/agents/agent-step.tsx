"use client";

import { useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
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

/** Run-state color for the dot (NOT the verdict). */
function getDotStatus(status: AgentStatus): HealthState {
	if (status === "error") return "critical";
	if (status === "running") return "warning";
	return "nominal";
}

/** Extract a compact verdict badge from agent output. */
function getVerdictBadge(
	name: string,
	structuredOutput?: Record<string, unknown>,
): { label: string; tier: HealthState } | null {
	if (!structuredOutput) return null;
	const lowerName = name.toLowerCase();
	if (lowerName.includes("monitor")) {
		const st = structuredOutput.health_status;
		if (typeof st !== "string") return null;
		const map: Record<string, { label: string; tier: HealthState }> = {
			nominal: { label: "Nominal", tier: "nominal" },
			warning: { label: "Warning", tier: "warning" },
			critical: { label: "Critical", tier: "critical" },
		};
		return map[st.toLowerCase()] ?? null;
	}
	if (lowerName.includes("bottleneck")) {
		const sev =
			(structuredOutput.primary_bottleneck as Record<string, unknown> | undefined)
				?.severity ?? structuredOutput.severity;
		if (typeof sev !== "string") return null;
		const map: Record<string, { label: string; tier: HealthState }> = {
			low: { label: "Low", tier: "nominal" },
			medium: { label: "Medium", tier: "warning" },
			high: { label: "High", tier: "critical" },
		};
		return map[sev.toLowerCase()] ?? null;
	}
	if (lowerName.includes("redesign")) {
		const conf = structuredOutput.confidence;
		if (typeof conf !== "string") return null;
		const map: Record<string, { label: string; tier: HealthState }> = {
			low: { label: "Low confidence", tier: "warning" },
			medium: { label: "Medium confidence", tier: "warning" },
			high: { label: "High confidence", tier: "nominal" },
		};
		return map[conf.toLowerCase()] ?? null;
	}
	if (lowerName.includes("risk")) {
		const v = structuredOutput.verdict;
		if (typeof v !== "string") return null;
		const map: Record<string, { label: string; tier: HealthState }> = {
			approved: { label: "Approved", tier: "nominal" },
			approved_with_caveats: { label: "Caveats", tier: "warning" },
			rejected: { label: "Rejected", tier: "critical" },
		};
		return map[v.toLowerCase()] ?? null;
	}
	return null;
}

const VERDICT_BADGE_STYLES: Record<HealthState, string> = {
	nominal: "bg-[rgba(34,197,94,0.12)] text-green",
	warning: "bg-[rgba(245,158,11,0.12)] text-amber",
	critical: "bg-[rgba(239,68,68,0.12)] text-red",
};

const TRUNCATE_THRESHOLD = 80;

function formatRiskField(key: string, value: unknown): string {
	if (key === "var_95" && typeof value === "number") {
		return `VaR 95%: ${value}% (max daily loss at 95% confidence)`;
	}
	if (key === "stress_results" && Array.isArray(value)) {
		return `${value.length} historical stress scenarios tested`;
	}
	if (key === "caveats" && Array.isArray(value)) {
		return value.join(" • ");
	}
	return renderValue(value);
}

const FIELD_TOOLTIPS: Record<string, string> = {
	verdict:
		"The Risk Agent's final judgment on whether the proposed rebalancing is safe enough to execute.",
	var_95:
		"Value at Risk: the worst single-day loss expected on 95% of trading days, based on historical data.",
	stress_results:
		"Historical 'what-if' simulations. Shows how much your portfolio would lose if past market crashes happened again today.",
	caveats: "Specific warnings or conditions attached to the verdict.",
	risk_summary: "A plain-English summary of the risk assessment.",
	health_status:
		"Overall portfolio health as judged by the Monitor Agent: critical, warning, or nominal.",
	concerns: "Number of risk concerns flagged by the Monitor Agent.",
	escalate:
		"Whether the Monitor Agent triggered the full rebalancing pipeline due to detected issues.",
	confidence: "How certain the agent is in its assessment.",
	bottleneck:
		"The single biggest risk concentration or weak point identified in your portfolio.",
	severity:
		"How severe the identified bottleneck is: low, medium, high, or critical.",
	actions: "Number of rebalancing moves proposed by the Redesign Agent.",
	improvement:
		"What the Redesign Agent expects to improve after rebalancing.",
	scenarios: "How many historical crash scenarios were simulated.",
};

function InfoIcon({ className }: { className?: string }) {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			className={className}
			xmlns="http://www.w3.org/2000/svg"
		>
			<circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1" />
			<path
				d="M6 5V8M6 3.5V3.51"
				stroke="currentColor"
				strokeWidth="1"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
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
	const dotStatus = getDotStatus(status);
	const dotAnimate = status === "running";
	const verdict = getVerdictBadge(name, structuredOutput);

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

                                  {verdict && (
                                        <span
                                                className={`text-[10px] font-mono font-medium px-1.5 py-px rounded-full ${VERDICT_BADGE_STYLES[verdict.tier]}`}
                                        >
                                                {verdict.label}
                                        </span>
                                  )}

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
							if (key === "verdict" && typeof value === "string") {
								const v = value.toLowerCase();
								if (v === "approved" || v === "approve") {
									return (
										<div
											key={key}
											className="text-[12px] font-mono text-green leading-snug"
										>
											✅ Changes approved. Ready to apply.
										</div>
									);
								}
								if (v === "rejected" || v === "reject") {
									return (
										<div
											key={key}
											className="text-[12px] font-mono text-red leading-snug"
										>
											❌ Changes rejected. Current portfolio retained.
										</div>
									);
								}
								if (v === "approved_with_caveats" || v === "approve_with_caveats") {
									return (
										<div
											key={key}
											className="text-[12px] font-mono text-amber leading-snug"
										>
											⚠️ Approved with conditions. Review caveats.
										</div>
									);
								}
								return null;
							}
							const rendered = formatRiskField(key, value);
							const tip = FIELD_TOOLTIPS[key];
							return (
								<div
									key={key}
									className="flex gap-1 items-start text-[12px] font-mono leading-snug"
								>
									{tip ? (
										<Tooltip>
											<TooltipTrigger>
												<button
													type="button"
													className="shrink-0 mt-0.5 text-text-dim hover:text-text transition-colors cursor-help"
												>
													<InfoIcon className="size-3" />
												</button>
											</TooltipTrigger>
											<TooltipContent side="right">
												{tip}
											</TooltipContent>
										</Tooltip>
									) : (
										<span className="w-3 shrink-0" />
									)}
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
