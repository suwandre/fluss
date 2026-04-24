"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ProposedAction {
	ticker: string;
	target_pct: number;
	rationale?: string;
}

interface CurrentAllocation {
	ticker: string;
	weight: number;
}

interface RedesignProposalModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	confidence?: string;
	proposal_summary?: string;
	proposed_actions?: ProposedAction[];
	expected_improvement?: {
		sharpe_delta?: number | null;
		volatility_delta_pct?: number | null;
		max_drawdown_delta_pct?: number | null;
		narrative?: string;
	};
	currentAllocations: CurrentAllocation[];
	onViewRiskAnalysis?: () => void;
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			className={className}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M2.5 6L5 8.5L9.5 4"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function confidenceBadge(confidence?: string) {
	const lower = (confidence ?? "").toLowerCase();
	if (lower === "high") {
		return { label: "High", className: "bg-[rgba(34,197,94,0.12)] text-green" };
	}
	if (lower === "medium") {
		return { label: "Medium", className: "bg-[rgba(245,158,11,0.12)] text-amber" };
	}
	if (lower === "low") {
		return { label: "Low", className: "bg-[rgba(239,68,68,0.12)] text-red" };
	}
	return { label: "—", className: "bg-bg-elevated text-text-dim" };
}

export function RedesignProposalModal({
	open,
	onOpenChange,
	confidence,
	proposal_summary,
	proposed_actions,
	expected_improvement,
	currentAllocations,
	onViewRiskAnalysis,
}: RedesignProposalModalProps) {
	const badge = confidenceBadge(confidence);

	const currentWeightMap = new Map<string, number>();
	for (const c of currentAllocations) {
		currentWeightMap.set(c.ticker.toUpperCase(), c.weight);
	}

	const rows = (proposed_actions ?? []).map((action) => {
		const current = currentWeightMap.get(action.ticker.toUpperCase()) ?? 0;
		const delta = action.target_pct - current;
		return { ...action, current, delta };
	});

	const hasSharpe = typeof expected_improvement?.sharpe_delta === "number";
	const hasVol = typeof expected_improvement?.volatility_delta_pct === "number";
	const hasMaxDd = typeof expected_improvement?.max_drawdown_delta_pct === "number";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<DialogTitle>Portfolio Redesign Proposal</DialogTitle>
						<span
							className={`text-[10px] font-mono font-medium px-1.5 py-px rounded-full ${badge.className}`}
						>
							{badge.label} confidence
						</span>
					</div>
				</DialogHeader>

				<div className="space-y-5 overflow-y-auto max-h-[80vh] pr-2 custom-scrollbar">
					{/* Proposed Allocation Table */}
					<div className="rounded border border-border overflow-hidden">
						<div className="bg-bg-elevated text-[11px] font-mono text-text-dim uppercase tracking-wide px-3 py-2 grid grid-cols-[1fr_120px_120px_80px_1fr] gap-2">
							<span>Ticker</span>
							<span className="text-right">Current</span>
							<span className="text-right">Proposed</span>
							<span className="text-right">Delta</span>
							<span>Rationale</span>
						</div>
						{rows.length > 0 ? (
							rows.map((row, i) => (
								<div
									key={i}
									className="grid grid-cols-[1fr_120px_120px_80px_1fr] gap-2 px-3 py-2 text-[12px] font-mono border-b border-border last:border-0 items-center"
								>
									<span className="truncate font-medium text-text">
										{row.ticker}
									</span>
									<span className="text-right text-text-dim">
										{row.current.toFixed(1)}%
									</span>
									<span className="text-right text-teal font-medium">
										{row.target_pct.toFixed(1)}%
									</span>
									<span
										className={`text-right font-semibold ${
											row.delta > 0
												? "text-green"
												: row.delta < 0
													? "text-red"
													: "text-text-dim"
										}`}
									>
										{row.delta > 0 ? "+" : ""}
										{row.delta.toFixed(1)}%
									</span>
									<span className="truncate text-text-dim leading-snug">
										{row.rationale ?? "—"}
									</span>
								</div>
							))
						) : (
							<div className="px-3 py-4 text-[12px] font-mono text-text-dim italic">
								No proposed actions available.
							</div>
						)}
					</div>

					{/* Expected Improvement Cards */}
					<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
						<div className="rounded border border-border bg-bg-elevated p-3 flex flex-col items-center text-center">
							<span className="text-[10px] font-mono uppercase text-text-dim tracking-wide">
								Sharpe Ratio
							</span>
							{hasSharpe ? (
								<div className="mt-1 text-lg font-mono font-bold text-text">
									{expected_improvement!.sharpe_delta! > 0 ? "+" : ""}
									{expected_improvement!.sharpe_delta!.toFixed(2)}
									<span
										className={`ml-1 text-sm ${
											expected_improvement!.sharpe_delta! > 0
												? "text-green"
												: expected_improvement!.sharpe_delta! < 0
													? "text-red"
													: "text-text-dim"
										}`}
									>
										{expected_improvement!.sharpe_delta! > 0 ? "▲" : expected_improvement!.sharpe_delta! < 0 ? "▼" : "→"}
									</span>
								</div>
							) : (
								<div className="mt-1 text-lg font-mono font-bold text-text-dim">—</div>
							)}
							<span className="mt-0.5 text-[10px] text-text-muted">
								{hasSharpe && expected_improvement!.sharpe_delta! > 0
									? "Better"
									: hasSharpe && expected_improvement!.sharpe_delta! < 0
										? "Worse"
										: ""}
							</span>
						</div>

						<div className="rounded border border-border bg-bg-elevated p-3 flex flex-col items-center text-center">
							<span className="text-[10px] font-mono uppercase text-text-dim tracking-wide">
								Volatility
							</span>
							{hasVol ? (
								<div className="mt-1 text-lg font-mono font-bold text-text">
									{expected_improvement!.volatility_delta_pct! > 0 ? "+" : ""}
									{expected_improvement!.volatility_delta_pct!.toFixed(2)}%
									<span
										className={`ml-1 text-sm ${
											expected_improvement!.volatility_delta_pct! < 0
												? "text-green"
												: expected_improvement!.volatility_delta_pct! > 0
													? "text-red"
													: "text-text-dim"
										}`}
									>
										{expected_improvement!.volatility_delta_pct! < 0 ? "▼" : expected_improvement!.volatility_delta_pct! > 0 ? "▲" : "→"}
									</span>
								</div>
							) : (
								<div className="mt-1 text-lg font-mono font-bold text-text-dim">—</div>
							)}
							<span className="mt-0.5 text-[10px] text-text-muted">
								{hasVol && expected_improvement!.volatility_delta_pct! < 0
									? "Lower"
									: hasVol && expected_improvement!.volatility_delta_pct! > 0
										? "Higher"
										: ""}
							</span>
						</div>

						<div className="rounded border border-border bg-bg-elevated p-3 flex flex-col items-center text-center">
							<span className="text-[10px] font-mono uppercase text-text-dim tracking-wide">
								Max Drawdown
							</span>
							{hasMaxDd ? (
								<div className="mt-1 text-lg font-mono font-bold text-text">
									{expected_improvement!.max_drawdown_delta_pct! > 0 ? "+" : ""}
									{expected_improvement!.max_drawdown_delta_pct!.toFixed(2)}%
									<span
										className={`ml-1 text-sm ${
											expected_improvement!.max_drawdown_delta_pct! < 0
												? "text-green"
												: expected_improvement!.max_drawdown_delta_pct! > 0
													? "text-red"
													: "text-text-dim"
										}`}
									>
										{expected_improvement!.max_drawdown_delta_pct! < 0 ? "▼" : expected_improvement!.max_drawdown_delta_pct! > 0 ? "▲" : "→"}
									</span>
								</div>
							) : (
								<div className="mt-1 text-lg font-mono font-bold text-text-dim">—</div>
							)}
							<span className="mt-0.5 text-[10px] text-text-muted">
								{hasMaxDd && expected_improvement!.max_drawdown_delta_pct! < 0
									? "Lower"
									: hasMaxDd && expected_improvement!.max_drawdown_delta_pct! > 0
										? "Higher"
										: ""}
							</span>
						</div>
					</div>

					{/* Narrative summary */}
					{proposal_summary && (
						<p className="text-[13px] text-text-dim italic leading-relaxed">
							{proposal_summary}
						</p>
					)}

					{/* Footer */}
					{onViewRiskAnalysis && (
						<button
							type="button"
							onClick={onViewRiskAnalysis}
							className="mt-2 w-full text-[13px] font-mono rounded border border-border bg-bg-elevated text-text-dim hover:text-text hover:border-border-bright transition-colors px-3 py-2 cursor-pointer flex items-center justify-center gap-2"
						>
							View Risk Analysis
							<span>→</span>
						</button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
