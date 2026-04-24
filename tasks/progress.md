# Progress Log

## Task — Show Risk Agent outputs in UI (4/22/2026)

**Description:** Expose `caveats`, `risk_summary`, and `improvement_summary` in the Agent UI for the Risk Agent step. Gracefully format the `caveats` array.

**Summary:**
- `src/hooks/use-agent-run.ts`: Added `caveats`, `risk_summary`, and `improvement_summary` properties to `buildStructuredOutput` risk case.
- `src/components/agents/agent-step.tsx`: Added array formatting for `caveats` in `formatRiskField` (joined with ` • `).

**Gotchas:**
- None. Built and typechecked successfully.

---

## Task — Fix Ollama Authorization & Risk Agent Logic (4/22/2026)

**Description:** The user uses Ollama Cloud, which requires an Authorization header. Also needed to update `riskAgent` models, compute a `concentration_score` (sum of squared weights) in `computeVar`, and add a hard quantitative rule for the riskAgent instructions regarding diversification.

**Summary:**
- `src/lib/market/embeddings.ts`: Added `OLLAMA_API_KEY` environment variable support to `fetchWithRetry`, injecting `Authorization: Bearer <key>` into headers.
- `src/lib/agents/risk.ts`: 
  - Changed `riskAgent` models to `"ollama-cloud/kimi-k2.6:cloud"` and `"ollama-cloud/glm-5.1:cloud"`.
  - Updated `computeVar` to calculate `concentration_score` using `sum(weight * weight)` and added it to the `outputSchema`.
  - Updated the `riskAgent` instructions to mandate an `approved_with_caveats` verdict if the `concentration_score` improves and VaR does not increase by >20%, rejecting only if catastrophic risks emerge or VaR increases by >20% without concentration improvement.

**Gotchas:**
- None. Build and typecheck pass clean.

---

## Task — Fix Risk Agent insufficient historical data crash (4/22/2026)

**Description:** The `runHistoricalStressTest` and `computeVar` tools threw a hard error when historical data was insufficient (e.g. testing BTC during 2008 GFC), causing the workflow step to crash. Modified them to catch this condition and return a descriptive error object instead, allowing the agent to process the result gracefully.

**Summary:**
- `src/lib/agents/risk.ts`: Updated `runHistoricalStressTest` and `computeVar` output schemas to include an optional `error: z.string()`.
- `src/lib/agents/risk.ts`: Changed the missing data check in `runHistoricalStressTest` to return an object with the error message instead of throwing an `Error`.
- `src/lib/agents/risk.ts`: Changed the missing data check in `computeVar` within its `Promise.all` mapping to set an `errorMessage` flag, and early-return an error object.

**Gotchas:**
- Had to manage `Promise.all` inside `computeVar` carefully with a scoped `errorMessage` variable to prevent multiple resolutions and properly surface the error to the agent. Build and typecheck pass cleanly.

---

## Task — Fix market data fetching and risk agent evaluation logic (4/22/2026)

**Description:** Risk agent stress tests silently swallowed missing historical data. CoinGecko limits history to 365 days on free tier, which breaks historical scenarios. Agent rejected portfolios despite massive concentration risk reductions.

**Summary:**
- `src/lib/market/index.ts`: Updated `getHistory` to route all historical requests to Yahoo Finance, bypassing CoinGecko historical limits. Automatically appends `-USD` to crypto tickers if missing. Removed unused `getCryptoHistoricalOHLCV` import.
- `src/lib/agents/risk.ts`: Updated `runHistoricalStressTest` and `computeVar` to throw an explicit `Error` when historical data is missing (length < 2), preventing silent calculation failures.
- `src/lib/agents/risk.ts`: Updated Risk Agent prompt to explicitly value diversification and concentration risk reduction, instructing it to lean towards `approved_with_caveats` for improved diversification even if absolute VaR/drawdown numbers are slightly worse.

**Gotchas:**
- None. Build and typecheck pass clean.

---

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

## UX Improvements UX-1 through UX-6 (4/22/2026)

**Description:** Replace ReactFlow Controls with custom zoom buttons, move correlation legend, fix caveats formatting by adding Risk Analysis modal, condense sidebar for Risk Agent.

**Summary:**
- **UX-1:** Created `ZoomControls` component using `useReactFlow()` hook with ZoomIn/ZoomOut/Maximize icons from lucide-react. Bottom-left, stacked vertically, dark-themed icon buttons. Removed `<Controls />` from ReactFlow.
- **UX-2:** Moved correlation legend from `bottom-3` to `bottom-16` so it sits above the zoom buttons.
- **UX-3:** Risk Agent step now shows condensed view (verdict badge already in header + one-line risk_summary truncated to 80 chars + "View Analysis" button) instead of full structured output key-value list. Caveats still formatted as pills in the modal.
- **UX-4+UX-5:** Created `risk-analysis-modal.tsx` using Dialog component. Contains: verdict banner (color-coded), VaR 95% metric card, caveat pills, risk summary bullet points (amber), improvement summary checklist (green), stress scenario count. Overrides `sm:max-w-lg` on DialogContent.
- **UX-6:** Wired modal in `agent-reasoning-panel.tsx`: `riskModalOpen` state, `onRiskViewDetails` callback passed via `AgentTimeline` → `AgentStep` (only for step index 3). Modal receives `structuredOutput` from Risk step.

**Verification:**
- `bun tsc --noEmit` — 0 errors
- `bun run build` — successful

**Gotchas:**
- `useReactFlow()` must be called inside a component rendered within `<ReactFlow>`, so `ZoomControls` is a separate child component placed inside `<ReactFlow>`.
- `structuredOutput` might be undefined in the Risk condensed view, so optional chaining was needed for the truncation check.
- `Dialog` component default is `sm:max-w-sm`; overridden with `className="sm:max-w-lg"` for the risk modal.

---

## UX Improvements UX-7 and UX-8 (4/22-23/2026)

**Description:** Adjust legend position to avoid blocking zoom controls, and visually refactor Risk Analysis modal.

**Summary:**
- **UX-7:** Moved correlation legend in `src/components/factory/factory-floor.tsx` to `top-4 left-4` so it doesn't block bottom-left zoom controls.
- **UX-8:** Refactored `RiskAnalysisModal` (`src/components/agents/risk-analysis-modal.tsx`) to a visual dashboard layout:
  - Split view for Current Risks vs Proposed Improvements.
  - Visual VaR 95% progress bar with dynamic colors (`bg-red`/`bg-amber`/`bg-teal`).
  - Stress Scenarios rendered as horizontal comparison bars mapped to `simulated_drawdown_pct`.
  - Recovery Days displayed as a KPI with an icon next to the drawdown percentage.
  - Max width increased to `sm:max-w-3xl` for better split view presentation.

**Verification:**
- `bun run build` — successful (0 TypeScript/build errors).

---

## UX Improvement UX-9 — Visual Risk Analysis Modal Redesign (4/23/2026)

**Description:** Redesigned the Risk Analysis Dashboard modal from a dense text-based layout to a visual, analytics-style dashboard.

**Summary:**
- Replaced text paragraphs with:
  - **SVG VaR Gauge**: Semi-circular animated arc with color-coded needle (teal < 8%, amber 8–15%, red > 15%). Animated `stroke-dashoffset` and needle rotation on mount. Centered big number with contextual subtitle.
  - **Stress Scenario Bars**: Custom HTML bars auto-scaled to max drawdown. Color-coded red > 15%, amber otherwise. Recovery days shown as a compact column. No Recharts dependency.
  - **Before/After Delta Cards**: Regex-parses `improvement_summary` for "Current X → Proposed Y" patterns and renders split Before/After comparison cards.
  - **Risk Factor Cards**: Split `risk_summary` into individual sentence cards with severity-colored left border and auto-detected icon (❌ for critical/catastrophic, ⚠️ otherwise).

**Bugs fixed (follow-up):**
- `var_95` shows `0.00%` when agent outputs it as string: added `parseFloat` coercion in `use-agent-run.ts` `buildStructuredOutput` and in modal's `RiskAnalysisModal`.
- Portfolio Changes truncation: removed 2-column grid and `truncate`, now single-column full-width cards with natural wrap.
- Caveats layout: horizontal scrollable → vertical stacked full-width badge rows.
- White scrollbar: added `.custom-scrollbar` CSS in `globals.css` with dark thumb/rail, applied to modal overflow container.
- Gauge whitespace: tightened SVG viewBox `120 70`, reduced `GAUGE_CENTER_Y` to 50, card padding from `p-4` to `p-3`.
- Verdict sentence in Risk Factors: `RiskCards` now filters out exact-match verdict sentences.
- File: `src/components/agents/risk-analysis-modal.tsx` (rewritten), `src/hooks/use-agent-run.ts` (var95 coerce), `src/app/globals.css` (scrollbar).

**Verification:**
- `bun run build` — successful (0 TypeScript/build errors).

**Gotchas:**
- No new dependencies added. Gauge is pure SVG + CSS transitions.
- `var_95` string coercion is a backward-compat fix until Risk Agent consistently outputs numbers.

---

## UX-12 — Override var_95 with pre-computed proposedVaR (4/23/2026)

**Description:** LLM sometimes echoes `0` in JSON schema for `var_95` while writing correct value (e.g. 3.78%) in prose. Workflow already pre-computes accurate `proposedVaR.var_pct`. UI gauge showing 0.00% is misleading when caveats reference real numbers.

**Summary:**
- `src/lib/orchestrator/workflow.ts` (`riskStep`): After agent returns, override `riskResultObj.var_95 = proposedVaR.var_pct` if `proposedVaR.var_pct` is a number. Ensures structured JSON field matches pre-computed reality.
- `src/components/agents/risk-analysis-modal.tsx` (`VaRGauge`): Added `null` guard. If computed `var95 === 0` and stress results exist, treat as `null` and render "N/A" instead of "0.00%". Added full `null` JSX branch with muted title text.

**Verification:**
- `npx tsc --noEmit` — clean (0 errors).
- `npx next build` — clean.

**Gotchas:**
- None.

---

## UX-11 — Structured stress scenario comparison in Risk Analysis Modal (4/23/2026)

**Description:** Risk modal previously showed only proposed stress bars. No comparison vs current portfolio per scenario. `improvement_summary` was regex-parsed into unreadable blocks. Fix: compute structured `scenario_comparisons` in workflow, expose in schema, render as table in UI.

**Summary:**
- `src/lib/agents/risk.ts`: Added `scenario_comparisons?: { scenario: string; current_drawdown: number; proposed_drawdown: number; delta_pp: number }[]` to `RiskOutput`. Optional, non-breaking.
- `src/lib/orchestrator/workflow.ts` (`riskStep`):
  - Computed `scenarioComparisons` by mapping `currentStress.stress_results` and matching `proposedStress` by scenario name.
  - Injected `scenarioComparisons` into prompt + added hard instruction: "Scenario-by-scenario comparison (DO NOT repeat in improvement_summary)".
  - Updated `improvement_summary` rule to restrict it to top-level metrics only (VaR, concentration, max drawdown across scenarios).
  - After agent returns, attached `scenarioComparisons` to `riskResultObj.scenario_comparisons`.
- `src/components/agents/risk-analysis-modal.tsx`:
  - Added `ScenarioComparisonTable` component. Rows show scenario name (truncated), current drawdown %, proposed drawdown %, delta in pp.
  - Delta color-coded: red if worse (proposed higher drawdown), teal if better, muted if unchanged.
  - Table placed after Stress Scenarios block, before Portfolio Changes.

**Verification:**
- `npx tsc --noEmit` — clean (0 errors).
- `npx next build` — clean.

**Gotchas:**
- None.

---

## UX Improvement UX-13 — KeyMetricsComparison + Performance-first auto-rejection (4/23/2026)

**Description:** Replace misleading regex-parsed DeltaCards with a symmetric Key Metrics Comparison table. Add hard auto-rejection gate in workflow before the Risk Agent LLM is called if proposed VaR or average drawdown worsens. Update agent prompts to performance-first philosophy.

**Summary:**
- `src/lib/agents/risk.ts`:
  - Extended `RiskOutput` Zod schema with 7 new aggregate fields (`current_avg_drawdown`, `proposed_avg_drawdown`, `current_max_drawdown`, `proposed_max_drawdown`, `current_concentration_score`, `proposed_concentration_score`, `current_var_95`).
  - Rewrote `riskAgent.instructions`: strict comparative hierarchy. `approved` only if proposed VaR lower AND avg drawdown lower AND concentration not worse. `rejected` if ANY key metric worsens. `approved_with_caveats` reserved for neutral risk with non-risk operational benefits. Explicit critical rules: worse VaR → always rejected; worse avg drawdown → always rejected; improvement_summary must compare exact numbers.
- `src/lib/orchestrator/workflow.ts` (`riskStep`):
  - Added hard auto-rejection gate BEFORE LLM call. Computes `currentAvgDrawdown` and `proposedAvgDrawdown` from pre-computed stress results. If `proposedVaR.var_pct > currentVaR.var_pct` OR `proposedAvgDrawdown > currentAvgDrawdown`, immediately returns synthetic `RiskOutput` with `verdict: "rejected"` and explanatory `caveats`/`risk_summary`.
  - Updated prompt "Rules" section to match new strict verdict rules.
  - After agent returns (non-rejected path), attaches all 7 computed aggregate metrics to `riskResultObj`.
- `src/components/agents/risk-analysis-modal.tsx`:
  - Removed `parseDeltas` regex helper and `DeltaCards` component entirely.
  - Added `MetricRow` and `KeyMetricsComparison` components: clean 4-row table with left "Current" and right "Proposed" columns + delta in percentage points (pp). Color-coded: red if proposed worse, teal if better, muted if same.
  - Rows: VaR 95%, Avg Stress Drawdown, Max Stress Drawdown, Concentration Score.
  - Graceful fallback to "N/A" for any missing new-field values (backward-compatible with old persisted runs).
  - `improvement_summary` rendered as plain italic paragraph below the metrics table, not split into cards.
- `src/hooks/use-agent-run.ts`:
  - Updated `buildStructuredOutput` risk case to forward all 7 new aggregate fields.
- `src/lib/agents/redesign.ts`:
  - Updated `redesignAgent.instructions` to add performance-first sentence at top: primary objective is improving risk-adjusted returns (lower VaR, lower drawdowns); diversification valuable only when it also improves or maintains performance.

**Verification:**
- `npx tsc --noEmit` — clean (0 errors).
- `npx next build` — clean.

**Gotchas:**
- Synthetic `rejected` result skips LLM entirely, so `riskResultObj.improvement_summary` is "". UI renders it as empty italic paragraph — acceptable.
- New aggregate fields are `optional()` in Zod schema so old persisted runs still deserialize without errors.
- `parseDeltas` and `DeltaCards` fully removed; no regressions because `KeyMetricsComparison` is self-contained.

---

## Task — Fix VaR 95% mapping and Risk Agent rejection logic (4/24/2026)

**Description:** The UI showed "N/A" for VaR 95% because `use-agent-run.ts` was mapping it as `var95` instead of `var_95`. Also, the Risk Agent synthetic auto-rejection gave misleading messages when metrics improved (e.g. "average drawdown increased from 33.62% to 31.05%").

**Summary:**
- `src/hooks/use-agent-run.ts`: Renamed `var95` to `var_95` in `buildStructuredOutput` risk case.
- `src/lib/orchestrator/workflow.ts`: Removed the hardcoded auto-rejection gate from `riskStep`. Updated `riskPrompt` to instruct the LLM to output "rejected" if VaR or average drawdown increases, and to correctly identify directional changes (e.g. decrease vs increase) in `risk_summary` and `improvement_summary`.
- `src/lib/agents/risk.ts`: Updated instructions to explicitly warn the LLM about directional math (e.g. 33.62% to 31.05% is a decrease/improvement, not an increase).

**Gotchas:**
- None. Build and typecheck pass clean.

---

## Task — Fix Risk Agent Stream Timeout (4/24/2026)

**Description:** Agent streams timed out for long-running agents because the client-side inactivity timer ignored `data-keepalive` events.

**Summary:**
- `src/hooks/use-agent-run.ts`: Removed the condition `if (event.type !== "data-keepalive")` so that the `lastActivity` timestamp is updated for all valid SSE events, including keepalives. This prevents the 90s timeout from firing prematurely while the server is still sending keepalive pulses.

**Gotchas:**
- None. Build successful.

---

## Task — Optimize Risk Agent Schema & Embeddings API (4/24/2026)

**Description:** Support OpenAI-compatible embeddings and prevent LLM from generating precomputed risk metrics.

**Summary:**
- `src/lib/market/embeddings.ts`: Added support for OpenAI-compatible endpoints if `OLLAMA_BASE_URL` ends with `/v1`.
- `src/lib/agents/risk.ts`: Made `stress_results` and `var_95` optional in `RiskOutput` Zod schema.
- `src/lib/orchestrator/workflow.ts`: Removed `stress_results` and `var_95` from `riskPrompt` JSON schema. Removed prompt instructions forcing LLM to list scenarios in caveats. Hard-assigned precomputed `stress_results` and `var_95` to `riskResultObj` after LLM completes.

**Gotchas:**
- None. `bun run build` clean.

---

## Phase 1 — Fix Average Drawdown Discrepancy (4/24/2026)

**Description:** Risk Analysis Dashboard text showed hallucinated average drawdown (38.20%) conflicting with table (31.05%). LLM computed averages itself from raw JSON arrays. Conflicting instructions existed between workflow.ts prompt and risk.ts instructions.

**Summary:**
- `src/lib/orchestrator/workflow.ts` (`riskStep`):
  - Added explicit pre-computed aggregate values for BOTH current and proposed portfolios: `average drawdown`, `max drawdown`, `concentration score` alongside existing `VaR 95%`.
  - Removed the conflicting instruction that told the LLM to reject if average drawdown increases (that is its own decision now, not a hard rule).
  - Added explicit instruction: "Do NOT compute average drawdown, max drawdown, or concentration score yourself. Use ONLY the pre-computed values stated explicitly above."
  - Pre-filled a template line in the prompt: `Current avg drawdown X% → Proposed avg drawdown Y%, an improvement of Zpp.` Instructed LLM to copy this verbatim into `improvement_summary`.
- `src/lib/agents/risk.ts`:
  - Rewrote `riskAgent.instructions` to remove the restriction that improvement_summary must be "top-level metrics ONLY" (which accidentally excluded avg drawdown).
  - Made the improvement_summary instruction general: "MUST explicitly compare current vs proposed with exact numbers. Do NOT omit the average drawdown comparison."
  - Kept strict verdict rules but removed the contradictory hard-veto language.

**Verification:**
- `bun run build` — successful (0 TypeScript/build errors).

**Gotchas:**
- None. No UI changes needed; `risk-analysis-modal.tsx` already renders table correctly from structured fields.

---

## Phase 2 — Replace Hard Veto with Weighted Risk Score (4/24/2026)

**Description:** Replace per-metric hard vetos in Risk Agent with a weighted composite risk score. Slightly worse VaR (+0.53pp) should be acceptable when max drawdown improves massively (-24.61pp) and concentration halves (-0.39pp).

**Files:** `src/lib/orchestrator/workflow.ts`, `src/lib/agents/risk.ts`, `src/components/agents/risk-analysis-modal.tsx`

**Summary:**
- `src/lib/orchestrator/workflow.ts` (`riskStep`):
  - Added `computeRiskScore` logic in-place: `score = 0.30 * varPct + 0.45 * maxDrawdownPct + 0.25 * concentrationScore` for both current and proposed portfolios.
  - Computed `currentScore`, `proposedScore`, `deltaScore = proposedScore - currentScore`.
  - Injected computed scores into `riskPrompt` with explicit labels.
  - Replaced per-metric veto rules with score-based verdict rules:
    - `approved` if `deltaScore < -0.05`
    - `approved_with_caveats` if `|deltaScore| <= 0.05`
    - `rejected` if `deltaScore > +0.05`
- `src/lib/agents/risk.ts`:
  - Rewrote `riskAgent.instructions` to use score-based logic. Instructions now say "The verdict is driven by the NET delta, not by any single metric."
  - Removed hard per-metric vetos ("If VaR higher → MUST reject", "If avg drawdown higher → MUST reject").
  - Kept explicit grounding: "Use the pre-computed risk scores provided in the prompt. Do NOT compute your own score."
- `src/components/agents/risk-analysis-modal.tsx`:
  - Verified existing `getVerdictConfig` already renders `approved_with_caveats` as amber (⚠️). No changes needed.

**Verification:**
- `bun run build` — successful (0 TypeScript/build errors).

**Gotchas:**
- None. UI already handles `approved_with_caveats`.

---

## Phase 3 — User Preference Modal + DB + Workflow Wiring (4/24/2026)

**Description:** Add a preference modal before rebalancing so the user can choose sector constraints and risk appetite. Persist preferences in DB, wire through workflow, and guide the Redesign Agent accordingly.

**Files:** `src/lib/db/schema.ts`, `src/lib/orchestrator/workflow.ts`, `src/lib/agents/redesign.ts`, `src/app/api/agents/run/route.ts`, `src/components/agents/rebalance-preferences-modal.tsx`, `src/hooks/use-agent-run.ts`, `src/components/agents/agent-reasoning-panel.tsx`

**Summary:**
- `src/lib/db/schema.ts`:
  - Added `user_preferences` table with `id`, `userId`, `sectorConstraint`, `riskAppetite`, `maxTurnoverPct`, `excludedTickers`, `createdAt`, `updatedAt`.
- `src/lib/orchestrator/workflow.ts`:
  - Defined `PreferencesSchema` with `sectorConstraint`, `riskAppetite`, `maxTurnoverPct`, `excludedTickers`.
  - Updated `portfolioFactoryWorkflow.inputSchema` from `z.object({})` to accept preferences.
  - Updated `fetchMarketSnapshot` `inputSchema` to `PreferencesSchema` and returned `preferences` in its output.
  - Updated `redesignStep` prompt to inject preferences (sector constraint, risk appetite, max turnover, excluded tickers) and compute `allowedAssetClasses` based on `sectorConstraint`.
- `src/lib/agents/redesign.ts`:
  - Rewrote `redesignAgent.instructions` with a "SECTOR CONSTRAINTS" and "RISK APPETITE" section. LLM reads these from the user preferences in the prompt context.
  - Added rule: respect `excludedTickers` and `maxTurnoverPct` from preferences.
- `src/app/api/agents/run/route.ts`:
  - Parse preferences from JSON body. Pass them into `workflow.execute({ inputData: preferences })`.
- `src/hooks/use-agent-run.ts`:
  - Added `UserPreferences` interface. Changed `startRun` signature to accept optional `preferences`.
  - POSTs preferences as JSON body to `/api/agents/run`.
- `src/components/agents/rebalance-preferences-modal.tsx` (new):
  - Dialog with sector dropdown, risk appetite dropdown, max turnover slider (5–100%).
  - Calls `onConfirm(prefs)` which triggers the agent run.
- `src/components/agents/agent-reasoning-panel.tsx`:
  - Replaced direct `onRun` call with modal open. Added `prefsModalOpen` state.
  - "Run" button opens preference modal; confirming inside modal triggers `onRun(prefs)`.

**Verification:**
- `bun run build` — successful (0 TypeScript/build errors).

**Gotchas:**
- `PreferencesSchema` needed to be injected into `MarketSnapshotSchema` so `fetchMarketSnapshot` output carries preferences for later steps to retrieve via `getStepResult`.
- API route needed explicit type annotation for `preferences` so `sectorConstraint` typed correctly and avoided `Record<string, unknown>` assignability error.

---

(End of file - total 408 lines)