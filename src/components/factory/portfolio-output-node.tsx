"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { HealthState } from "@/lib/types/visual";
import { StatusDot } from "@/components/ui/status-dot";
import { MetricDisplay } from "@/components/ui/metric-display";
import { pnlDollars, drawdownPct } from "@/lib/format";
import { healthLabelMap, pnlVariant, HANDLE_CLASSNAME } from "./shared";

type PortfolioOutputData = {
	netPnl: number;
	netPnlPct: number;
	sharpe: number;
	maxDrawdownPct: number;
	health: HealthState;
};

export type PortfolioOutputNode = Node<PortfolioOutputData, "portfolioOutput">;

function HexagonIcon({ className }: { className?: string }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M8 1L14.9282 5V11L8 15L1.07179 11V5L8 1Z"
				fill="var(--accent)"
				fillOpacity="0.15"
				stroke="var(--accent)"
				strokeWidth="1.2"
			/>
		</svg>
	);
}

function PortfolioOutputNodeComponent({
	data,
	isConnectable,
	selected,
}: NodeProps<PortfolioOutputNode>) {
	return (
		<>
			<Handle
				type="target"
				position={Position.Left}
				isConnectable={isConnectable}
				className={HANDLE_CLASSNAME}
			/>

			<div
				role="group"
				aria-label="Portfolio Output"
				className={cn(
					"w-[200px] bg-bg-card rounded-lg",
					"border-2 border-accent transition-[background-color] duration-150",
					"hover:bg-bg-elevated",
					selected && "ring-2 ring-accent ring-offset-2 ring-offset-bg-card",
					"shadow-[0_0_12px_var(--accent-glow)]",
				)}
			>
				<div className="px-3.5 pt-2.5 pb-2 flex items-center gap-2">
					<HexagonIcon />
					<span className="font-mono text-sm font-semibold text-accent leading-tight">
						Portfolio Output
					</span>
				</div>

				<div className="h-px bg-border mx-3.5" />

				<div className="px-3.5 py-2 flex flex-col gap-[5px]">
					<MetricDisplay
						label="Net P&L"
						value={pnlDollars(data.netPnl)}
						variant={pnlVariant(data.netPnl)}
					/>
					<MetricDisplay label="Sharpe" value={data.sharpe.toFixed(2)} />
					<MetricDisplay
						label="Max DD"
						value={drawdownPct(data.maxDrawdownPct)}
						variant="negative"
					/>
				</div>

				<div className="h-px bg-border mx-3.5" />

				<div className="px-3.5 py-2 flex items-center gap-1.5">
					<StatusDot status={data.health} />
					<span
						className={cn(
							"text-xs font-medium capitalize",
							healthLabelMap[data.health],
						)}
					>
						{data.health}
					</span>
				</div>
			</div>
		</>
	);
}

export const PortfolioOutputNode = memo(PortfolioOutputNodeComponent);
