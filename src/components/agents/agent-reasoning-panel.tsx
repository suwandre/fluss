"use client";

import { useState } from "react";
import {
	AgentTimeline,
	type AgentStepData,
} from "@/components/agents/agent-timeline";
import { RunHistoryPanel } from "@/components/agents/run-history-panel";
import { StressTestChart } from "@/components/charts/stress-test-chart";
import { ScrollArea } from "@/components/ui/scroll-area";

interface StressResult {
	scenario: string;
	simulated_drawdown_pct: number;
	recovery_days: number | null;
}

interface HistoryRun {
	runId: string;
	createdAt: string;
	durationMs: number | null;
	healthStatus: string | null;
	summary: string | null;
	output: Record<string, unknown> | null;
}

interface AgentReasoningPanelProps {
	steps: AgentStepData[];
	runId?: string | null;
	isRunning?: boolean;
	error?: string | null;
	onRun?: () => void;
	stressResults?: StressResult[] | null;
	onRestoreRun?: (run: HistoryRun) => void;
}

type PanelTab = "current" | "history";

/**
 * Right sidebar panel: header with "Agent Reasoning" title + run ID badge,
 * tab toggle between current run and history, scrollable body.
 * Collapse toggle is a visual placeholder only — collapsed ~48px icon-strip
 * state is deferred per V §6.2.
 */
export function AgentReasoningPanel({
	steps,
	runId,
	isRunning,
	error,
	onRun,
	stressResults,
	onRestoreRun,
}: AgentReasoningPanelProps) {
	const [tab, setTab] = useState<PanelTab>("current");
	const riskDone = steps[3]?.status === "done";
	const showChart = riskDone && stressResults && stressResults.length > 0;

	const handleSelectRun = (run: HistoryRun) => {
		onRestoreRun?.(run);
		setTab("current");
	};

	return (
		<aside
			className="flex flex-col min-w-[340px] max-w-[420px] flex-[3] border-l border-border bg-bg-card overflow-hidden"
			aria-label="Agent reasoning panel"
		>
			{/* Header */}
			<div className="flex items-center gap-2 px-4 h-10 border-b border-border shrink-0">
				<h2 className="text-[13px] font-semibold text-text leading-tight uppercase tracking-[0.04em]">
					Agent Reasoning
				</h2>
				{runId && tab === "current" && (
					<span className="text-[11px] font-mono text-text-dim bg-bg-elevated px-1.5 py-0.5 rounded select-none">
						{runId.slice(0, 8)}
					</span>
				)}

				{/* Collapse toggle placeholder — visual button only, not wired */}
				<button
					className="p-1 text-text-dim hover:text-text transition-colors cursor-pointer"
					aria-label="Toggle panel (not implemented)"
					title="Collapse panel"
					type="button"
				>
					<ChevronRightIcon />
				</button>

				{/* Tab toggle */}
				<div className="ml-auto flex items-center gap-0.5 rounded bg-bg-elevated p-0.5">
					<TabButton
						active={tab === "current"}
						onClick={() => setTab("current")}
						label="Current"
					/>
					<TabButton
						active={tab === "history"}
						onClick={() => setTab("history")}
						label="History"
					/>
				</div>

				{/* Run trigger */}
				{onRun && tab === "current" && (
					<button
						onClick={onRun}
						disabled={isRunning}
						className="px-2.5 py-1 text-[11px] font-mono rounded border border-border bg-bg-elevated text-text-dim hover:text-text hover:border-border-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
						type="button"
					>
						{isRunning ? "Running…" : "▶ Run"}
					</button>
				)}
			</div>

			{/* Error banner */}
			{error && tab === "current" && (
				<div className="px-4 py-2 text-[11px] font-mono text-red bg-bg-elevated border-b border-border">
					{error}
				</div>
			)}

			{/* Body */}
			{tab === "current" ? (
				<ScrollArea className="flex-1">
					<div className="p-4">
						<AgentTimeline steps={steps} />

						{/* Stress test chart — shown after Risk Agent completes */}
						{showChart && (
							<div className="mt-4 pt-4 border-t border-border">
								<StressTestChart data={stressResults} />
							</div>
						)}
					</div>
				</ScrollArea>
			) : (
				<div className="flex-1 overflow-hidden">
					<RunHistoryPanel
						onSelectRun={handleSelectRun}
						selectedRunId={runId}
					/>
				</div>
			)}
		</aside>
	);
}

function TabButton({
	active,
	onClick,
	label,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors cursor-pointer ${
				active
					? "bg-bg-card text-text shadow-sm"
					: "text-text-dim hover:text-text"
			}`}
		>
			{label}
		</button>
	);
}

function ChevronRightIcon() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 14 14"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M9 3L5 7L9 11"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
