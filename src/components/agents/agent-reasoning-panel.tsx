"use client"
 
import { AgentTimeline, type AgentStepData } from "@/components/agents/agent-timeline"
import { ScrollArea } from "@/components/ui/scroll-area"

interface AgentReasoningPanelProps {
  steps: AgentStepData[]
  runId?: string | null
}

/**
 * Right sidebar panel: header with "Agent Reasoning" title + run ID badge,
 * scrollable body containing <AgentTimeline />.
 * Collapse toggle is a visual placeholder only — collapsed ~48px icon-strip
 * state is deferred per V §6.2.
 */
export function AgentReasoningPanel({ steps, runId }: AgentReasoningPanelProps) {
  return (
    <aside
      className="flex flex-col min-w-[340px] max-w-[420px] flex-[3] border-l border-border bg-bg-card overflow-hidden"
      aria-label="Agent reasoning panel"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-border shrink-0">
        <h2 className="text-[13px] font-medium text-text leading-tight">
          Agent Reasoning
        </h2>
        {runId && (
          <span className="text-[10px] font-mono text-text-dim bg-bg-elevated px-1.5 py-0.5 rounded select-none">
            {runId.slice(0, 8)}
          </span>
        )}

        {/* Collapse toggle placeholder — visual button only, not wired */}
        <button
          className="ml-auto p-1 text-text-dim hover:text-text transition-colors cursor-pointer"
          aria-label="Toggle panel (not implemented)"
          title="Collapse panel"
          type="button"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Scrollable body */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <AgentTimeline steps={steps} />
        </div>
      </ScrollArea>
    </aside>
  )
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9 3L5 7L9 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}