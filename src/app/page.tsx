"use client";

import { useState, useMemo, useCallback } from "react";
import { FactoryFloor } from "@/components/factory/factory-floor";
import { PortfolioSummaryBar } from "@/components/layout/portfolio-summary-bar";
import { AgentReasoningPanel } from "@/components/agents/agent-reasoning-panel";
import {
	HoldingsInput,
	type NewHolding,
} from "@/components/holdings/holdings-input";
import { useAgentRun } from "@/hooks/use-agent-run";
import { useHoldings, type PortfolioOutputData } from "@/hooks/use-holdings";
import type { HealthState } from "@/lib/types/visual";
import type { CorrelationEntry } from "@/lib/orchestrator/compute-correlation";
import type { MonitorOutput } from "@/lib/agents/monitor";

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

export default function Home() {
	const [holdingsInputOpen, setHoldingsInputOpen] = useState(false);
	const {
		steps,
		runId,
		isRunning,
		error,
		monitorOutput,
		workflowOutput,
		lastRunAt,
		startRun,
		setMonitorOutput,
		setWorkflowOutput,
		setRunId,
		setLastRunAt,
		rebuildStepsFromOutput,
	} = useAgentRun();
	const {
		holdings: holdingsList,
		machineNodes,
		portfolioOutput,
		refetch: refetchHoldings,
	} = useHoldings();

	const handleAddHolding = useCallback(
		async (holding: NewHolding) => {
			try {
				const res = await fetch("/api/portfolio/holdings", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						ticker: holding.ticker,
						quantity: String(holding.quantity),
						avgCost: String(holding.avgCost),
						assetClass: holding.assetClass,
					}),
				});

				if (!res.ok) {
					const body = await res
						.json()
						.catch(() => ({ error: "Failed to add holding" }));
					console.error("Failed to add holding:", body);
					return;
				}

				// Refresh factory floor with updated holdings
				await refetchHoldings();
			} catch (err) {
				console.error("Failed to add holding:", err);
			}
		},
		[refetchHoldings],
	);

	// Restore a past run from history
	const handleRestoreRun = useCallback(
		(run: HistoryRun) => {
			setRunId(run.runId);
			setLastRunAt(new Date(run.createdAt));
			if (run.output?.monitor) {
				setMonitorOutput(run.output.monitor as unknown as MonitorOutput);
			}
			if (run.output) {
				setWorkflowOutput(run.output);
				rebuildStepsFromOutput(run.output);
			}
		},
		[setMonitorOutput, setWorkflowOutput, setRunId, setLastRunAt, rebuildStepsFromOutput],
	);

	// Compute baseline metrics from live holdings data (available immediately)
	const holdingsMetrics = useMemo(() => {
		const totalValue = holdingsList.reduce((sum, h) => {
			const price = h.currentPrice ?? h.avgCost;
			return sum + price * h.quantity;
		}, 0);
		const totalCost = holdingsList.reduce(
			(sum, h) => sum + h.avgCost * h.quantity,
			0,
		);
		const unrealisedPnl = totalValue - totalCost;
		const unrealisedPnlPct =
			totalCost > 0 ? (unrealisedPnl / totalCost) * 100 : 0;
		return { totalValue, unrealisedPnl, unrealisedPnlPct };
	}, [holdingsList]);

	// Derive summary bar values — prefer Monitor output (has Sharpe, max drawdown),
	// fall back to live holdings data for total value and P&L
	const summaryMetrics = useMemo(() => {
		if (monitorOutput?.portfolio_metrics) {
			const {
				total_value,
				unrealised_pnl_pct,
				sharpe_ratio,
				max_drawdown_pct,
			} = monitorOutput.portfolio_metrics;
			// Derive absolute P&L from total_value and unrealised_pnl_pct
			// PnL% is relative to cost basis: PnL = value * pct / (100 + pct)
			const unrealisedPnl =
				unrealised_pnl_pct === 0
					? 0
					: (total_value * (unrealised_pnl_pct / 100)) /
						(1 + unrealised_pnl_pct / 100);

			return {
				totalValue: total_value,
				unrealisedPnl: Math.round(unrealisedPnl),
				unrealisedPnlPct: unrealised_pnl_pct,
				sharpeRatio: sharpe_ratio,
				maxDrawdownPct: max_drawdown_pct,
				health: monitorOutput.health_status,
			};
		}

		// No Monitor run yet — use live holdings data for value/P&L,
		// Sharpe and max drawdown unavailable until first run
		return {
			totalValue: holdingsMetrics.totalValue,
			unrealisedPnl: Math.round(holdingsMetrics.unrealisedPnl),
			unrealisedPnlPct: holdingsMetrics.unrealisedPnlPct,
			sharpeRatio: null as number | null,
			maxDrawdownPct: null as number | null,
			health: "nominal" as HealthState,
		};
	}, [monitorOutput, holdingsMetrics]);

	// Build a lowercase-ticker-keyed health map from Monitor's asset_health
	const assetHealth = useMemo<Record<string, HealthState> | null>(() => {
		if (!monitorOutput?.asset_health?.length) return null;
		const map: Record<string, HealthState> = {};
		for (const entry of monitorOutput.asset_health) {
			map[entry.ticker.toLowerCase()] = entry.health;
		}
		return map;
	}, [monitorOutput]);

	// Extract correlation matrix from workflow output
	const correlationMatrix = useMemo<CorrelationEntry[] | null>(() => {
		if (!workflowOutput?.correlationMatrix) return null;
		return workflowOutput.correlationMatrix as CorrelationEntry[];
	}, [workflowOutput]);

	// Enrich portfolioOutput with monitorOutput metrics so PortfolioOutputNode
	// shows live Sharpe, max drawdown, and correct P&L (not hardcoded zeros)
	const enrichedPortfolioOutput = useMemo<PortfolioOutputData>(() => ({
		...portfolioOutput,
		netPnl: summaryMetrics.unrealisedPnl,
		netPnlPct: summaryMetrics.unrealisedPnlPct,
		sharpe: summaryMetrics.sharpeRatio ?? null,
		maxDrawdownPct: summaryMetrics.maxDrawdownPct ?? null,
		health: summaryMetrics.health,
	}), [portfolioOutput, summaryMetrics]);

	// Extract stress results from Risk Agent output in workflow output
	const stressResults = useMemo<StressResult[] | null>(() => {
		if (!workflowOutput?.risk) return null;
		const risk = workflowOutput.risk as Record<string, unknown>;
		if (!Array.isArray(risk.stress_results)) return null;
		return risk.stress_results as StressResult[];
	}, [workflowOutput]);

	return (
		<div className="flex flex-col h-screen overflow-hidden bg-[--bg-primary]">
			<HoldingsInput
				open={holdingsInputOpen}
				onOpenChange={setHoldingsInputOpen}
				onSubmit={handleAddHolding}
			/>
			<PortfolioSummaryBar
				totalValue={summaryMetrics.totalValue}
				unrealisedPnl={summaryMetrics.unrealisedPnl}
				unrealisedPnlPct={summaryMetrics.unrealisedPnlPct}
				sharpeRatio={summaryMetrics.sharpeRatio}
				maxDrawdownPct={summaryMetrics.maxDrawdownPct}
				lastRunAt={lastRunAt}
				health={summaryMetrics.health}
				onAddHolding={() => setHoldingsInputOpen(true)}
			/>
			<div className="flex flex-1 overflow-hidden">
				<div className="flex-[7] overflow-hidden">
					<FactoryFloor
						machineNodes={machineNodes}
						portfolioOutput={enrichedPortfolioOutput}
						assetHealth={assetHealth}
						globalHealth={monitorOutput?.health_status ?? null}
						correlationMatrix={correlationMatrix}
					/>
				</div>
				<AgentReasoningPanel
					steps={steps}
					runId={runId}
					isRunning={isRunning}
					error={error}
					onRun={startRun}
					stressResults={stressResults}
					onRestoreRun={handleRestoreRun}
				/>
			</div>
		</div>
	);
}
