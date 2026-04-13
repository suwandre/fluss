"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentStepData } from "@/components/agents/agent-timeline";
import type { MonitorOutput } from "@/lib/agents/monitor";

const INITIAL_STEPS: AgentStepData[] = [
  { name: "Monitor Agent", status: "queued" },
  { name: "Bottleneck Agent", status: "queued" },
  { name: "Redesign Agent", status: "queued" },
  { name: "Risk Agent", status: "queued" },
];

export interface UseAgentRunReturn {
  steps: AgentStepData[];
  runId: string | null;
  isRunning: boolean;
  error: string | null;
  monitorOutput: MonitorOutput | null;
  lastRunAt: Date | null;
  startRun: () => Promise<void>;
}

/**
 * Custom hook that POSTs to /api/agents/run and consumes the SSE UI message
 * stream. For Phase 2 only the Monitor Agent runs — the other 3 steps stay
 * "queued" until Phase 3 wires the full workflow.
 */
export function useAgentRun(): UseAgentRunReturn {
  const [steps, setSteps] = useState<AgentStepData[]>(INITIAL_STEPS);
  const [runId, setRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monitorOutput, setMonitorOutput] = useState<MonitorOutput | null>(
    null,
  );
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startRun = useCallback(async () => {
    // Abort any in-flight run
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset state
    setError(null);
    setMonitorOutput(null);
    setRunId(null);
    setIsRunning(true);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));

    // Mark Monitor as running
    setSteps((prev) =>
      prev.map((s, i) =>
        i === 0 ? { ...s, status: "running" as const, isStreaming: true } : s,
      ),
    );

    const startTime = Date.now();

    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          (body as Record<string, string>).error || `HTTP ${response.status}`,
        );
      }

      // Read SSE stream from response body
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedText = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline (SSE event boundary)
        const events = buffer.split("\n");
        buffer = events.pop()!; // keep incomplete trailing line

        for (const line of events) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(payload);
          } catch {
            continue; // skip malformed JSON
          }

          // Extract runId from custom data part
          if (
            event.type === "data-run-id" &&
            typeof (event.data as Record<string, string>)?.runId === "string"
          ) {
            setRunId((event.data as Record<string, string>).runId);
          }

          // Accumulate text deltas as reasoning
          if (
            event.type === "text-delta" &&
            typeof event.delta === "string"
          ) {
            accumulatedText += event.delta;
            setSteps((prev) =>
              prev.map((s, i) =>
                i === 0 ? { ...s, reasoning: accumulatedText } : s,
              ),
            );
          }

          // Surface stream errors
          if (
            event.type === "error" &&
            typeof event.errorText === "string"
          ) {
            throw new Error(event.errorText);
          }
        }
      }

      // Stream complete — parse structured output
      const durationMs = Date.now() - startTime;
      let parsed: MonitorOutput | null = null;
      try {
        parsed = JSON.parse(accumulatedText) as MonitorOutput;
        setMonitorOutput(parsed);
      } catch {
        // Not valid JSON — raw text already shown as reasoning
      }

      // Build a flat summary for the structured-output block in AgentStep
      const structuredSummary: Record<string, unknown> | undefined = parsed
        ? {
            health: parsed.health_status,
            summary: parsed.summary,
            concerns: parsed.concerns.length,
            escalate: parsed.escalate,
          }
        : undefined;

      setSteps((prev) =>
        prev.map((s, i) =>
          i === 0
            ? {
                ...s,
                status: "done" as const,
                isStreaming: false,
                durationMs,
                reasoning: accumulatedText,
                structuredOutput: structuredSummary,
              }
            : s,
        ),
      );
      setLastRunAt(new Date());
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message =
        err instanceof Error ? err.message : "Agent run failed";
      setError(message);
      setSteps((prev) =>
        prev.map((s, i) =>
          i === 0
            ? { ...s, status: "error" as const, isStreaming: false }
            : s,
        ),
      );
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { steps, runId, isRunning, error, monitorOutput, lastRunAt, startRun };
}