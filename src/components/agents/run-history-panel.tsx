"use client";

import { useEffect, useState } from "react";
import { StatusDot } from "@/components/ui/status-dot";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { HealthState } from "@/lib/types/visual";
import { timeAgo } from "@/lib/format";

interface HistoryRun {
	runId: string;
	createdAt: string;
	durationMs: number | null;
	healthStatus: string | null;
	summary: string | null;
	output: Record<string, unknown> | null;
}

interface RunHistoryPanelProps {
	onSelectRun?: (run: HistoryRun) => void;
	selectedRunId?: string | null;
}

function healthToState(status: string | null): HealthState {
	if (status === "warning") return "warning";
	if (status === "critical") return "critical";
	return "nominal";
}

function formatDuration(ms: number | null): string {
	if (ms == null) return "—";
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

function verdictLabel(status: string | null): string {
	if (!status) return "—";
	return status.charAt(0).toUpperCase() + status.slice(1);
}

export function RunHistoryPanel({
	onSelectRun,
	selectedRunId,
}: RunHistoryPanelProps) {
	const [runs, setRuns] = useState<HistoryRun[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/api/agents/history?limit=20");
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data: HistoryRun[] = await res.json();
				if (cancelled) return;
				setRuns(data);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : "Failed to load history");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (loading) {
		return (
			<div className="flex items-center justify-center py-8 text-xs text-text-dim font-mono">
				Loading history…
			</div>
		);
	}

	if (error) {
		return (
			<div className="px-4 py-3 text-xs font-mono text-red bg-bg-elevated rounded">
				{error}
			</div>
		);
	}

	if (runs.length === 0) {
		return (
			<div className="flex items-center justify-center py-8 text-xs text-text-dim font-mono">
				No runs yet
			</div>
		);
	}

	return (
		<ScrollArea className="h-full">
			<div className="flex flex-col gap-1 p-2">
				{runs.map((run) => {
					const health = healthToState(run.healthStatus);
					const isSelected = run.runId === selectedRunId;

					return (
						<button
							key={run.runId}
							type="button"
							onClick={() => onSelectRun?.(run)}
							className={`flex items-start gap-2.5 rounded px-3 py-2.5 text-left transition-colors cursor-pointer w-full ${
								isSelected
									? "bg-bg-elevated border border-border-bright"
									: "hover:bg-bg-elevated border border-transparent"
							}`}
						>
							{/* Health dot */}
							<div className="pt-1">
								<StatusDot status={health} size="sm" variant="filled" />
							</div>

							{/* Content */}
							<div className="min-w-0 flex-1">
								{/* Row 1: verdict + duration */}
								<div className="flex items-center gap-2">
									<span
										className={`text-xs font-medium ${
											health === "critical"
												? "text-red"
												: health === "warning"
													? "text-amber"
													: "text-green"
										}`}
									>
										{verdictLabel(run.healthStatus)}
									</span>
									<span className="text-[11px] font-mono text-text-dim">
										{formatDuration(run.durationMs)}
									</span>
								</div>

								{/* Row 2: timestamp + relative time */}
								<div className="flex items-center gap-2 mt-0.5">
									<span className="text-xs font-mono text-text-dim">
										{formatTimestamp(run.createdAt)}
									</span>
									<span className="text-xs font-mono text-text-muted">
										{timeAgo(new Date(run.createdAt))}
									</span>
								</div>

								{/* Row 3: summary (truncated) */}
								{run.summary && (
									<p className="mt-1 text-[11px] text-text-muted leading-snug line-clamp-2">
										{run.summary}
									</p>
								)}
							</div>

							{/* Run ID badge */}
							<span className="shrink-0 text-[10px] font-mono text-text-dim bg-bg-elevated px-1.5 py-0.5 rounded select-none mt-0.5">
								{run.runId.slice(0, 8)}
							</span>
						</button>
					);
				})}
			</div>
		</ScrollArea>
	);
}
