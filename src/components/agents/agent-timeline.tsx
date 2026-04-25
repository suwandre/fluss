"use client";

import { AgentStep } from "@/components/agents/agent-step";
import type { AgentStatus } from "@/lib/types/visual";
import { cn } from "@/lib/utils";

export interface AgentStepData {
	name: string;
	status: AgentStatus;
	durationMs?: number;
	structuredOutput?: Record<string, unknown>;
	reasoning?: string;
	isStreaming?: boolean;
	errorMessage?: string;
	skipReason?: string;
}

interface AgentTimelineProps {
	steps: AgentStepData[];
	onRedesignViewDetails?: () => void;
}

export function AgentTimeline({ steps, onRedesignViewDetails }: AgentTimelineProps) {
	const runningIndex = steps.findIndex((s) => s.status === "running");

	return (
		<div className="flex flex-col">
			{steps.map((step, i) => {
				const isLast = i === steps.length - 1;
				const isDimmed = runningIndex !== -1 && i > runningIndex && step.status !== "skipped";

				return (
					<div
						key={step.name}
						className={cn(isDimmed && "opacity-45 transition-opacity")}
					>
						<AgentStep
							{...step}
							errorMessage={step.errorMessage}
							onViewDetails={i === 2 ? onRedesignViewDetails : undefined}
						/>
						{!isLast && (
							<div className="ml-[5px] h-4 border-l border-border-bright" />
						)}
					</div>
				);
			})}
		</div>
	);
}
