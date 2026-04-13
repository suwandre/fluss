"use client"

import type { AgentStatus } from "@/lib/types/visual"
import { cn } from "@/lib/utils"
import { AgentStep } from "@/components/agents/agent-step"

export interface AgentStepData {
  name: string
  status: AgentStatus
  durationMs?: number
  structuredOutput?: Record<string, unknown>
  reasoning?: string
  isStreaming?: boolean
}

interface AgentTimelineProps {
  steps: AgentStepData[]
}

/**
 * Vertical timeline with 4 agent step slots, connector lines,
 * and dimming for steps after the currently running agent.
 */
export function AgentTimeline({ steps }: AgentTimelineProps) {
  const runningIndex = steps.findIndex((s) => s.status === "running")

  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const isDimmed = runningIndex !== -1 && i > runningIndex

        return (
          <div
            key={step.name}
            className={cn(isDimmed && "opacity-45 transition-opacity")}
          >
            <AgentStep {...step} />
            {!isLast && (
              <div className="ml-[3px] h-4 border-l border-border-bright" />
            )}
          </div>
        )
      })}
    </div>
  )
}
