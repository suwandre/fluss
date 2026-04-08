import { cn } from "@/lib/utils"
import type { VolatilityLabel } from "@/lib/types/visual"

type VolatilityBarProps = {
  segments: number
  filled: number
  label: VolatilityLabel
  className?: string
}

export function VolatilityBar({
  segments,
  filled,
  label,
  className,
}: VolatilityBarProps) {
  return (
    <div
      data-slot="volatility-bar"
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={cn(
            "w-[6px] h-[10px] rounded-[1px]",
            i < filled ? "bg-amber" : "bg-border-bright",
          )}
        />
      ))}
      <span className="ml-1.5 font-mono text-[11px] text-text-muted">
        {label}
      </span>
    </div>
  )
}
