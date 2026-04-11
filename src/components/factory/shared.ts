import type { HealthState } from "@/lib/types/visual"

// ── Health color mappings ───────────────────────────────────────────

export const healthBorderMap: Record<HealthState, string> = {
  nominal: "border-green",
  warning: "border-amber",
  critical: "border-red",
}

export const healthLabelMap: Record<HealthState, string> = {
  nominal: "text-green",
  warning: "text-amber",
  critical: "text-red",
}

// ── P&L helpers ─────────────────────────────────────────────────────

export function pnlVariant(value: number): "default" | "positive" | "negative" {
  if (value === 0) return "default"
  return value > 0 ? "positive" : "negative"
}

// ── React Flow Handle styling ───────────────────────────────────────

export const HANDLE_CLASSNAME = "!bg-border-bright !w-2 !h-2 !border-0"
