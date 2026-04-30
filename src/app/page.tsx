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
import { RedesignProposalModal } from "@/components/agents/redesign-proposal-modal";
import { PortfolioAnalysisModal } from "@/components/agents/portfolio-analysis-modal";
import { useSectorExposure } from "@/hooks/use-sector-exposure";
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

type ProposedActionForExposure = {
	action?: "reduce" | "increase" | "replace" | "add" | "remove";
	ticker: string;
	target_pct: number;
};

type ExpectedImprovement = {
	sharpe_delta?: number | null;
	volatility_delta_pct?: number | null;
	max_drawdown_delta_pct?: number | null;
	narrative?: string;
};

type ProposalOptionForModal = {
	id: string;
	label: string;
	confidence?: string;
	proposal_summary?: string;
	proposed_actions?: ProposedActionForExposure[];
	expected_improvement?: ExpectedImprovement;
	tradeoff_notes?: string;
	riskMetrics?: {
		current_var_95?: number | null;
		proposed_var_95?: number | null;
		current_avg_drawdown?: number | null;
		proposed_avg_drawdown?: number | null;
		current_max_drawdown?: number | null;
		proposed_max_drawdown?: number | null;
	} | null;
	riskStructuredOutput?: Record<string, unknown> | null;
	fitScore?: number | null;
	fitReasons?: string[];
	fitTradeoff?: string | null;
};

function riskMetricsFromOutput(risk: Record<string, unknown> | null | undefined) {
	if (!risk) return null;
	return {
		current_var_95: typeof risk.current_var_95 === "number" ? risk.current_var_95 : null,
		proposed_var_95: typeof risk.var_95 === "number" ? risk.var_95 : null,
		current_avg_drawdown: typeof risk.current_avg_drawdown === "number" ? risk.current_avg_drawdown : null,
		proposed_avg_drawdown: typeof risk.proposed_avg_drawdown === "number" ? risk.proposed_avg_drawdown : null,
		current_max_drawdown: typeof risk.current_max_drawdown === "number" ? risk.current_max_drawdown : null,
		proposed_max_drawdown: typeof risk.proposed_max_drawdown === "number" ? risk.proposed_max_drawdown : null,
	};
}

export default function Home() {
	const [holdingsInputOpen, setHoldingsInputOpen] = useState(false);
	const [redesignModalOpen, setRedesignModalOpen] = useState(false);
	const [portfolioAnalysisOpen, setPortfolioAnalysisOpen] = useState(false);
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

	// Compute current allocations for redesign modal
	const currentAllocations = useMemo(() => {
		const totalValue = holdingsList.reduce((sum, h) => {
			const price = h.currentPrice ?? h.avgCost;
			return sum + price * h.quantity;
		}, 0);
		if (totalValue <= 0) return [];
		return holdingsList.map(h => ({
			ticker: h.ticker,
			weight: ((h.currentPrice ?? h.avgCost) * h.quantity) / totalValue * 100,
		}));
	}, [holdingsList]);

	const proposalData = useMemo(() => {
		const redesign = workflowOutput?.redesign as Record<string, unknown> | undefined;
		if (!redesign) return null;
		const risk = workflowOutput?.risk as Record<string, unknown> | undefined;
		const proposalRisks = Array.isArray(risk?.proposal_risks)
			? (risk.proposal_risks as Record<string, unknown>[])
			: [];
		const riskByProposalId = new Map(
			proposalRisks
				.filter((proposalRisk) => typeof proposalRisk.proposal_id === "string")
				.map((proposalRisk) => [proposalRisk.proposal_id as string, proposalRisk]),
		);
		const recommendedProposalId =
			(typeof risk?.recommended_proposal_id === "string" && risk.recommended_proposal_id) ||
			(typeof redesign.recommended_proposal_id === "string" && redesign.recommended_proposal_id) ||
			undefined;
		const rawProposals = Array.isArray(redesign.proposals)
			? (redesign.proposals as Record<string, unknown>[])
			: [
					{
						id: "recommended",
						label: "Recommended",
						confidence: redesign.confidence,
						proposal_summary: redesign.proposal_summary,
						proposed_actions: redesign.proposed_actions,
						expected_improvement: redesign.expected_improvement,
					},
				];
		const proposals: ProposalOptionForModal[] = rawProposals.map((proposal, index) => {
			const id = typeof proposal.id === "string" ? proposal.id : `proposal-${index + 1}`;
			const proposalRisk =
				riskByProposalId.get(id) ??
				(id === recommendedProposalId ? risk : null);
			return {
				id,
				label: typeof proposal.label === "string" ? proposal.label : index === 0 ? "Recommended" : `Proposal ${index + 1}`,
				confidence: typeof proposal.confidence === "string" ? proposal.confidence : undefined,
				proposal_summary: typeof proposal.proposal_summary === "string" ? proposal.proposal_summary : undefined,
				proposed_actions: Array.isArray(proposal.proposed_actions)
					? (proposal.proposed_actions as ProposedActionForExposure[])
					: undefined,
				expected_improvement: proposal.expected_improvement as ExpectedImprovement | undefined,
				tradeoff_notes: typeof proposal.tradeoff_notes === "string" ? proposal.tradeoff_notes : undefined,
				riskMetrics: riskMetricsFromOutput(proposalRisk),
				riskStructuredOutput: proposalRisk ?? null,
				fitScore: typeof proposalRisk?.proposal_fit_score === "number" ? proposalRisk.proposal_fit_score : null,
				fitReasons: Array.isArray(proposalRisk?.proposal_fit_reasons)
					? proposalRisk.proposal_fit_reasons.filter((reason): reason is string => typeof reason === "string")
					: [],
				fitTradeoff: typeof proposalRisk?.proposal_fit_tradeoff === "string" ? proposalRisk.proposal_fit_tradeoff : null,
			};
		});
		const recommendedProposal =
			proposals.find((proposal) => proposal.id === recommendedProposalId) ??
			proposals[0];
		return { proposals, recommendedProposalId, recommendedProposal };
	}, [workflowOutput]);
	const riskStructuredOutputForModal = useMemo(() => {
		if (!workflowOutput?.risk) return null;
		return workflowOutput.risk as Record<string, unknown>;
	}, [workflowOutput]);

	const riskMetrics = useMemo(() => {
		if (!workflowOutput?.risk) return null;
		return riskMetricsFromOutput(workflowOutput.risk as Record<string, unknown>);
	}, [workflowOutput]);

	const analysisContext = useMemo(() => {
		const monitor = workflowOutput?.monitor as Record<string, unknown> | undefined;
		const bottleneck = workflowOutput?.bottleneck as Record<string, unknown> | undefined;
		const primaryBottleneck = bottleneck?.primary_bottleneck as Record<string, unknown> | undefined;

		return {
			monitorSummary: typeof monitor?.summary === "string" ? monitor.summary : null,
			monitorConcerns: Array.isArray(monitor?.concerns)
				? monitor.concerns.filter((concern): concern is string => typeof concern === "string")
				: [],
			bottleneckTicker:
				typeof primaryBottleneck?.ticker === "string"
					? primaryBottleneck.ticker
					: null,
			bottleneckSeverity:
				typeof primaryBottleneck?.severity === "string"
					? primaryBottleneck.severity
					: null,
			bottleneckAnalysis:
				typeof bottleneck?.analysis === "string" ? bottleneck.analysis : null,
		};
	}, [workflowOutput]);

	// Compute current holdings with sector info from API
	const currentHoldingsForHeatmap = useMemo(() => {
		const totalValue = holdingsList.reduce((sum, h) => {
			const price = h.currentPrice ?? h.avgCost;
			return sum + price * h.quantity;
		}, 0);
		if (totalValue <= 0) return [];
		return holdingsList.map((h) => ({
			ticker: h.ticker,
			weight: ((h.currentPrice ?? h.avgCost) * h.quantity) / totalValue * 100,
			sector: h.sector ?? h.assetClass,
			assetClass: h.assetClass,
		}));
	}, [holdingsList]);

	// Build the final proposed allocation with the same semantics as riskStep:
	// current portfolio + actions, with omitted current holdings carried forward.
	const proposedActions = useMemo(() => {
		const actions = proposalData?.recommendedProposal?.proposed_actions;
		if (!actions?.length) return null;
		const TICKER_ASSET_CLASS: Record<string, string> = {
			BTC: "crypto",
			ETH: "crypto",
			QQQ: "equity",
			SPY: "equity",
			VGK: "equity",
			AGG: "fixed_income",
			TLT: "fixed_income",
			GLD: "commodities",
			VNQ: "reits",
		};

		const allocationMap = new Map<string, number>();
		const metadataMap = new Map<string, { sector: string | null; assetClass: string }>();
		for (const holding of currentHoldingsForHeatmap) {
			const ticker = holding.ticker.toUpperCase();
			allocationMap.set(ticker, holding.weight);
			metadataMap.set(ticker, {
				sector: holding.sector ?? null,
				assetClass: holding.assetClass,
			});
		}

		for (const action of actions) {
			const ticker = action.ticker.toUpperCase();
			const targetPct = action.action === "remove" ? 0 : Math.max(action.target_pct, 0);
			allocationMap.set(ticker, targetPct);
			if (!metadataMap.has(ticker)) {
				metadataMap.set(ticker, {
					sector: null,
					assetClass: TICKER_ASSET_CLASS[ticker] ?? "equity",
				});
			}
		}

		const totalWeight = Array.from(allocationMap.values()).reduce((sum, weight) => sum + weight, 0);
		const scale = totalWeight > 0 ? 100 / totalWeight : 1;

		return Array.from(allocationMap.entries()).map(([ticker, weight]) => {
			const metadata = metadataMap.get(ticker);
			return {
				ticker,
				target_pct: weight * scale,
				sector: metadata?.sector ?? null,
				assetClass: metadata?.assetClass ?? TICKER_ASSET_CLASS[ticker] ?? "equity",
			};
		});
	}, [currentHoldingsForHeatmap, proposalData]);

	const sectorExposure = useSectorExposure(currentHoldingsForHeatmap, proposedActions);

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
				riskMetrics={riskMetrics}
				currentAllocations={currentAllocations}
				proposedActions={proposalData?.recommendedProposal?.proposed_actions}
				riskStructuredOutput={riskStructuredOutputForModal}
				onRestoreRun={handleRestoreRun}
				onRedesignViewDetails={() => setRedesignModalOpen(true)}
				onPortfolioAnalysisViewDetails={() => setPortfolioAnalysisOpen(true)}
			/>
		</div>

		<RedesignProposalModal
			open={redesignModalOpen}
			onOpenChange={setRedesignModalOpen}
			proposals={proposalData?.proposals}
			recommendedProposalId={proposalData?.recommendedProposalId}
			confidence={proposalData?.recommendedProposal?.confidence}
			proposal_summary={proposalData?.recommendedProposal?.proposal_summary}
			proposed_actions={proposalData?.recommendedProposal?.proposed_actions}
			expected_improvement={proposalData?.recommendedProposal?.expected_improvement}
			currentAllocations={currentAllocations}
			currentSharpe={summaryMetrics.sharpeRatio}
			currentMaxDrawdown={summaryMetrics.maxDrawdownPct}
			currentVolatility={null}
			riskMetrics={riskMetrics}
			riskStructuredOutput={riskStructuredOutputForModal}
			sectorExposure={sectorExposure}
		/>

		<PortfolioAnalysisModal
			open={portfolioAnalysisOpen}
			onOpenChange={setPortfolioAnalysisOpen}
			analysisContext={analysisContext}
		/>
	</div>
);
}
