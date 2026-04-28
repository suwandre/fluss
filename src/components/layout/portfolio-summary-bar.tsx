"use client";

import { cn } from "@/lib/utils";
import type { HealthState } from "@/lib/types/visual";
import { StatusDot } from "@/components/ui/status-dot";
import { Button } from "@/components/ui/button";
import {
  currencyDisplay,
  drawdownPct,
  timeAgo,
} from "@/lib/format";
import { healthLabelMap } from "@/components/factory/shared";

type PortfolioSummaryBarProps = {
  totalValue: number;
  unrealisedPnl: number;
  unrealisedPnlPct: number;
  sharpeRatio: number | null;
  maxDrawdownPct: number | null;
  lastRunAt: Date | null;
  health: HealthState;
  onAddHolding: () => void;
};

type PnlInfo = { text: string; variant: "default" | "positive" | "negative" };

function pnlSummary(value: number, pct: number): PnlInfo {
  if (value === 0)
    return {
      text: "$0 (0.0" + String.fromCharCode(37) + ")",
      variant: "default",
    };
  const sign = value > 0 ? "+" : "-";
  const absCurrency = currencyDisplay(Math.abs(value));
  const absPct = Math.abs(pct).toFixed(1);
  return {
    text: sign + absCurrency + " (" + sign + absPct + "%" + ")",
    variant: value > 0 ? "positive" : "negative",
  };
}

const pnlColorMap: Record<"default" | "positive" | "negative", string> = {
  positive: "text-green",
  negative: "text-red",
  default: "text-text",
};

type CellProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

function Cell({ label, children, className }: CellProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center gap-0.5 flex-1 min-w-0 px-5",
        className,
      )}
    >
      <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

export function PortfolioSummaryBar({
  totalValue,
  unrealisedPnl,
  unrealisedPnlPct,
  sharpeRatio,
  maxDrawdownPct,
  lastRunAt,
  health,
  onAddHolding,
}: PortfolioSummaryBarProps) {
  const pnl = pnlSummary(unrealisedPnl, unrealisedPnlPct);

  return (
    <div
      aria-label="Portfolio summary"
      className="h-[72px] bg-bg-card border-b border-border flex items-stretch"
    >
      <Cell label="Total Value">
        <span className="font-mono text-lg font-medium text-text">
          {currencyDisplay(totalValue)}
        </span>
      </Cell>

      <div className="w-px bg-border" />

      <Cell label="Unreal. P&L">
        <span
          className={cn(
            "font-mono text-lg font-medium",
            pnlColorMap[pnl.variant],
          )}
        >
          {pnl.text}
        </span>
      </Cell>

      <div className="w-px bg-border" />

      <Cell label="Sharpe">
        <span className="font-mono text-lg font-medium text-text">
          {sharpeRatio !== null ? sharpeRatio.toFixed(2) : "—"}
        </span>
      </Cell>

      <div className="w-px bg-border" />

      <Cell label="Max Drawdown">
        <span className="font-mono text-lg font-medium text-red">
          {maxDrawdownPct !== null ? drawdownPct(maxDrawdownPct) : "—"}
        </span>
      </Cell>

      <div className="w-px bg-border" />

      <div className="flex flex-col justify-center gap-0.5 w-[220px] shrink-0 px-5">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              Last Run
            </span>
            <span className="font-mono text-xs text-text-dim">
              {lastRunAt ? timeAgo(lastRunAt) : "Never"}
            </span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={onAddHolding}
            aria-label="Add holding"
            className="size-8 shrink-0 border-border-bright bg-bg-elevated hover:bg-accent hover:text-accent-foreground"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M7 1v12M1 7h12" />
            </svg>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={health} size="sm" />
          <span
            className={cn(
              "text-xs font-medium capitalize",
              healthLabelMap[health],
            )}
          >
            {health}
          </span>
        </div>
      </div>
    </div>
  );
}
