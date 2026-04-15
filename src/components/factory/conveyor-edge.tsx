"use client";

import { memo } from "react";
import { getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type ConveyorEdgeData = {
	correlation: number;
	isCrossCorrelation?: boolean;
};

export type ConveyorEdge = Edge<ConveyorEdgeData, "conveyor">;

type CorrelationTier = "low" | "medium" | "high";

function correlationTier(value: number): CorrelationTier {
	const abs = Math.abs(value);
	if (abs > 0.7) return "high";
	if (abs >= 0.3) return "medium";
	return "low";
}

const tierColorVar: Record<CorrelationTier, string> = {
	low: "var(--teal)",
	medium: "var(--amber)",
	high: "var(--red)",
};

const tierWidthMap: Record<CorrelationTier, number> = {
	low: 1.5,
	medium: 2.5,
	high: 3.5,
};

function ConveyorEdgeComponent({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
	selected,
}: EdgeProps<ConveyorEdge>) {
	const reducedMotion = useReducedMotion();
	const correlation = data?.correlation ?? 0.5;
	const isCross = data?.isCrossCorrelation ?? false;
	const tier = correlationTier(correlation);
	const strokeColor = tierColorVar[tier];
	const strokeWidth = tierWidthMap[tier];
	const markerId = `conveyor-arrow-${tier}`;

	const [edgePath] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});

	return (
		<>
			<defs>
				<marker
					id={markerId}
					viewBox="0 0 10 10"
					refX="10"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} />
				</marker>
			</defs>
			<path
				d={edgePath}
				fill="none"
				stroke={strokeColor}
				strokeWidth={strokeWidth}
				strokeDasharray="8 4"
				markerEnd={`url(#${markerId})`}
				className={cn(
					!reducedMotion && "animate-edge-flow",
					"transition-colors duration-150",
					isCross && !selected && "opacity-50",
					selected && "opacity-100",
				)}
			/>
		</>
	);
}

export const ConveyorEdge = memo(ConveyorEdgeComponent);
