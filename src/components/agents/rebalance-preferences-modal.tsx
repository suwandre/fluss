"use client";

import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface RebalancePreferences {
	sectorConstraint: "same_sector" | "diversify";
	riskAppetite: "aggressive" | "conservative";
	maxTurnoverPct: number;
	excludedTickers: string[];
}

interface RebalancePreferencesModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (prefs: RebalancePreferences) => void;
}

export function RebalancePreferencesModal({
	open,
	onOpenChange,
	onConfirm,
}: RebalancePreferencesModalProps) {
	const [sectorConstraint, setSectorConstraint] = useState<"same_sector" | "diversify">("same_sector");
	const [riskAppetite, setRiskAppetite] = useState<"aggressive" | "conservative">("aggressive");
	const [maxTurnoverPct, setMaxTurnoverPct] = useState(30);

	const handleConfirm = () => {
		onConfirm({
			sectorConstraint,
			riskAppetite,
			maxTurnoverPct,
			excludedTickers: [],
		});
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Rebalancing Preferences</DialogTitle>
				</DialogHeader>

				<div className="space-y-5 py-2">
					{/* Sector Constraint */}
					<div className="space-y-2">
						<label className="text-[12px] font-medium text-text/80 uppercase tracking-wide">
							Sector Constraint
						</label>
						<select
							value={sectorConstraint}
							onChange={(e) =>
								setSectorConstraint(e.target.value as "same_sector" | "diversify")
							}
							className="w-full rounded border border-border bg-bg-elevated px-3 py-2 text-[13px] text-text focus:outline-none focus:border-border-bright cursor-pointer"
						>
							<option value="same_sector">
								Stay within current sectors only
							</option>
							<option value="diversify">
								Allow cross-sector diversification
							</option>
						</select>
						<p className="text-[11px] text-text-muted leading-relaxed">
							{sectorConstraint === "same_sector"
								? "Agents will only suggest assets within your existing asset classes."
								: "Agents may suggest ETFs, bonds, FX, and equities to improve returns."}
						</p>
					</div>

					{/* Risk Appetite */}
					<div className="space-y-2">
						<label className="text-[12px] font-medium text-text/80 uppercase tracking-wide">
							Risk Appetite
						</label>
						<select
							value={riskAppetite}
							onChange={(e) =>
								setRiskAppetite(e.target.value as "aggressive" | "conservative")
							}
							className="w-full rounded border border-border bg-bg-elevated px-3 py-2 text-[13px] text-text focus:outline-none focus:border-border-bright cursor-pointer"
						>
							<option value="aggressive">Aggressive — higher potential reward</option>
							<option value="conservative">Conservative — stable returns</option>
						</select>
						<p className="text-[11px] text-text-muted leading-relaxed">
							{riskAppetite === "aggressive"
								? "Agents may suggest higher-beta alternatives and larger reallocations."
								: "Agents will prioritize capital preservation and lower volatility."}
						</p>
					</div>

					{/* Max Turnover */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<label className="text-[12px] font-medium text-text/80 uppercase tracking-wide">
								Max Turnover
							</label>
							<span className="text-[13px] font-mono text-text">
								{maxTurnoverPct}%
							</span>
						</div>
						<input
							type="range"
							min={5}
							max={100}
							step={5}
							value={maxTurnoverPct}
							onChange={(e) => setMaxTurnoverPct(Number(e.target.value))}
							className="w-full accent-teal cursor-pointer"
						/>
						<p className="text-[11px] text-text-muted leading-relaxed">
							Maximum percentage of total portfolio value the agent can reallocate in one rebalance.
						</p>
					</div>
				</div>

				<DialogFooter className="flex gap-2">
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						type="button"
						className="text-text-dim hover:text-text"
					>
						Cancel
					</Button>
					<Button onClick={handleConfirm} type="button" className="bg-teal text-bg-primary hover:bg-teal/90">
						Run Agents
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
