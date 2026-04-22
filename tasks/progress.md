# Progress Log

## Task — Make Risk Agent compare proposed vs current portfolio (4/22/2026)

**Description:** Risk Agent always tested the current portfolio because tools read from DB. Need comparative evaluation: pre-compute both current and proposed stress/VaR, then ask the agent to compare and judge delta.

**Summary:**
- `src/lib/agents/risk.ts` — Exported `runHistoricalStressTest` and `computeVar` (added `export`). Both tools now accept optional `positions_override` array (`{ ticker, weight, assetClass, quantity? }`). When provided, skips DB read and uses passed positions directly. Removed reference to nonexistent `simulateRebalance` tool in agent instructions. Rewrote instructions: agent receives pre-computed numbers, ONLY job is comparative verdict. Verdict rules revised to comparative logic (better/worse vs current, not absolute thresholds). Added crypto-specific note: drawdowns up to 70% acceptable if current is worse — delta matters.
- `src/lib/orchestrator/workflow.ts` (`riskStep`) — Pre-computes both current and proposed portfolio stress results + VaR before calling Risk Agent:
  - Builds `currentPositions` from market snapshot weights.
  - Builds `proposedPositions` from redesign actions: looks up prices (existing from snapshot, new tickers via `getBatchPrices`), calculates `quantity = dollarValue / price`, skips unpriceable tickers with warning.
  - Calls `runHistoricalStressTest.execute` and `computeVar.execute` with `positions_override` for both sets.
  - Injects both result sets into prompt. Agent now ONLY compares.
- `src/components/agents/agent-reasoning-panel.tsx` (`RunSummary`) — If Risk verdict is `rejected` but `improvement_summary` mentions improvement (regex: improved/better/lower/delta/→), shows contextual message explaining current portfolio is even riskier and suggesting a more conservative redesign.

**Gotchas:**
- `runHistoricalStressTest.execute` and `computeVar.execute` are typed as possibly `undefined` on the tool object; cast `as any` in workflow to allow direct invocation.
- Build fails only at runtime DB connection (ECONNREFUSED / missing protocol). TypeScript compiles clean.

---

## Task — Switch embeddings to Ollama, guard against CoinGecko 401 crashes (4/21/2026)

**Description:** Remove `@ai-sdk/openai` dependency for embeddings. Add local Ollama fallback. Harden CoinGecko and equity-curve robustness.

**Summary:**
- `src/lib/market/embeddings.ts` — NEW. `generateEmbedding(text)` and `generateEmbeddings(texts)` call Ollama `/api/embeddings` and `/api/embed` directly via raw `fetch`. Model configurable via `OLLAMA_EMBEDDING_MODEL` (default `nomic-embed-text`). Base URL via `OLLAMA_BASE_URL` (default `http://localhost:11434`). Throws clear message: "Check your local Ollama server and model."
- `src/lib/db/schema.ts` — Changed pgvector `market_documents.embedding` from 1536 to 768 dimensions (matches nomic-embed-text). Generated migration `drizzle/0002_slippery_white_tiger.sql`.
- `src/lib/market/news-rag.ts` — Removed `@ai-sdk/openai` and `ai` imports. Replaced `embed`/`embedMany` calls with new `generateEmbedding`/`generateEmbeddings`. No caller signature changes.
- `src/lib/market/coingecko.ts` — Added `COINGECKO_BASE_URL` env support (default `https://api.coingecko.com/api/v3`). On HTTP 401, returns `null` and prints warning with ticker/endpoint instead of throwing.
- `src/lib/market/index.ts` — `getHistory` for crypto now wraps `getCryptoHistoricalOHLCV` in try-catch, returns `null` on failure.
- `src/lib/orchestrator/compute-metrics.ts` — Wrapped each `getHistory` call inside `Promise.all` with per-item try-catch so one ticker failure doesn't kill all metrics. Adjusted equity-curve logic to allow partial data per date: skips any date where a ticker has no price, includes date if at least one ticker contributes. If all tickers missing on a date, that date is omitted.

**Verification:**
- TypeScript compiles clean (6.2s).
- Build succeeds with dummy DATABASE_URL (fails at runtime DB connection, not compilation).

**Gotchas:**
- Build still fails on production DATABASE_URL because the env value lacks protocol (`://`). Unrelated to this change.

---

## Task — Add UX clarity: tooltips, verdict summary, stress test context (4/21/2026)

**Description:** User was confused by Risk Agent jargon ("Verdict: rejected", var95, scenarios) and stress test meaning. Implemented plain-English explanations.

**Summary:**
- `src/components/agents/agent-step.tsx`: Added `FIELD_TOOLTIPS` map with plain-English definitions for 13 agent output fields. Added small info-icon (ⓘ) buttons next to each structured-output key that show tooltip on hover. Added `formatRiskField` translations for verdict, var_95, and stress_results. Added `InfoIcon` helper.
- `src/app/layout.tsx`: Wrapped app in `<TooltipProvider>` so tooltips work globally.
- `src/components/agents/agent-reasoning-panel.tsx`: Added `RunSummary` component that displays a color-coded "What this means for you" box based on Risk Agent verdict. Green = approved, amber = caveats, red = rejected + "no action needed". Only shows when all agents are done.
- `src/components/charts/stress-test-chart.tsx`: Added plain-English explainer text above and below the chart title describing what stress tests are and how to read red vs gray bars.
- Installed shadcn `<Tooltip>` component (`bunx shadcn@latest add tooltip`).

**Gotchas:**
- Build fails only on pre-existing DATABASE_URL ERR_INVALID_URL (missing protocol in env). Not related.

---

## Task — Fix 5 UI bugs from user dogfooding session (4/21/2026)

**Description:** User reported 5 UX bugs after running the full agent pipeline. Each fixed independently.

**Summary:**
1. **Sharpe 0.00 for individual machine nodes:** `src/hooks/use-holdings.ts` now fetches 90d OHLCV per holding via `/api/market/historical/{ticker}?days=90`, computes daily returns, and derives per-asset annualized Sharpe (`mean/stdDev × √252`, risk-free daily = 0.05/252). Falls back to `null` (renders `"—"`) if <10 return samples or `stdDev = 0`. Added `sharpeMap` state; updated `MachineNodeData.sharpe` → `number | null`. `src/components/factory/machine-node.tsx` renders `"—"` when null.
2. **Cross-correlation edge looks unnatural:** `src/components/factory/conveyor-edge.tsx` now overrides `sourcePosition → Bottom` and `targetPosition → Top` for `isCrossCorrelation` edges so the Bezier curve draws vertically between stacked machine nodes. Removed unused `selected` prop dependency.
3. **Agent status dots all green despite critical output:** `src/components/agents/agent-step.tsx` replaced flat `done → nominal` mapping with `getDotStatus(status, structuredOutput)` that inspects actual agent verdicts: `critical/high/reject` → red, `warning/medium/approve_with_caveats` → amber, else → green.
4. **Risk Agent output too terse / confusing:** Same file, new `formatRiskField()` helper: `verdict → "❌ Rejected" / "⚠️ Approved with caveats" / "✅ Approved"`; `var_95 → "VaR 95%: X% (max daily loss at 95% confidence)"`; `stress_results → "N historical stress scenarios tested"`.
5. **Summary text not copy-pasteable:** Rewrote `ExpandableValue` in `agent-step.tsx` to render full text always, apply CSS `line-clamp-2` when collapsed, and move the "Show more / Show less" toggle into a separate `<button>` below the text. Text itself is fully selectable with `select-text` class.

**Gotchas:**
- `tsc --noEmit` passes clean (0 errors).
- `bun run build` fails only at collect-page-data due to pre-existing `DATABASE_URL` `ERR_INVALID_URL` (missing protocol in env). Unrelated.

---

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

## Task — Fix agents stuck in "Streaming..." (4/21/2026)

**Description:** Agents intermittently hang in "Streaming..." state forever. Root cause is a cascading failure: Yahoo Finance API calls hang indefinitely, server SSE keepalive races with reader causing deadlock, and client-side timeout gets reset by keepalives so it never fires.

**Summary:**
- `src/lib/market/yahoo.ts` — Added `YAHOO_TIMEOUT_MS = 15_000` and `withTimeout<T>()` wrapper. All `yahooFinance.quote()` and `yahooFinance.chart()` calls now race against a 15s timer. Existing catch blocks still catch the thrown `Error`.
- `src/app/api/agents/run/route.ts` — Replaced `Promise.race([reader.read(), keepalive])` with:
  - `setInterval` pumping `data-keepalive` via a serial write lock (`writeChain` + `safeWrite()`)
  - Main loop does plain `await reader.read()` then `await safeWrite(value)`
  - `finally` clears interval, drains write chain, then releases reader lock
  - All `writer.write()` calls replaced with `await safeWrite()`
- `src/hooks/use-agent-run.ts` — Moved `lastActivity = Date.now()` from raw byte read into the parsed-events loop, gated behind `event.type !== "data-keepalive"`. Client 90s timeout now fires even when server is stuck in infinite keepalive loop.

**Verification:**
- TypeScript compiles clean in 5.9s.
- Build fails only on pre-existing DATABASE_URL ERR_INVALID_URL (missing protocol in env).

---

## Task — Apply 5 targeted UI/UX fixes (4/21/2026)

**Description:** User reported 5 specific regressions / missing features after dogfooding. Each fix applied independently.

**Summary:**
1. **Deduped stress-test explainer text:** Removed duplicate wrapper paragraphs from `agent-reasoning-panel.tsx`. Only `stress-test-chart.tsx` keeps the text now.
2. **Stress chart data / colors / bar width:** `stress-test-chart.tsx` now maps `simulated_drawdown_pct` → absolute `drawdown` for bars, keeps signed `drawdown_pct` in tooltip. Color logic uses `Math.abs(drawdown_pct) > 15` (not hardcoded). Added `XAxis` with `domain={[0, 'auto']}` so bars render with proportional width. LabelList still shows `-17.6%`. Added tiny legend below chart: red = >15%, gray = manageable.
3. **Edge correlation legend on Factory Floor:** `factory-floor.tsx` now wraps `ReactFlow` in a relative container and renders an absolute-positioned legend box (bottom-left, `z-10`) with teal/amber/red lines + labels, entirely via Tailwind (not React Flow nodes).
4. **Separate run-state dot from verdict badge:** `agent-step.tsx` now has two independent indicators:
   - **Dot:** run-state only (`pending` = gray hollow, `streaming` = amber pulse, `done` = green, `error` = red).
   - **Verdict badge:** compact colored pill per agent type showing actual verdict (Monitor `health_status`, Bottleneck `severity`, Redesign `confidence`, Risk `verdict`). Added `useVerdictBadge()` helper and `VERDICT_BADGE_STYLES` map.
5. **Risk Agent evaluates proposed vs current portfolio:**
   - Updated `RiskOutput` Zod schema: `verdict` enum changed to `"approved" | "approved_with_caveats" | "rejected"`. Added `improvement_summary` field.
   - `workflow.ts` Risk step prompt now explicitly tells the agent: "You are evaluating the PROPOSED portfolio from the Redesign Agent, NOT the current portfolio." Passes proposed actions as simulated holdings.
   - UI consumers (`agent-step.tsx` `formatRiskField`, `agent-reasoning-panel.tsx` `RunSummary`) updated to handle both old (`approve`/`reject`) and new (`approved`/`rejected`) enum values, plus `approved_with_caveats` tier (amber box).

**Verification:**
- `bun tsc --noEmit` passes clean (0 errors).
- Build fails only at collect-page-data due to pre-existing `DATABASE_URL` `ERR_INVALID_URL` (missing protocol in env). Unrelated.

---

---

## Task — Fix three bugs: embeddings timeout, stress test date ranges, risk step portfolio re-normalization (4/22/2026)

**Description:** User reported three issues: (1) news RAG embeddings failing with `fetch failed` even after news fetch fix, (2) every stress test returning identical -9.5% for all historical crypto scenarios, (3) Risk Agent rejecting a "high confidence" redesign because the VaR/stress were computed on a different portfolio than the one proposed.

**Summary:**
1. **Ollama embedding fetch timeout/retry** (`src/lib/market/embeddings.ts`):
   - Added `fetchWithRetry` helper wrapping Ollama `/api/embeddings` and `/api/embed` calls.
   - 3 retries with progressive backoff (1s, 2s, 3s) and `AbortSignal.timeout(15_000)`.
   - Prevents indefinite hangs when Ollama is unreachable or cold-starting.

2. **Crypto stress test historical date ranges** (`src/lib/market/coingecko.ts`, `src/lib/market/index.ts`):
   - `getCryptoHistoricalOHLCV` expanded signature with optional `from`/`to` unix timestamps.
   - Uses CoinGecko `/market_chart/range?from=X&to=Y` when dates provided, instead of rolling `/market_chart?days=N`.
   - `index.ts:getHistory` now passes `period1`/`period2` to crypto path so historical scenarios (Terra/LUNA, FTX, COVID, etc.) fetch actual period-specific data instead of the same recent 30-day window.

3. **Risk step proposed positions** (`src/lib/orchestrator/workflow.ts`):
   - Old `proposedPositions` only iterated redesign `actions`, silently dropping any current holdings not mentioned.
   - Fixed to clone current positions into a map, apply redesign actions as deltas, keep untouched holdings, and normalize weights across the FULL portfolio.
   - This ensures the VaR95 and stress-test results reflect the actual portfolio the Redesign Agent intended.

**Verification:**
- `bun tsc --noEmit` passes clean (0 errors).
- Reviewer flagged dead variable `newPrices` (line 429), removed.

**Gotchas:**
- `newPrices` set was leftover from original price-fetch loop, now removed.

---

## Hotfix: Agent model fallback chains (4/20/2026)
... (previous entries preserved)
