"use client"

import { memo, useEffect, useState } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import type { AssetClass, VolatilityLabel } from "@/lib/types/visual"
import type { HealthState } from "@/lib/types/visual"
import { StatusDot } from "@/components/ui/status-dot"
import { MetricDisplay } from "@/components/ui/metric-display"
import { VolatilityBar } from "@/components/ui/volatility-bar"
import { pnlPercent } from "@/lib/format"
import { healthBorderMap, healthLabelMap, pnlVariant, HANDLE_CLASSNAME } from "./shared"

const healthPulseMap: Record<HealthState, string> = {
  nominal: "animate-pulse-green",
  warning: "animate-pulse-amber",
  critical: "animate-pulse-red",
}

type MachineNodeData = {
  ticker: string
  name: string
  assetClass: AssetClass
  weight: number
  pnlPct: number
  volatility: number
  volatilityLabel: VolatilityLabel
  sharpe: number | null
  health: HealthState
}

export type MachineNode = Node<MachineNodeData, "machine">

const assetClassLabels: Record<AssetClass, string> = {
  equity: "Equity",
  etf: "ETF",
  crypto: "Crypto",
  bond: "Bond",
  fx: "FX",
}

function volatilityToFilled(vol: number): number {
  return Math.min(4, Math.max(0, Math.ceil(vol * 4)))
}

function MachineNodeComponent({ data, isConnectable, selected }: NodeProps<MachineNode>) {
  const [pulse, setPulse] = useState(false)
  const [prevHealth, setPrevHealth] = useState(data.health)

  useEffect(() => {
    if (prevHealth !== data.health) {
      setPulse(true)
      setPrevHealth(data.health)
      const id = setTimeout(() => setPulse(false), 800)
      return () => clearTimeout(id)
    }
  }, [data.health, prevHealth])
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} className={HANDLE_CLASSNAME} />

      <div
        role="group"
        aria-label={`${data.ticker} - ${data.name}`}
        className={cn(
          "w-[220px] bg-bg-card rounded-lg",
          "border-2 transition-[background-color] duration-150",
          "hover:bg-bg-elevated",
          selected && "ring-2 ring-accent ring-offset-2 ring-offset-bg-card",
          healthBorderMap[data.health],
          pulse && healthPulseMap[data.health],
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
          <MetricDisplay label="P&L" value={pnlPercent(data.pnlPct)} variant={pnlVariant(data.pnlPct)} />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-muted">Volatility</span>
            <VolatilityBar segments={4} filled={volatilityToFilled(data.volatility)} label={data.volatilityLabel} />
          </div>
          <MetricDisplay label="Sharpe" value={data.sharpe !== null ? data.sharpe.toFixed(2) : "—"} />
        </div>

        <div className="h-px bg-border mx-3.5" />

        <div className="px-3.5 py-2 flex items-center gap-1.5">
          <StatusDot status={data.health} />
          <span className={cn("text-xs font-medium capitalize", healthLabelMap[data.health])}>
            {data.health}
          </span>
        </div>
      </div>

      <Handle type="source" position={Position.Right} isConnectable={isConnectable} className={HANDLE_CLASSNAME} />
    </>
  )
}

export const MachineNode = memo(MachineNodeComponent)
