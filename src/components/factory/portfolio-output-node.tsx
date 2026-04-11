"use client"

import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import type { HealthState } from "@/lib/types/visual"
import { StatusDot } from "@/components/ui/status-dot"
import { MetricDisplay } from "@/components/ui/metric-display"

type PortfolioOutputData = {
  netPnl: number
  netPnlPct: number
  sharpe: number
  maxDrawdownPct: number
  health: HealthState
}

export type PortfolioOutputNode = Node<PortfolioOutputData, "portfolioOutput">

const healthLabelMap: Record<HealthState, string> = {
  nominal: "text-green",
  warning: "text-amber",
  critical: "text-red",
}

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
  )
}

function pnlVariant(value: number): "default" | "positive" | "negative" {
  if (value === 0) return "default"
  return value > 0 ? "positive" : "negative"
}

function pnlDisplay(value: number): string {
  if (value === 0) return "$0"
  return `${value > 0 ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function drawdownDisplay(value: number): string {
  return `${value.toFixed(1)}%`
}

function PortfolioOutputNodeComponent({ data, isConnectable }: NodeProps<PortfolioOutputNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="!bg-border-bright !w-2 !h-2 !border-0" />

      <div
        role="article"
        aria-label="Portfolio Output"
        className={cn(
          "w-[220px] bg-bg-card rounded-lg",
          "border-2 border-accent transition-[background-color] duration-150",
          "hover:bg-bg-elevated",
          "shadow-[0_0_12px_rgba(6,182,212,0.15)]",
        )}
      >
        <div className="px-3.5 pt-2.5 pb-2 flex items-center gap-2">
          <HexagonIcon />
          <span className="font-mono text-[15px] font-semibold text-text leading-tight">
            Portfolio Output
          </span>
        </div>

        <div className="h-px bg-border mx-3.5" />

        <div className="px-3.5 py-2 flex flex-col gap-[5px]">
          <MetricDisplay label="Net P&L" value={pnlDisplay(data.netPnl)} variant={pnlVariant(data.netPnl)} />
          <MetricDisplay label="Sharpe" value={data.sharpe.toFixed(2)} />
          <MetricDisplay label="Max DD" value={drawdownDisplay(data.maxDrawdownPct)} variant="negative" />
        </div>

        <div className="h-px bg-border mx-3.5" />

        <div className="px-3.5 py-2 flex items-center gap-1.5">
          <StatusDot status={data.health} />
          <span className={cn("text-xs font-medium capitalize", healthLabelMap[data.health])}>
            {data.health}
          </span>
        </div>
      </div>
    </>
  )
}

export const PortfolioOutputNode = memo(PortfolioOutputNodeComponent)
