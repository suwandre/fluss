"use client"

import { memo } from "react"
import {
  BaseEdge,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react"
import { cn } from "@/lib/utils"

type ConveyorEdgeData = {
  correlation: number
  direction?: "left-to-right"
}

export type ConveyorEdge = Edge<ConveyorEdgeData, "conveyor">

type CorrelationTier = "low" | "medium" | "high"

function correlationTier(value: number): CorrelationTier {
  if (value > 0.7) return "high"
  if (value >= 0.3) return "medium"
  return "low"
}

const tierColorMap: Record<CorrelationTier, string> = {
  low: "#14b8a6",
  medium: "#f59e0b",
  high: "#ef4444",
}

const tierWidthMap: Record<CorrelationTier, number> = {
  low: 1.5,
  medium: 2.5,
  high: 3.5,
}

function ConveyorEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<ConveyorEdge>) {
  const correlation = data?.correlation ?? 0.5
  const tier = correlationTier(correlation)
  const strokeColor = tierColorMap[tier]
  const strokeWidth = tierWidthMap[tier]

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray: "6 3",
      }}
      className={cn(
        "transition-colors duration-150",
        correlation > 0.7 && "opacity-50",
      )}
    />
  )
}

export const ConveyorEdge = memo(ConveyorEdgeComponent)
