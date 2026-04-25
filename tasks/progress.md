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