# Progress Log

## Task — Show Risk Agent outputs in UI (4/22/2026)

**Description:** Expose `caveats`, `risk_summary`, and `improvement_summary` in the Agent UI for the Risk Agent step. Gracefully format the `caveats` array.

**Summary:**
- `src/hooks/use-agent-run.ts`: Added `caveats`, `risk_summary`, and `improvement_summary` properties to `buildStructuredOutput` risk case.
- `src/components/agents/agent-step.tsx`: Added array formatting for `caveats` in `formatRiskField` (joined with ` • `).

**Gotchas:**
- None.

---

## Task — Strip raw risk metrics + two-tier scheduler (4/25/2026)

**Description:** Fix unreadable Risk Agent sidebar output (raw floats) and replace wasteful 15-min full-pipeline scheduler with a conditional two-tier approach.

**Summary:**
- `src/hooks/use-agent-run.ts` (`buildStructuredOutput` risk case):
  - Removed 8 raw numeric fields from sidebar output: `var_95`, `current_avg_drawdown`, `proposed_avg_drawdown`, `current_max_drawdown`, `proposed_max_drawdown`, `current_concentration_score`, `proposed_concentration_score`, `current_var_95`.
  - Sidebar now shows only verdict, scenarios count, caveats, `risk_summary`, and `improvement_summary` (both render via existing `ExpandableValue`).
  - Full metrics remain available on `workflowOutput` for modal consumption.
- `src/components/agents/agent-step.tsx`:
  - Deleted dead `key === "var_95"` and `key === "stress_results"` branches from `formatRiskField`. Kept `caveats` array join.
- `src/lib/orchestrator/scheduler.ts`:
  - Replaced monolithic tick with two-tier scheduler.
  - Tier 1: fetch holdings → `getBatchPrices` → `computePortfolioMetrics` → direct `monitorAgent.generate()` with prompt matching `workflow.ts` monitorStep. If empty holdings → skip. If nominal → persist lightweight `agentRuns` (`agentName: "monitor"`, `trigger: "cron"`) and return.
  - Tier 2: if warning/critical → `ingestNewsHeadlines` → full `portfolioFactoryWorkflow` with `sectorConstraint: "diversify"`, `riskAppetite: "aggressive"`, `maxTurnoverPct: 30`, `excludedTickers: []`.
  - On-demand `/api/agents/run` API flows unaffected.

**Verification:**
- `npx tsc --noEmit` — 0 errors.
- `npx next build` — successful.

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

## UX Prototype — Portfolio Redesign UX Overhaul (4/24/2026)

**Description:** Users see a long text block from the Redesign Agent and don't know what the final portfolio looks like. The Risk Agent just says "approved" but doesn't show the approved changes. No pipeline progress indicator. Agents keep suggesting SPY and GLD only.

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx` (NEW): Dialog modal `sm:max-w-3xl` with header + confidence badge, proposed allocation table (Current vs Proposed with delta), 3 expected-improvement delta cards (Sharpe, Volatility, Max Drawdown), narrative summary, and "View Risk Analysis →" footer button.
- `src/components/agents/agent-step.tsx`: Redesign step now shows condensed "X actions proposed" + confidence badge, followed by "View Proposal" button. Risk step now renders a "Final Verdict" line (✅ approved / ❌ rejected / ⚠️ caveats) above the "View Analysis" button.
- `src/components/agents/agent-reasoning-panel.tsx`: Added `PipelineStatusBar` at the top of the panel body — 5-step horizontal status (Monitor → Bottleneck → Redesign → Risk → Final) with green done dots, amber pulse for running, hollow gray for future. Added `FinalActionState`: when all agents are done and risk verdict is approved/caveats, shows "Apply Redesign" primary button + "Keep Current Portfolio" secondary. If rejected, shows amber box with "Try Again" button. Added `onRedesignViewDetails` prop pass-through to `AgentTimeline`.
- `src/hooks/use-agent-run.ts`: Expanded `buildStructuredOutput` "redesign" case to forward `proposal_summary`, `proposed_actions`, `sharpe_delta`, `volatility_delta_pct` to the UI.
- `src/app/page.tsx`: Added `redesignModalOpen` state. Computed `currentAllocations` and `redesignData` via `useMemo`. Passed `onRedesignViewDetails` to `AgentReasoningPanel`. Rendered `<RedesignProposalModal>` with all required props at page level.
- `src/lib/agents/redesign.ts`: Expanded `ALTERNATIVE_UNIVERSE` with `international`, `commodities`, `reits`, `fixed_income` categories. Added optional `max_drawdown_delta_pct` to `expected_improvement` schema. Added two strict diversification rules to agent instructions (≥3 asset classes, quantitative justification for >20% positions).

**Verification:**
- `bun run build` — successful (0 TypeScript/build errors).
- `npx tsc --noEmit` — 0 errors.

**Gotchas:**
- `AgentTimeline` already had `onRedesignViewDetails` prop from prior sector heatmap work — no structural change needed there.
- `RedesignProposalModal` delta values: Sharpe higher = good (green ▲), Volatility lower = good (green ▼), Max Drawdown lower = good (green ▼).
- Max Drawdown delta field is optional in schema and currently shows "—" until the agent populates it.

---

## Task — Fix PipelineStatusBar horizontal scroll (4/26/2026)

**Description:** Pipeline status bar used `flex overflow-x-auto` forcing horizontal scroll to see all 5 steps. Sidebar is narrow (min 340px). Replaced with grid layout so all steps are always visible.

**Summary:**
- `src/components/agents/agent-reasoning-panel.tsx` (`PipelineStatusBar`):
  - Container: `flex items-center gap-3 … overflow-x-auto` → `grid grid-cols-5 gap-1 … py-3`.
  - Each step: `flex items-center gap-1.5 shrink-0` → `flex flex-col items-center gap-1` (dot on top, label below).
  - Removed `→` arrow separators between steps.
  - Label: added `text-center truncate` to `text-[10px] font-mono uppercase tracking-wide` for overflow safety on "Bottleneck".
  - All status logic (isDone/isRunning/isError/isLast/finalGreen) untouched.

**Verification:**
- `npx tsc --noEmit` — 0 errors.
- `bun run build` — successful.

**Gotchas:**
- None.

---

**Description:** Build infrastructure for real sector analysis: `ticker_metadata` DB table, Yahoo Finance + crypto fallback metadata fetcher, sync function wired into workflow, and sector heatmap modal comparing current vs proposed portfolio allocation.

**Summary:**
- `src/lib/db/schema.ts`: Added `ticker_metadata` table (`id`, `ticker` unique, `name`, `sector`, `industry`, `assetClass`, `updatedAt`). Generated migration `drizzle/0004_redundant_prodigy.sql`.
- `src/lib/market/ticker-metadata.ts` (NEW): `fetchTickerMetadata(ticker, assetClass)` — hardcoded crypto maps (Layer 1, DeFi, Stablecoin, Other), Yahoo Finance `quoteSummary` with `assetProfile` module for non-crypto, fallback to `ETF`/`Equity` + `Unknown`. `syncTickerMetadataForHoldings(holdings)` dedupes tickers, fetches metadata, upserts via `onConflictDoUpdate`.
- `src/lib/orchestrator/workflow.ts`: After `fetchMarketSnapshot`, added `syncTickerMetadataForHoldings` call with unique tickers from holdings.
- `src/app/api/ticker-metadata/route.ts` (NEW): GET endpoint returning all ticker metadata. `GET /api/portfolio/holdings` enriched to return `sector` and `industry` from joining `ticker_metadata`.
- `src/hooks/use-sector-exposure.ts` (NEW): Computes sector exposure for current portfolio (from holdings + live prices) and proposed (from redesign actions). Groups by sector, normalizes to 100%. Returns `{ current: Record<string, number>, proposed: Record<string, number> }`.
- `src/components/agents/sector-heatmap-modal.tsx` (NEW): Two-column modal (Current vs Proposed). Vertical teal blocks sized proportionally to weight%, opacity `min(0.2 + weight*0.8, 1)`. Hover tooltips show exact %. Alphabetically sorted. Gray placeholder for missing sectors. Fallback message when no redesign data.
- `src/components/agents/agent-step.tsx`: Redesign step (index 2) shows "View Allocation" button when done.
- `src/components/agents/agent-timeline.tsx`: Added `onRedesignViewDetails` prop, passed through to Redesign step.
- `src/components/agents/agent-reasoning-panel.tsx`: Manages `sectorModalOpen` state, passes callback to `AgentTimeline`.
- `src/app/page.tsx`: Imports `SectorHeatmapModal`, manages open state, feeds current holdings + proposed actions into modal.

**Verification:**
- `bun run build` — successful (0 TypeScript/build errors).
- `npx tsc --noEmit` — 0 errors.

**Gotchas:**
- `yahoo-finance2` `quoteSummary` module API requires version check; TypeScript types may not expose `assetProfile` depending on package version. Fallback handles missing data gracefully.
- Crypto tickers rely on hardcoded suffix parsing; unknown ones grouped into "Cryptocurrency / Other".

---

## UX Fixes — PRP Metric Cards, Inline Risk, Sentiment Detection (4/25/2026)

**Description:** User reported 6 UI/UX bugs: Max Drawdown "—" caused by strict null checks, truncated rationale with no expand, blobby italic summary paragraph, broken "View Risk Analysis" button, warning icons on positive Risk Factor text, and a white scrollbar on the Agent Reasoning panel.

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx`:
  - New `MetricCard` subcomponent renders label + Current + Proposed + Delta in a clean list layout. Current value passed from `page.tsx` `summaryMetrics`.
  - Table rows now have `cursor-pointer` and toggle `whitespace-normal` via `expandedRow` state on click, replacing permanent `truncate`.
  - `proposal_summary` split via `splitSentences()` into bulleted list with teal markers; removed `italic` and `leading-relaxed`.
  - Added `RiskAnalysisContent` inline rendering: `activeView` state toggles between Proposal and Risk; "View Risk Analysis" / "← Back to Proposal" buttons.
  - Fixed `MetricCard` delta visibility: only shows when at least one of current/proposed is a number (`showDelta = hasDelta && (hasCurrent || hasProposed)`).
- `src/components/agents/risk-analysis-modal.tsx`:
  - Extracted reusable `RiskAnalysisContent` component from the modal body.
  - Renamed "Risk Factors" → "Risk Assessment Summary"; de-red-shifted background/border.
  - Replaced binary `severity()` with 3-tier `sentimentConfig()` (bad=red/❌, good=green/✅, neutral=amber/⚠️) with expanded regexes.
- `src/components/agents/agent-reasoning-panel.tsx`:
  - Replaced `ScrollArea` import + usage with native `<div className="flex-1 overflow-y-auto custom-scrollbar">`.
- `src/app/page.tsx`:
  - Wired new props `currentSharpe`, `currentMaxDrawdown`, `currentVolatility`, `riskMetrics`, `riskStructuredOutput` into `RedesignProposalModal`.
  - Removed dead `onViewRiskAnalysis` callback.

**Verification:**
- `bun run build` — successful (0 TypeScript/build errors).
- `npx tsc --noEmit` — 0 errors.

**Gotchas:**
- None. No new dependencies.

---

## UX Fix — Unified Redesign/Risk Modal + Sentiment Fix (4/25/2026)

**Description:** User reported two issues: (1) two separate "risk analysis" modals exist — one from "View Analysis" in Risk Agent step, and one from "View Risk Analysis" in Redesign Proposal modal. User wants a single universal "View Proposal" button that shows the redesign proposal with inline risk analysis already embedded. (2) Risk Assessment Summary positive sentences (e.g. "meaningful net risk reduction") and call-to-action sentences ("Approve this proposal.") were incorrectly flagged with warning (yellow ⚠️) icon.

**Summary:**
- `src/components/agents/agent-reasoning-panel.tsx`: Removed `RiskAnalysisModal` import, removed `riskModalOpen` state, removed inline `<RiskAnalysisModal>` render. Removed `onRiskViewDetails` from `AgentTimeline` props.
- `src/components/agents/agent-timeline.tsx`: Removed `onRiskViewDetails` prop entirely. `AgentStep` `onViewDetails` now only wired for redesign step (index 2).
- `src/components/agents/agent-step.tsx`: `isRiskDone` no longer depends on `onViewDetails`. Removed "View Analysis" button from Risk step condensed view. Kept verdict line and risk summary text.
- `src/components/agents/redesign-proposal-modal.tsx`: Removed `activeView` state and footer toggle buttons ("View Risk Analysis →" / "← Back to Proposal"). Proposal content and `<RiskAnalysisContent>` now always rendered inline together when `riskStructuredOutput` is available.
- `src/components/agents/risk-analysis-modal.tsx`: Added CTA sentence exclusions in `RiskCards` filter (`approve this proposal`, `reject this proposal`). Expanded `good` sentiment regex with `reduction`, `decrease`, `falling`, `improvement`, `decline`, `recover`.

**Verification:**
- `bun tsc --noEmit` — 0 errors.
- `bun run build` — successful.

**Gotchas:**
- None.

---

## Task — Risk Agent expandable + View Proposal prominent button (4/25/2026)

**Description:** Two UI fixes in agent reasoning sidebar: (1) Risk Agent summary now generic via `ExpandableValue` with verdict rendered inside generic loop; (2) "View Proposal" button moved to bottom of timeline and made prominent.

**Summary:**
- `agent-step.tsx`:
  - Deleted `isRiskDone` branch, `isRedesignDone` branch, and all associated variables (`riskSummaryLine`, `isRiskDone`, `isRedesignDone`).
  - Removed `onViewDetails` prop from `AgentStepProps` + destructuring.
  - Inside `Object.entries(structuredOutput).map(...)` loop, added special `key === "verdict"` case rendering colored outcome lines without `key:` label.
  - Kept `formatRiskField` for other keys.
  - Kept `TRUNCATE_THRESHOLD` because `ExpandableValue` still uses it.
- `agent-timeline.tsx`:
  - Removed `onViewDetails={i === 2 ? onRedesignViewDetails : undefined}` from `AgentStep` call.
- `agent-reasoning-panel.tsx`:
  - Added conditional "View Proposal" button after `<AgentTimeline />`, only shown when redesign step (`steps[2]`) is done.
  - Removed dead imports (`SectorHeatmapModal`, `RedesignProposalModal`) and unused `riskStructuredOutput` variable.
  - Removed `onSectorViewDetails` prop from `AgentReasoningPanel` (caller in `page.tsx` updated too).
- `page.tsx`:
  - Removed `onSectorViewDetails` prop from `<AgentReasoningPanel>` call.

**Verification:**
- `npx next build` — successful (0 errors).
- `npx tsc --noEmit` — 0 errors.

**Gotchas:**
- None.

---

## Task — Strip redesign/risk sidebar verbosity + guard arrays (4/26/2026)

**Description:** Redesign and Risk Agent sidebars showed wall-of-text paragraphs and raw JSON arrays. User wants concise status strip; detail goes in modals.

**Summary:**
- `src/hooks/use-agent-run.ts` (`buildStructuredOutput`):
  - Redesign case now returns only `actions` (count) and `confidence`. Removed: `improvement`, `proposal_summary`, `proposed_actions` (raw objects), `sharpe_delta`, `volatility_delta_pct`.
  - Risk case now returns only `verdict` and `scenarios`. Removed: `caveats`, `risk_summary`, `improvement_summary`. Verdict already renders as colored outcome line in `AgentStep`. Scenarios count stays.
- `src/components/agents/agent-step.tsx`:
  - `renderValue`: added guard for arrays of objects → `[N items]` instead of raw JSON.
  - `FIELD_TOOLTIPS`: removed `var_95` and `stress_results` tooltip entries.

**Verification:**
- `npx tsc --noEmit` — 0 errors.
- `npx next build` — successful.

**Gotchas:**
- None.

---

## Task — Tabbed Proposal/Risk Modal (4/26/2026)

**Description:** Proposal modal was a single long scroll mixing proposal data with risk analysis. User requested tabs at the top so each view is focused and toggle is immediately accessible.

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx`:
  - Added `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` from `@/components/ui/tabs` (installed via shadcn).
  - Two tabs: **Proposal** (allocation table, metric cards, summary bullets) and **Risk Analysis** (`<RiskAnalysisContent>`).
  - Default active tab: **Proposal**.
  - Tab bar sits below `DialogHeader`, above scrollable content. Each `TabsContent` wraps its content in `overflow-y-auto max-h-[70vh] pr-2 custom-scrollbar`.
  - Removed inline `<RiskAnalysisContent>` from Proposal tab; risk content now only appears under the Risk Analysis tab.
  - Did NOT touch `risk-analysis-modal.tsx` — `RiskAnalysisContent` stays reusable.

**Verification:**
- `npx tsc --noEmit` — 0 errors.
- `npx next build` — successful.

**Gotchas:**
- None.

---

## Task — Equalize Tab Heights + Enrich Proposal Tab (4/26/2026)

**Description:** Proposal tab was visually short compared to Risk tab, creating jarring height jumps when switching tabs. Added fixed-height container equality and three new visual sections.

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx`:
  - Replaced per-tab `max-h-[70vh]` with shared `min-h-[600px] overflow-y-auto` on `TabsContent` wrappers. Both tabs scroll internally if content exceeds container.
  - Added `sectorExposure` prop.
  - Inserted **Sector Re-allocation Bars** after allocation table: horizontal current/proposed bars per sector, delta number, sorted by current+proposed weight descending. Used `--text-dim`, `bg-teal`, and `bg-[rgba(255,255,255,0.15)]` bars.
  - Inserted **Before/After Snapshot Cards** below metric cards: 2-column grid with Positions, Max Position %, Turnover (`sum(abs(delta))/2`), Sectors (unique ticker count), Concentration. Style matches existing metric cards (`bg-bg-elevated border border-border rounded-lg p-3`). Label uppercase `text-[10px] font-mono text-text-dim`. Value `text-[11px] font-mono text-text`.
  - Inserted **Risk Score Delta** as full-width single card below snapshot cards. Score formula: `(avgStressDrawdown * 0.4) + (maxDrawdown * 0.3) + (var95 * 0.3)`. Shows current → proposed with arrow, delta number, colored badge "Improved" (green) or "Worsened" (red). Graceful N/A if `riskMetrics` missing.
  - Proposal summary bullets remain below all new cards, unchanged.
- `src/app/page.tsx`: Passed `sectorExposure` into `<RedesignProposalModal>`.

**Verification:**
- `npx tsc --noEmit` — 0 errors.
- `npx next build` — successful.

**Gotchas:**
- None.

---

## Task — Proposal Tab Spacing Fix (4/26/2026)

**Description:** All sections in the Proposal tab were squished together with zero vertical gap. Cards had tiny `p-3` padding. Needed visual breathing room to match the polished Risk Analysis tab.

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx`:
  - Added `space-y-6` to the Proposal tab inner container.
  - Allocation table header: `px-3 py-2` → `px-4 py-3`. Table rows: `px-3 py-2` → `px-4 py-3`. Empty state: `px-3` → `px-4`.
  - Wrapped sector re-allocation block in card (`rounded border border-border bg-bg-elevated p-5`). Label `mb-2` → `mb-3`.
  - MetricCard component: `p-3` → `p-4`, label `mb-2` → `mb-3`.
  - Snapshot cards: `p-3` → `p-4`, label `mb-2` → `mb-3`.
  - Risk score delta card: `p-3` → `p-4` (both N/A and data variants).
  - Proposal summary bullets card: `p-3` → `p-4`, `space-y-2` → `space-y-3`, `leading-snug` → `leading-relaxed`.
  - DialogContent: added `p-6` to override default `p-4`.

**Verification:**
- `bun run build` — successful (0 errors).

**Gotchas:**
- Extra closing `</div>` after wrapping sector card — removed.

---

## Bug Fixes — PRP Modal: Max Drawdown fallback, Sector Re-allocation, Sector key union (4/26/2026)

**Description:** Three bugs in the Portfolio Redesign Proposal modal:

1. **Max Drawdown card missing Proposed + Delta** when LLM didn't output `max_drawdown_delta_pct`. Card showed "N/A" even though `riskMetrics.proposed_max_drawdown` was available. Label said "Max Drawdown" instead of "Peak-to-Trough Drawdown".
2. **Sector Re-allocation only showed "crypto 100% → 0%"** because `proposedActions` in `page.tsx` hardcoded `assetClass: "equity"` for every ticker, and sector code only iterated `Object.keys(current)`, missing new sectors like Equity, Fixed Income.
3. No union of sector keys from both current and proposed — new sectors in proposed were invisible.

**Summary:**

- `src/components/agents/redesign-proposal-modal.tsx`:
  - `proposedMaxDrawdown`: added fallback — if `max_drawdown_delta_pct` is null AND `riskMetrics.proposed_max_drawdown` is a number, use `riskMetrics.proposed_max_drawdown`.
  - Added `maxDrawdownDelta` computed value: if `hasMaxDd`, use explicit delta; else if both `currentMaxDrawdown` and `proposedMaxDrawdown` are numbers, compute `proposed - current` inline.
  - MetricCard props updated: `delta={maxDrawdownDelta}`, `showProposed={proposedMaxDrawdown != null}`, label `"Peak-to-Trough Drawdown"`.
  - Sector re-allocation: changed from `Object.keys(sectorExposure.current)` to union set of keys from BOTH current and proposed. Sort by `Math.max(current, proposed)` descending so active sectors appear first.

- `src/hooks/use-sector-exposure.ts`:
  - Added `TICKER_SECTOR_MAP` (BTC→Cryptocurrency, ETH→Cryptocurrency, QQQ→Equity, AGG→Fixed Income, SPY→Equity, GLD→Commodities, VGK→International, VNQ→REITs, TLT→Fixed Income).
  - Added `ASSET_CLASS_LABELS` map (crypto→Cryptocurrency, equity→Equity, fixed_income→Fixed Income, commodities→Commodities, reits→REITs).
  - `groupBySector`: if `item.sector` is null/empty/whitespace, check `TICKER_SECTOR_MAP` first, then capitalize `assetClass` via `ASSET_CLASS_LABELS`, then `capitalize()`, final fallback "Other".

- `src/app/page.tsx`:
  - `proposedActions` useMemo: replaced hardcoded `assetClass: "equity"` with `TICKER_ASSET_CLASS` lookup (BTC/ETH→crypto, QQQ/SPY/VGK→equity, AGG/TLT→fixed_income, GLD→commodities, VNQ→reits, default→equity).

**Verification:**
- `npx tsc --noEmit` — 0 errors.
- `bun run build` — successful.

**Gotchas:**
- None.

---

## Task — Sector naming fix, Tooltips, Proposal/Risk tab restructure (4/27/2026)

**Description:** Three changes: (1) Fix sector naming bug where "crypto" and "Cryptocurrency" weren't merging. (2) Add tooltips to all Proposal tab card labels. (3) Move Sharpe/Avg Drawdown/Peak-to-Trough cards from Proposal to Risk tab, convert Risk Score to inline line.

**Summary:**
- `src/hooks/use-sector-exposure.ts`:
  - `groupBySector`: changed sector resolution to `item.sector?.trim().toLowerCase() || item.assetClass?.trim().toLowerCase() || "other"`.
  - Removed hardcoded `TICKER_SECTOR_MAP`, `ASSET_CLASS_LABELS`, and `capitalize()`. All keys now lowercase.
- `src/components/agents/redesign-proposal-modal.tsx`:
  - Added `LABEL_TOOLTIPS` map and `LabelWithTooltip` component (dashed underline + `?` circle + `title`).
  - Snapshot cards use `<LabelWithTooltip>`. Removed `MetricCard` and old metric card variables.
  - Removed 3 metric cards (Sharpe, Avg Stress Drawdown, Peak-to-Trough).
  - Risk Score: card → inline summary line with delta badge.
  - Risk Score weights: 45/30/25 (drawdown/VaR/concentration) per tooltip.
  - Proposal Summary label: tooltip added.
  - Sectors count: uses sector exposure keys instead of ticker count.
  - `RiskAnalysisContent` call passes `currentSharpe`, `currentVolatility`, `currentMaxDrawdown`, `sharpeDelta`.
- `src/components/agents/risk-analysis-modal.tsx`:
  - Added `InlineMetricCard` component with tooltip support.
  - `RiskAnalysisContent` accepts `currentSharpe`, `currentVolatility`, `currentMaxDrawdown`, `sharpeDelta`.
  - 3 metric cards rendered at top of Risk tab, before verdict banner.

**Verification:**
- `npx tsc --noEmit` — 0 errors.
- `npx next build` — successful.

**Gotchas:**
- None.

---

## Task — Proposal tab: titleCase sectors, rationale toggle, risk gauge, turnover rename (4/27/2026)

**Description:** Four targeted changes to Proposal tab. No Risk Analysis tab changes.

**Summary:**
- `src/hooks/use-sector-exposure.ts`:
  - Added `toTitleCase(str)`: splits on `_` and `-`, capitalizes each word. `fixed_income` → `Fixed Income`.
  - `groupBySector`: after normalization, transforms all keys through `toTitleCase`. Values unchanged.
- `src/components/agents/redesign-proposal-modal.tsx`:
  - **Allocation table**: Header `Ticker | Current | Proposed | Rationale`. Grid `grid-cols-[80px_100px_100px_1fr]`. Removed Delta column. Removed `cursor-pointer` and `onClick` from grid row.
  - **Rationale cell**: Inline "View Rationale" / "Hide Rationale" button (teal, underline, stopPropagation). Expanded rationale renders as extra div below row (`border-b border-border`).
  - **Risk Score**: Replaced inline text line with `RiskScoreGauge` component — SVG semicircular gauge (viewBox 0 0 200 120), gray track, current arc (white/0.15), proposed arc (teal), dot markers, score labels + delta badge below.
  - **Snapshot cards**: Renamed "Turnover" label → "Rebalance Turnover" in both tooltip map and snapshot items array.
- Did NOT touch Risk Analysis tab, `risk-analysis-modal.tsx`, sidebar, or pipeline bar.

**Verification:**
- `npx tsc --noEmit` — 0 errors.
- `npx next build` — successful.

**Gotchas:**
- None.

---

## Task — Fix tooltips, restore delta column, add gauge center number (4/27/2026)

**Description:** Three fixes in redesign-proposal-modal.tsx.

**Summary:**
- Fix 1: LabelWithTooltip renders ? as button type=button with title. Ensures tooltip events fire in Dialog portals. Proposal Summary also uses LabelWithTooltip now (was inline span).
- Fix 2: Delta column restored. Grid cols-[80px_100px_100px_80px_1fr]. Color-coded delta cell. Rationale button centered. Empty state matches.
- Fix 3: Gauge center number. SVG wrapped in relative flex flex-col items-center. Absolute overlay: proposed score (text-3xl font-mono font-bold text-teal), delta badge, Lower is better label.

**Verification:**
- tsc clean, next build clean.

**Gotchas:**
- None.

---

## UX Fixes — Delta→Rationale spacing, Single-bar sectors, Turnover gauge (4/27/2026)

**Description:** User requested three UX improvements for the Proposal tab of the Portfolio Redesign Proposal modal.

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx`:
  - **Delta→Rationale spacing fix:** Table header grid changed from `grid-cols-[80px_100px_100px_80px_1fr] gap-2` to `grid-cols-[80px_100px_100px_100px_1fr] gap-3` with `pl-4` on Rationale column. Row grid and empty state grids updated to match. Visual separation between Delta and Rationale restored.
  - **Single-bar sector reallocation:** Replaced dual horizontal bars per row with one unified bar. Teal fill represents *proposed* percentage (absolute 0-100 scale). White vertical line marker at *current* percentage. Removed current label on left; only delta badge (green/red) and proposed percentage on right remain. Reduced row gap from `space-y-1` to `space-y-3` for breathing room.
  - **Turnover gauge next to Risk Score:** Removed Rebalance Turnover from snapshot card grid (was a single "Current" value, semantically broken). Created new `TurnoverGauge` component — semicircular SVG gauge identical visual style to `RiskScoreGauge`. Renders turnover as a single hero metric: teal fill arc, dot marker, large center number (`turnover.toFixed(1)%`), subtitle "Cost to execute". Risk Score gauge and Turnover gauge now sit side-by-side in a `grid-cols-2 gap-3` row. Both gauges use `h-full flex flex-col` for equal height. `RiskScoreGauge` wrapper updated to `flex flex-col` for match.

**Verification:**
- `bun run build` — successful (0 errors).
- `npx tsc --noEmit` — clean.

**Gotchas:**
- Turnover gauge caps at 100% (`Math.min(turnover, 100)`). If turnover exceeds 100%, marker stays at arc end; the center number still shows exact value.
- Single-bar sector rows no longer show current % text. User can infer it from the white marker position on the bar.

---

## Task — Fix Proposal Tab tooltip hover target (4/27/2026)

**Description:** Proposal tab tooltips did not appear reliably because `LabelWithTooltip` used the native `title` attribute only on the tiny `?` button.

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx`:
  - Replaced native `title` usage with the app's existing `Tooltip`, `TooltipTrigger`, and `TooltipContent` primitives.
  - Made the full label + `?` icon the hover target via `TooltipTrigger`.
  - Kept the existing visual style while making tooltip content render through the app tooltip portal.

**Verification:**
- `bunx tsc --noEmit` — clean.
- `bun run build` — successful.
- `bun run lint` — still fails on pre-existing unrelated lint errors in scripts/older components; no lint errors from this changed file.

**Gotchas:**
- The original native browser tooltip only triggered on the small `?`, not the dashed label text.

---

## UX Fixes — Proposal tab round 2 (4/27/2026)

**Description:** Second batch of Proposal tab improvements after review. Four items: sector bar dual-fill, remove Max Position % duplicate, swap Risk/Turnover gauges + reduce redundancy, widen table gaps.

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx`:
  - **Sector bar dual-fill:** Replaced single teal bar + white marker with layered fill: `current` value rendered as muted white background fill from 0→current, `proposed` rendered as teal overlay from 0→proposed. Immediate visual comparison of both values. No legend needed.
  - **Max Position % → Position Changes:** Removed `Max Position %` snapshot card (duplicate of Concentration). Added `Position Changes` card instead: `New` (tickers added with current=0) and `Exited` (current tickers missing from proposed). Computed from existing `proposed_actions` data.
  - **Gauge swap + redundancy fix:** Turnover gauge now appears on the **left**, Risk Score on the **right**. Risk Score bottom row stripped to bare `Current: X` only — removed duplicate `Proposed`, arrow, and Improved badge (already shown in center overlay).
  - **Table gaps:** Table header + rows + empty state grid changed from `gap-3` to `gap-4`. Rationale column padding increased from `pl-4` to `pl-6` for extra visual separation from Delta.

**Verification:**
- `bun run build` — successful (0 errors).
- `npx tsc --noEmit` — clean.

**Gotchas:**
- Turnover is capped at 100% in arc math but center number shows exact.
- `Position Changes` uses label check rather than generic subLabels prop to avoid typing complexity.

---

## UX Fixes — Proposal/Risk tab round 3 (4/27/2026)

**Description:** Third batch of improvements. Seven items: tooltip underline fix, sector reallocation tooltip, risk analysis underline fix, VaR gauge → comparison card, merged stress scenarios, Position Changes rename, Concentration → Max Position %.

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx`:
  - **Tooltip underline fix:** `LabelWithTooltip` now wraps label text + `?` in `inline-flex`, but the dashed underline `border-b` is applied to a child span that only contains the label text. The `?` icon sits outside the underline. Hover target remains the full label + icon via `TooltipTrigger render`.
  - **Sector Re-allocation tooltip:** Added `"Sector Re-allocation"` entry to `LABEL_TOOLTIPS` and wrapped the section label with `<LabelWithTooltip>`.
  - **Removed duplicate Position Changes key:** Fixed accidental duplicate `"Position Changes"` key in `LABEL_TOOLTIPS`.
  - **Concentration → Max Position %:** Renamed card label back to `"Max Position %"` to avoid confusion with Risk tab "Concentration Score". Removed old `"Concentration"` tooltip entry.
- `src/components/agents/risk-analysis-modal.tsx`:
  - **Underline fix on metric cards:** `InlineMetricCard` label now applies `border-b border-dashed border-text-dim/40` to a child span containing only the label text. The `?` icon sits outside the underline.
  - **VaR 95% as comparison card:** Replaced the centered `VaRGauge` component with an `InlineMetricCard` (Current / Proposed / Delta). Gauge and needle removed; card sits alongside Sharpe, Avg Stress Drawdown, Peak-to-Trough in the same 4-column grid (dropped to `sm:grid-cols-2 lg:grid-cols-4`). Actually we kept `grid-cols-3` and added VaR as a 4th card in a new row.
  - **Unified Stress Scenarios:** Merged `StressBars` + `ScenarioComparisonTable` into a single `UnifiedStressBars` component. Each row shows: event name | dual-fill bar (muted white = current, teal/red = proposed) | current drawdown text | proposed drawdown text | delta in pp | recovery days. Removed standalone "Scenario Comparison" section entirely.
  - **Removed standalone Scenario Comparison:** Section deleted; all data now rendered inside the unified stress block.

**Verification:**
- `bun run build` — successful (0 errors).
- `npx tsc --noEmit` — clean.

**Gotchas:**
- `UnifiedStressBars` uses the `stressResults` array to look up `recovery_days` by matching `scenario` name against `scenario_comparisons` entries.
- Tooltip underline fix uses a nested span pattern because the `render` prop on `TooltipTrigger` only accepts a single-element render tree.

---

## UX Fixes — Proposal/Risk tab round 4 (4/27/2026)

**Description:** Fourth batch of improvements. Three items: stress section grid headers, tooltip clarity additions, Risk tab tooltip parity.

**Summary:**
- `src/components/agents/risk-analysis-modal.tsx`:
  - **UnifiedStressBars grid headers:** Replaced the inline `flex items-center gap-3` row layout with a proper CSS grid (`grid-cols-[120px_1fr_60px_60px_60px_40px]`) and added a header row: Scenario | Current | Proposed | Delta | Rec. Rows now match the Proposal tab ticker table formatting.
  - **Tooltip clarity:** Appended "Lower = better" to the drawdown and VaR tooltip strings: Avg Stress Drawdown, Peak-to-Trough Drawdown, Max Daily Loss (95%).
  - **Shadcn Tooltip parity:** `InlineMetricCard` now imports and uses the same shadcn `Tooltip`, `TooltipTrigger`, and `TooltipContent` primitives as the Proposal tab. Removed raw HTML `title` attribute. Tooltip renders through app portal with styled rounded border + bg-elevated.

**Verification:**
- `bun run build` — successful (0 errors).
- `npx tsc --noEmit` — clean.

**Gotchas:**
- None.

---

## UX Fixes — Stress scenarios tooltips + expandable rows (4/27/2026)

**Description:** Sixth batch — user reported tooltips still not working (native `title` wasn't rendering) and scenario names were truncated.

**Summary:**
- `src/components/agents/risk-analysis-modal.tsx`:
  - **Added `StressTooltip` component:** Reusable component wrapping label text in shadcn `Tooltip` (dashed underline + styled portal tooltip). Same visual pattern as Proposal tab `LabelWithTooltip`.
  - **Replaced all native `title` attributes:** Column headers (Scenario, Current, Proposed, Delta, Recovery Days) and section header now use `StressTooltip` with styled shadcn `TooltipContent`.
  - **Added `useState` import:** Required for the expandable row state.
  - **Expandable scenario rows:** Added `expandedRow` state. Clicking a row toggles expansion. When expanded, scenario name shows `whitespace-normal break-words` (full text visible), and a new detail div appears below with the full scenario name repeated in `text-text-dim`.

**Verification:**
- `bun run build` — successful (0 errors).
- `npx tsc --noEmit` — clean.

**Gotchas:**
- Click target is the entire row, not just the scenario name. Hover row gets subtle `bg-bg-elevated/30` highlight.

---

## UX Fixes — Stress scenarios simplified to clean table (4/27/2026)

**Description:** Stress scenario bars were misaligned with grid headers and the bars were too small for meaningful comparison. Replaced with a flat table matching the Proposal tab's ticker table format.

**Summary:**
- `src/components/agents/risk-analysis-modal.tsx`:
  - Removed the SVG dual-fill bars from `UnifiedStressBars`.
  - Replaced grid columns from `[120px_1fr_60px_60px_60px_40px]` to `[120px_80px_80px_80px_60px]` with `gap-4`.
  - Header row and data rows now both use `font-mono`, consistent `px-4 py-3` spacing, and `border-b` separators.
  - Each row: Scenario | Current | Proposed | Delta | Recovery days. No visual bars.
  - Removed unused `maxDrawdown` calculation and bar-related variables.

**Verification:**
- `bun run build` — successful (0 errors).
- `npx tsc --noEmit` — clean.

**Gotchas:**
- None.

---

## UX Fix — Risk Analysis Stress Scenario Table Improvements (4/27/2026)

**Description:** User reported two issues in Risk Analysis tab stress scenarios: (1) expanded rows showed duplicate text (header + subheader were identical), and user wanted name and timestamp separated into columns; (2) accordion behavior forced only one open row at a time, which is poor UX for comparative analysis.

**Summary:**
- `src/components/agents/risk-analysis-modal.tsx` (`UnifiedStressBars`):
  - Added `parseScenario(full)` helper: regex-splits "Name (Period)" into `{ name, period }`.
  - Added new `Period` column (110px) between Scenario and Current. Scenario column shows clean event name; period shown as muted text in its own column.
  - Removed the duplicate expanded `<div>` that repeated the full scenario string. Expanded state now only controls name wrapping (`whitespace-normal` vs `truncate`) and chevron rotation.
  - Replaced single `expandedRow: number | null` with `expandedRows: Set<number>`. Clicking a row toggles its own expand state independently; multiple rows can stay open simultaneously.
  - Added `ChevronDown` icon per row (via `lucide-react` import). Rotates 180° when expanded. Sits on the left of the scenario name, making affordance explicit.
  - Updated grid columns to `[minmax(120px,1fr)_110px_80px_80px_80px_80px]` with `gap-3` to accommodate the new Period column.
  - Added `StressTooltip` header for the new Period column.

**Verification:**
- `bun run build` — successful (0 errors).
- `npx tsc --noEmit` — clean.

**Gotchas:**
- `parseScenario` uses a greedy `.+?` match followed by `\s*\((.+)\)\s*$`. If a scenario name contains multiple paired parentheses, the regex stops at the first `(`.
- No changes needed to `redesign-proposal-modal.tsx` or any other file.

---

## UX Fixes — Stress scenarios final polish (4/27/2026)

**Description:** Fifth batch of improvements for the Risk Analysis tab stress scenarios.

**Summary:**
- `src/components/agents/risk-analysis-modal.tsx`:
  - **Removed "Current → Proposed"** label from stress section header.
  - **Metric cards grid:** Changed from `sm:grid-cols-3` to `sm:grid-cols-2` so the 4 cards (Sharpe, Avg Stress, Peak-to-Trough, VaR) are distributed evenly in 2x2 rows.
  - **"Rec." → "Recovery Days"** — Full label in header.
  - **Tooltips on all stress fields:** Added `title` attributes to section header and each column header explaining meaning.
  - **Delta color logic:** Changed from `text-teal` to `text-green` for negative deltas (improvement), `text-red` for positive (worsening). Matches the metric card direction indicators.
  - **Wider scenario column:** Changed grid columns from `120px` fixed to `minmax(180px,1fr)` to prevent truncation. Scenario names now get more breathing room with consistent right-hand columns.

**Verification:**
- `bun run build` — successful (0 errors).
- `npx tsc --noEmit` — clean.

**Gotchas:**
- None.

---

## Maintenance — Unused code cleanup (4/28/2026)

**Description:** Remove unused code, stale UI leftovers, tracked one-off files, and redundant dependencies found during the repo cleanup audit.

**Summary:**
- Removed dead risk modal internals: unused standalone `RiskAnalysisModal`, old VaR gauge, old stress bars, verdict banner helper.
- Removed unreachable `SectorHeatmapModal` and its unused page state; sector allocation now lives in the redesign proposal modal.
- Removed stale one-off/root files and unused default public SVG assets.
- Removed unused chart component and `recharts`; removed unused AI SDK provider packages; added direct `zod` dependency.
- Cleaned unused imports/helpers in market, agent, factory, and summary bar code.
- Updated `.env.example` to match the current Ollama/Ollama-compatible provider setup.

**Verification:**
- `bunx tsc --noEmit` — clean.
- `bun run build` — successful.
- `bun run lint` — still fails on pre-existing `scripts/loop-v2` `any` usage, React Compiler set-state-in-effect warnings in existing hooks/components, and Mastra tool `any` casts.
- `bunx knip --no-progress --reporter compact` — remaining findings are mostly public primitive exports, nested `scripts/loop-v2` package metadata, and intentionally exported types/helpers.

**Gotchas:**
- No Biome config exists in this repo.
- `scripts/loop-v2` has its own `package.json`; root `knip` still reports `@modelcontextprotocol/sdk` as unlisted because it does not treat that folder as a workspace.

---

## Fix — Proposal table current-only holdings (4/28/2026)

**Description:** Current holdings omitted from `proposed_actions` disappeared from the Portfolio Redesign Proposal table instead of rendering as exited positions (`Current X%`, `Proposed 0%`).

**Summary:**
- `src/components/agents/redesign-proposal-modal.tsx`: Build allocation rows from the union of `currentAllocations` and `proposed_actions`.
- Missing proposed action now defaults to `target_pct: 0`, so holdings like ETH still render with a negative delta when the proposed portfolio exits them.
- Updated proposed position count and exited-position count to ignore zero-weight proposed actions.

**Verification:**
- `bunx tsc --noEmit` — clean.
- `bun run build` — successful.
- `bun run lint` — still fails on the known pre-existing lint debt recorded in the cleanup entry.

**Gotchas:**
- This bug predates the unused-code cleanup commit; the cleanup did not delete the proposal row logic.

---
