"use client"

import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import type { HealthState, AssetClass, VolatilityLabel } from "@/lib/types/visual"
import { StatusDot } from "@/components/ui/status-dot"
import { MetricDisplay } from "@/components/ui/metric-display"
import { VolatilityBar } from "@/components/ui/volatility-bar"

type MachineNodeData = {
  ticker: string
  name: string
  assetClass: AssetClass
  weight: number
  pnlPct: number
  volatility: number
  volatilityLabel: VolatilityLabel
  sharpe: number
  health: HealthState
}

export type MachineNode = Node<MachineNodeData, "machine">

const healthBorderMap: Record<HealthState, string> = {
  nominal: "border-green",
  warning: "border-amber",
  critical: "border-red",
}

const healthLabelMap: Record<HealthState, string> = {
  nominal: "text-green",
  warning: "text-amber",
  critical: "text-red",
}

const assetClassLabels: Record<AssetClass, string> = {
  equity: "Equity",
  etf: "ETF",
  crypto: "Crypto",
  bond: "Bond",
  fx: "FX",
}

function volatilityToFilled(vol: number): number {
  return Math.min(4, Math.max(1, Math.ceil(vol * 4)))
}

function pnlVariant(pnl: number): "default" | "positive" | "negative" {
  if (pnl === 0) return "default"
  return pnl > 0 ? "positive" : "negative"
}

function pnlDisplay(pnl: number): string {
  if (pnl === 0) return "0.0%"
  return `${pnl > 0 ? "+" : ""}${pnl.toFixed(1)}%`
}

function MachineNodeComponent({ data }: NodeProps<MachineNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-border-bright !w-2 !h-2 !border-0" />

      <div
        role="article"
        aria-label={`${data.ticker} - ${data.name}`}
        className={cn(
          "w-[220px] bg-bg-card rounded-lg cursor-pointer",
          "border-2 transition-colors duration-150",
          "hover:bg-bg-elevated",
          healthBorderMap[data.health],
        )}
      >
        <div className="px-3.5 pt-2.5 pb-2">
          <div className="font-mono text-[15px] font-semibold text-text leading-tight">
            {data.ticker}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            {data.name} · {assetClassLabels[data.assetClass]}
          </div>
        </div>

        <div className="h-px bg-border mx-3.5" />

        <div className="px-3.5 py-2 flex flex-col gap-[5px]">
          <MetricDisplay label="Weight" value={`${data.weight.toFixed(1)}%`} />
          <MetricDisplay label="P&L" value={pnlDisplay(data.pnlPct)} variant={pnlVariant(data.pnlPct)} />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Volatility</span>
            <VolatilityBar segments={4} filled={volatilityToFilled(data.volatility)} label={data.volatilityLabel} />
          </div>
          <MetricDisplay label="Sharpe" value={data.sharpe.toFixed(2)} />
        </div>

        <div className="h-px bg-border mx-3.5" />

        <div className="px-3.5 py-2 flex items-center gap-1.5">
          <StatusDot status={data.health} />
          <span className={cn("text-xs font-medium capitalize", healthLabelMap[data.health])}>
            {data.health}
          </span>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-border-bright !w-2 !h-2 !border-0" />
    </>
  )
}

export const MachineNode = memo(MachineNodeComponent)