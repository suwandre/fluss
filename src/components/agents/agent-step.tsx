"use client";

import { useState } from "react";
import type { AgentStatus } from "@/lib/types/visual";
import { StatusDot } from "@/components/ui/status-dot";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface AgentStepProps {
	name: string;
	status: AgentStatus;
	durationMs?: number;
	structuredOutput?: Record<string, unknown>;
	reasoning?: string;
	isStreaming?: boolean;
}

const STATUS_LABEL_MAP: Record<AgentStatus, string> = {
	done: "Done",
	running: "Running",
	queued: "Queued",
	error: "Error",
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

export function AgentStep({
	name,
	status,
	durationMs,
	structuredOutput,
	reasoning,
	isStreaming = false,
}: AgentStepProps) {
	const [reasoningOpen, setReasoningOpen] = useState(false);
	const reducedMotion = useReducedMotion();

	const dotVariant = status === "queued" ? "hollow" : "filled";
	const dotStatus =
		status === "error" ? "critical" : status === "done" ? "nominal" : "warning";
	const dotAnimate = status === "running";

	const showStructuredOutput = status === "done" || status === "running";
	const hasReasoning = !!reasoning || isStreaming;

	return (
		<div data-slot="agent-step" className="flex gap-3">
			{/* Status dot */}
			<div className="flex flex-col items-center pt-1.5">
				<StatusDot
					status={dotStatus}
					size="sm"
					variant={dotVariant}
					animate={dotAnimate}
				/>
			</div>

			{/* Content */}
			<div className="min-w-0 flex-1">
				{/* Header row: name · status · duration */}
				<div className="flex items-center gap-2">
					<span className="font-medium text-[13px] text-text leading-tight truncate">
						{name}
					</span>

					<span
						className={`text-[11px] font-mono ${
							status === "running"
								? "text-amber"
								: status === "error"
									? "text-red"
									: "text-text-dim"
						}`}
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

				{/* Structured output */}
				{showStructuredOutput && structuredOutput && (
					<div className="mt-1.5 space-y-0.5">
						{Object.entries(structuredOutput).map(([key, value]) => (
							<div
								key={key}
								className="flex gap-1.5 text-[12px] font-mono leading-snug"
							>
								<span className="text-text-dim shrink-0">{key}:</span>
								<span className="text-text truncate">{renderValue(value)}</span>
							</div>
						))}
					</div>
				)}

				{/* Collapsible reasoning */}
				{hasReasoning && (
					<Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}>
						<CollapsibleTrigger className="mt-1.5 text-[11px] text-text-muted hover:text-text transition-colors cursor-pointer">
							{reasoningOpen ? "▾ Hide reasoning" : "▸ Show reasoning"}
						</CollapsibleTrigger>

						<CollapsibleContent>
							<div className="mt-1.5 rounded bg-bg-elevated border-l-2 border-border-bright pl-3 pr-2 py-2 text-[13px] text-text leading-relaxed font-sans">
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
