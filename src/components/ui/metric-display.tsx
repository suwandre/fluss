import { cn } from "@/lib/utils"

type MetricDisplayProps = {
  label: string
  value: string | number
  variant?: "default" | "positive" | "negative" | "accent"
  font?: "mono" | "sans"
  className?: string
}

const variantMap = {
  default: "text-text",
  positive: "text-green",
  negative: "text-red",
  accent: "text-accent",
} as const

export function MetricDisplay({
  label,
  value,
  variant = "default",
  font = "mono",
  className,
}: MetricDisplayProps) {
  return (
    <div
      data-slot="metric-display"
      aria-label={`${label}: ${value}`}
      className={cn("flex items-center justify-between", className)}
    >
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span
        className={cn(
          "text-[13px] font-medium",
          font === "mono" ? "font-mono" : "font-sans",
          variantMap[variant],
        )}
      >
        {value}
      </span>
    </div>
  )
}