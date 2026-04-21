# Progress Log

## Task — Fix Sharpe Ratio and Max Drawdown always showing 0/null (4/21/2026)

**Description:** User reported that after running agents repeatedly, Max Drawdown % shows "0.0%" and Sharpe Ratio shows "—" (null). These are portfolio-level time-series metrics that the Monitor agent could not compute from a single snapshot.

**Summary:**
- Created `src/lib/orchestrator/compute-metrics.ts` — NEW step that fetches 90 days of daily OHLCV history for all holdings, builds a blended portfolio equity curve, then computes:
  - **Sharpe ratio:** daily returns → mean/std deviation → annualise by √252, using 5% risk-free rate. Returns `null` if fewer than 10 return samples or std=0.
  - **Max drawdown:** track running peak, find max `(peak - trough) / peak`. Returns 0 if no data.
- Added `computeMetricsStep` to `workflow.ts` between correlation and monitor steps.
- Updated Monitor prompt to include precomputed metrics (LLM can override but has real numbers to anchor to).
- Updated `normalize-output.ts` fallback path to pull precomputed metrics from raw LLM output instead of hardcoding `sharpe_ratio: null` and `max_drawdown_pct: 0`.
- Updated all downstream null-safety:
  - `use-holdings.ts` baseline: `sharpe: null`, `maxDrawdownPct: null`
  - `page.tsx` fallback: `maxDrawdownPct: null`
  - `portfolio-summary-bar.tsx` prop `number | null`, renders `"—"` when null
  - `portfolio-output-node.tsx` prop `number | null`, renders `"—"` when null
  - `format.ts` `drawdownPct` already handled null/undefined gracefully.
- TypeScript compiles clean in 6.2s.

**Gotchas:**
Build fails only on pre-existing DATABASE_URL `ERR_INVALID_URL` (missing protocol in env). Not related to this change.

---

## Hotfix: Agent model fallback chains (4/20/2026)
... (previous entries preserved)
