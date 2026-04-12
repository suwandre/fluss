/**
 * Shared display formatting for portfolio metrics.
 *
 * Guards against floating-point rounding that would produce "-0.0%" or "-$0":
 * the formatted absolute value is checked *after* rounding, not before.
 */

// ── P&L percentage: "+14.2%" / "-3.8%" / "0.0%" ──────────────────────

export function pnlPercent(value: number): string {
  const abs = Math.abs(value).toFixed(1)
  if (abs === "0.0") return "0.0%"
  const sign = value > 0 ? "+" : "-"
  return sign + abs + "%"
}

// ── P&L dollars: "+$12,840" / "-$1,234" / "$0" ───────────────────────

function currencyAbs(value: number): string {
  return Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export function pnlDollars(value: number): string {
  const abs = currencyAbs(value)
  if (abs === "0") return "$0"
  const sign = value > 0 ? "+" : "-"
  return sign + "$" + abs
}

// ── Standalone currency (always positive): "$12,840" ─────────────────

export function currencyDisplay(value: number): string {
  return "$" + currencyAbs(value)
}

// ── Drawdown percentage: "-12.4%" ────────────────────────────────────

export function drawdownPct(value: number): string {
  const abs = Math.abs(value).toFixed(1)
  if (abs === "0.0") return "0.0%"
  return "-" + abs + "%"
}

// ── Relative time: "5s ago" / "3 min ago" / "2h ago" ────────────────

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 0) return "just now"
  if (seconds < 60) return seconds + "s ago"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes + " min ago"
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + "h ago"
  const days = Math.floor(hours / 24)
  return days + "d ago"
}
