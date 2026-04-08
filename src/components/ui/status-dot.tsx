import { cn } from "@/lib/utils"
import type { HealthState } from "@/lib/types/visual"

type StatusDotProps = {
  status: HealthState
  size?: "sm" | "md"
  animate?: boolean
  className?: string
}

const sizeMap = { sm: "size-1.5", md: "size-2" } as const

const colorMap: Record<HealthState, string> = {
  nominal: "bg-green shadow-[0_0_6px_var(--green-glow)]",
  warning: "bg-amber shadow-[0_0_6px_var(--amber-glow)]",
  critical: "bg-red shadow-[0_0_6px_var(--red-glow)]",
}

const pulseMap: Record<HealthState, string> = {
  nominal: "animate-pulse-green",
  warning: "animate-pulse-amber",
  critical: "animate-pulse-red",
}

export function StatusDot({
  status,
  size = "md",
  animate = false,
  className,
}: StatusDotProps) {
  return (
    <span
      data-slot="status-dot"
      className={cn(
        "shrink-0 rounded-full",
        sizeMap[size],
        colorMap[status],
        animate && pulseMap[status],
        className,
      )}
    />
  )
}
