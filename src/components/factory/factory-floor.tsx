"use client"

import { useMemo } from "react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { MachineNode } from "./machine-node"
import { ConveyorEdge } from "./conveyor-edge"
import { PortfolioOutputNode } from "./portfolio-output-node"
import { layoutGraph } from "./layout-engine"
import type { HealthState } from "@/lib/types/visual"
import type { CorrelationEntry } from "@/lib/orchestrator/compute-correlation"

const nodeTypes: NodeTypes = {
  machine: MachineNode,
  portfolioOutput: PortfolioOutputNode,
}

const edgeTypes: EdgeTypes = {
  conveyor: ConveyorEdge,
}

const initialNodes = [
  {
    id: "aapl",
    type: "machine" as const,
    position: { x: 0, y: 0 },
    data: {
      ticker: "AAPL",
      name: "Apple Inc.",
      assetClass: "equity" as const,
      weight: 22.4,
      pnlPct: 14.2,
      volatility: 0.35,
      volatilityLabel: "Med" as const,
      sharpe: 1.34,
      health: "nominal" as const,
    },
  },
  {
    id: "msft",
    type: "machine" as const,
    position: { x: 0, y: 0 },
    data: {
      ticker: "MSFT",
      name: "Microsoft Corp.",
      assetClass: "equity" as const,
      weight: 18.1,
      pnlPct: 9.7,
      volatility: 0.28,
      volatilityLabel: "Low" as const,
      sharpe: 1.62,
      health: "nominal" as const,
    },
  },
  {
    id: "btc",
    type: "machine" as const,
    position: { x: 0, y: 0 },
    data: {
      ticker: "BTC",
      name: "Bitcoin",
      assetClass: "crypto" as const,
      weight: 15.0,
      pnlPct: -3.8,
      volatility: 0.85,
      volatilityLabel: "V.High" as const,
      sharpe: 0.42,
      health: "warning" as const,
    },
  },
  {
    id: "output",
    type: "portfolioOutput" as const,
    position: { x: 0, y: 0 },
    data: {
      netPnl: 12840,
      netPnlPct: 8.2,
      sharpe: 1.21,
      maxDrawdownPct: 12.4,
      health: "nominal" as const,
    },
  },
]

const initialEdges = [
  { id: "aapl-output", type: "conveyor" as const, source: "aapl", target: "output", data: { correlation: 0.45 } },
  { id: "msft-output", type: "conveyor" as const, source: "msft", target: "output", data: { correlation: 0.52 } },
  { id: "btc-output", type: "conveyor" as const, source: "btc", target: "output", data: { correlation: 0.78 } },
]

/** Map from lowercase ticker → node id */
const TICKER_TO_NODE_ID: Record<string, string> = {
  aapl: "aapl",
  msft: "msft",
  btc: "btc",
}

export interface FactoryFloorProps {
  assetHealth?: Record<string, HealthState> | null
  globalHealth?: HealthState | null
  correlationMatrix?: CorrelationEntry[] | null
}

/**
 * Compute the average absolute correlation of each ticker with all other tickers.
 * Used to color/width the conveyor edges (machine → output).
 * Self-correlation (1.0) is excluded.
 */
function avgAbsCorrelation(matrix: CorrelationEntry[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const entry of matrix) {
    const others = entry.correlations.filter((c) => c.with !== entry.ticker)
    if (others.length === 0) {
      result[entry.ticker.toLowerCase()] = 0
      continue
    }
    const avg = others.reduce((sum, c) => sum + Math.abs(c.correlation), 0) / others.length
    result[entry.ticker.toLowerCase()] = Math.round(avg * 1000) / 1000
  }
  return result
}

function useLayoutedGraph() {
  const layoutedNodes = useMemo(() => layoutGraph(initialNodes, initialEdges), [])
  const [nodes, , onNodesChange] = useNodesState(layoutedNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)
  return { nodes, onNodesChange, edges, onEdgesChange }
}

export function FactoryFloor({ assetHealth, globalHealth, correlationMatrix }: FactoryFloorProps) {
  const { nodes, onNodesChange, edges, onEdgesChange } = useLayoutedGraph()

  // Derive nodes with updated health from agent output
  const nodesWithHealth = useMemo(() => {
    if (!assetHealth && !globalHealth) return nodes

    return nodes.map((node) => {
      const data = node.data as Record<string, unknown>

      // Machine nodes: per-ticker health from asset_health map
      if (node.type === "machine" && assetHealth) {
        const key = (data.ticker as string).toLowerCase()
        const health = assetHealth[key]
        if (health) return { ...node, data: { ...data, health } }
      }

      // Output node: global health
      if (node.type === "portfolioOutput" && globalHealth) {
        return { ...node, data: { ...data, health: globalHealth } }
      }

      return node
    }) as typeof nodes
  }, [nodes, assetHealth, globalHealth])

  // Derive edges with correlation data from computed matrix
  const edgesWithCorrelation = useMemo(() => {
    if (!correlationMatrix || correlationMatrix.length === 0) return edges
    const corrMap = avgAbsCorrelation(correlationMatrix)

    return edges.map((edge) => {
      const data = edge.data as Record<string, unknown> | undefined
      const sourceTicker = edge.source // node IDs are lowercase tickers
      const correlation = corrMap[sourceTicker]
      if (correlation === undefined) return edge
      return { ...edge, data: { ...data, correlation } }
    }) as typeof edges
  }, [edges, correlationMatrix])

  return (
    <ReactFlow
      nodes={nodesWithHealth}
      edges={edgesWithCorrelation}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      nodesDraggable
      minZoom={0.5}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.03)" />
      <Controls />
    </ReactFlow>
  )
}
