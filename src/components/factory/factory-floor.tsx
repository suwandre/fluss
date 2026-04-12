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

function useLayoutedGraph() {
  const layoutedNodes = useMemo(() => layoutGraph(initialNodes, initialEdges), [])
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  return { nodes, setNodes, onNodesChange, edges, setEdges, onEdgesChange }
}

export function FactoryFloor() {
  const { nodes, onNodesChange, edges, onEdgesChange } = useLayoutedGraph()

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
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
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border)" />
      <Controls />
    </ReactFlow>
  )
}
