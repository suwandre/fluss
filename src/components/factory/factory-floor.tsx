"use client";

import { useMemo } from "react";
import {
	ReactFlow,
	Background,
	BackgroundVariant,
	Controls,
	useNodesState,
	useEdgesState,
	type Node,
	type Edge,
	type NodeTypes,
	type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { MachineNode } from "./machine-node";
import { ConveyorEdge } from "./conveyor-edge";
import { PortfolioOutputNode } from "./portfolio-output-node";
import { layoutGraph } from "./layout-engine";
import type { HealthState } from "@/lib/types/visual";
import type { CorrelationEntry } from "@/lib/orchestrator/compute-correlation";
import type {
	MachineNodeData,
	PortfolioOutputData,
} from "@/hooks/use-holdings";

const nodeTypes: NodeTypes = {
	machine: MachineNode,
	portfolioOutput: PortfolioOutputNode,
};

const edgeTypes: EdgeTypes = {
	conveyor: ConveyorEdge,
};

export interface FactoryFloorProps {
	machineNodes: MachineNodeData[];
	portfolioOutput: PortfolioOutputData;
	assetHealth?: Record<string, HealthState> | null;
	globalHealth?: HealthState | null;
	correlationMatrix?: CorrelationEntry[] | null;
}

/** Map from lowercase ticker → node id */
function tickerToNodeId(ticker: string): string {
	return ticker.toLowerCase();
}

/** Compute the average absolute correlation of each ticker with all other tickers. */
function avgAbsCorrelation(matrix: CorrelationEntry[]): Record<string, number> {
	const result: Record<string, number> = {};
	for (const entry of matrix) {
		const others = entry.correlations.filter((c) => c.with !== entry.ticker);
		if (others.length === 0) {
			result[entry.ticker.toLowerCase()] = 0;
			continue;
		}
		const avg =
			others.reduce((sum, c) => sum + Math.abs(c.correlation), 0) /
			others.length;
		result[entry.ticker.toLowerCase()] = Math.round(avg * 1000) / 1000;
	}
	return result;
}

function buildInitialNodes(
	machineNodes: MachineNodeData[],
	portfolioOutput: PortfolioOutputData,
): Node[] {
	const nodes: Node[] = machineNodes.map((data) => ({
		id: tickerToNodeId(data.ticker),
		type: "machine" as const,
		position: { x: 0, y: 0 },
		data: data as unknown as Record<string, unknown>,
	}));

	nodes.push({
		id: "output",
		type: "portfolioOutput" as const,
		position: { x: 0, y: 0 },
		data: portfolioOutput as unknown as Record<string, unknown>,
	});

	return nodes;
}

function buildInitialEdges(machineNodes: MachineNodeData[]): Edge[] {
	return machineNodes.map((data) => ({
		id: `${tickerToNodeId(data.ticker)}-output`,
		type: "conveyor" as const,
		source: tickerToNodeId(data.ticker),
		target: "output",
		data: { correlation: 0.5 },
	}));
}

export function FactoryFloor({
	machineNodes,
	portfolioOutput,
	assetHealth,
	globalHealth,
	correlationMatrix,
}: FactoryFloorProps) {
	const initialNodes = useMemo(
		() => buildInitialNodes(machineNodes, portfolioOutput),
		[machineNodes, portfolioOutput],
	);
	const initialEdges = useMemo(
		() => buildInitialEdges(machineNodes),
		[machineNodes],
	);

	const layoutedNodes = useMemo(
		() => layoutGraph(initialNodes, initialEdges),
		[initialNodes, initialEdges],
	);
	const [nodes, , onNodesChange] = useNodesState(layoutedNodes);
	const [edges, , onEdgesChange] = useEdgesState(initialEdges);

	// Derive nodes with updated health from agent output
	const nodesWithHealth = useMemo(() => {
		if (!assetHealth && !globalHealth) return nodes;

		return nodes.map((node) => {
			const data = node.data as Record<string, unknown>;

			// Machine nodes: per-ticker health from asset_health map
			if (node.type === "machine" && assetHealth) {
				const key = (data.ticker as string).toLowerCase();
				const health = assetHealth[key];
				if (health) return { ...node, data: { ...data, health } };
			}

			// Output node: global health
			if (node.type === "portfolioOutput" && globalHealth) {
				return { ...node, data: { ...data, health: globalHealth } };
			}

			return node;
		}) as typeof nodes;
	}, [nodes, assetHealth, globalHealth]);

	// Derive conveyor edges (machine → output) with correlation data
	const edgesWithCorrelation = useMemo(() => {
		if (!correlationMatrix || correlationMatrix.length === 0) return edges;
		const corrMap = avgAbsCorrelation(correlationMatrix);

		return edges.map((edge) => {
			const data = edge.data as Record<string, unknown> | undefined;
			const sourceTicker = edge.source;
			const correlation = corrMap[sourceTicker];
			if (correlation === undefined) return edge;
			return { ...edge, data: { ...data, correlation } };
		}) as typeof edges;
	}, [edges, correlationMatrix]);

	// Generate cross-correlation edges (machine ↔ machine) at 50% opacity
	const crossEdges = useMemo(() => {
		if (!correlationMatrix || correlationMatrix.length === 0) return [];
		const machineIds = new Set(
			nodesWithHealth.filter((n) => n.type === "machine").map((n) => n.id),
		);

		const result: typeof edges = [];
		const seen = new Set<string>();

		for (const entry of correlationMatrix) {
			const sourceTicker = entry.ticker.toLowerCase();
			if (!machineIds.has(sourceTicker)) continue;

			for (const pair of entry.correlations) {
				const targetTicker = pair.with.toLowerCase();
				if (!machineIds.has(targetTicker)) continue;
				if (sourceTicker === targetTicker) continue;
				if (pair.correlation === 0) continue;

				// Deduplicate: each pair only once (alphabetical key)
				const key = [sourceTicker, targetTicker].sort().join("---");
				if (seen.has(key)) continue;
				seen.add(key);

				result.push({
					id: `cross-${key}`,
					type: "conveyor" as const,
					source: sourceTicker,
					target: targetTicker,
					data: {
						correlation: Math.abs(pair.correlation),
						isCrossCorrelation: true,
					},
				} as (typeof edges)[number]);
			}
		}
		return result;
	}, [correlationMatrix, nodesWithHealth]);

	const allEdges = useMemo(
		() => [...edgesWithCorrelation, ...crossEdges],
		[edgesWithCorrelation, crossEdges],
	);

	return (
		<ReactFlow
			nodes={nodesWithHealth}
			edges={allEdges}
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
			<Background
				variant={BackgroundVariant.Dots}
				gap={24}
				size={1}
				color="#1e1e2e"
			/>
			<Controls />
		</ReactFlow>
	);
}
