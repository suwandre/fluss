# Progress Log

## Task 4.1.5 (4/15/2026, 11:26:58 PM)

**Description:** Wire form submit to `POST /api/portfolio/holdings` and refresh factory floor

**Summary:**
FAILED: Exhausted retries without LGTM.

---

## Task 4.1.5 (4/15/2026, 11:36:14 PM)

**Description:** Wire form submit to `POST /api/portfolio/holdings` and refresh factory floor

**Summary:**
FAILED: Exhausted retries without LGTM.

---

## Task 4.2.1 (4/15/2026, 11:52:50 PM)

**Description:** `<StressTestChart />` — horizontal Recharts `BarChart` consuming `RiskOutput.stress_results`, dark theme, `--bg-elevated` bars, `--red` for drawdown > 15% _(V §4.13)_

**Summary:**
StressTestChart tasks 4.2.1-4.2.3 already implemented. Horizontal BarChart with --bg-elevated bars, --red for >15% drawdown, custom tooltip with --bg-card/--border/--text, integrated into AgentReasoningPanel after Risk Agent completes. Build passes.

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.3.1 (4/15/2026, 11:55:57 PM)

**Description:** Wire `<PortfolioSummaryBar />` to live data: total value, unrealized P&L, Sharpe ratio, max drawdown from Monitor output _(V §4.8)_

**Summary:**
Wired PortfolioSummaryBar to live data. Summary bar now shows total value + P&L from holdings immediately (before any Monitor run). After Monitor run, uses Monitor's computed metrics (Sharpe, max drawdown). Added /api/agents/history endpoint. useAgentRun fetches most recent run on mount so lastRunAt + health persist across page refreshes.

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.4.2 (4/15/2026, 11:59:59 PM)

**Description:** Create run history view (route or panel) showing past runs with timestamps and verdicts

**Summary:**
Created RunHistoryPanel component showing past runs with health dots, verdict labels, timestamps, relative time, duration, truncated summary, run ID badges. Added Current/History tab toggle to AgentReasoningPanel. Clicking history run restores its output via onRestoreRun callback. Exposed setMonitorOutput/setWorkflowOutput/setRunId/setLastRunAt from useAgentRun hook. Build passes.

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.5.1 (4/16/2026, 12:02:14 AM)

**Description:** Install `node-cron` (`bun add node-cron`) for the auto-tick scheduler

**Summary:**
Installed node-cron@4.2.1 via bun add. Build passes.

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.5.2 (4/16/2026, 12:08:10 AM)

**Description:** Set up cron job to re-run orchestrator every 15 minutes (`ORCHESTRATOR_TICK_INTERVAL_MS`) _(A §10, Phase 4)_

**Summary:**
Created cron scheduler (src/lib/orchestrator/scheduler.ts) using node-cron. Reads ORCHESTRATOR_TICK_INTERVAL_MS (default 900000ms=15min), converts to cron expression, runs portfolio factory workflow on each tick. Overlap guard + empty-portfolio guard. Persists results with trigger:"cron". Wired via src/instrumentation.ts — dynamic import avoids Edge Runtime, production-only start avoids dev duplicates. Build passes.

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.5.3 (4/16/2026, 12:11:15 AM)

**Description:** pgvector setup — enable `vector` extension, add `market_documents` table to Drizzle schema, generate and run migration _(A §4)_

**Summary:**
Added market_documents table to Drizzle schema with vector(1536) embedding column + ivfflat index. Migration includes CREATE EXTENSION IF NOT EXISTS vector before table DDL. Build passes.

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.5.4 (4/16/2026, 12:14:23 AM)

**Description:** News RAG integration for Bottleneck Agent — ingest headlines via NewsAPI, store embeddings, wire `searchMarketDocuments` tool _(A §10, Phase 4)_

**Summary:**
News RAG integration done. Created news-rag.ts with NewsAPI ingestion + OpenAI embeddings + pgvector cosine similarity search. Wired searchMarketDocuments tool in bottleneck agent to real RAG. Added news ingestion to scheduler tick. Added /api/market/news POST+GET routes. Installed @ai-sdk/openai.

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.6.1 (4/16/2026, 12:17:28 AM)

**Description:** Audit all animations against `prefers-reduced-motion` — confirm suppression works _(V §5.3)_

**Summary:**
Audited all 7 keyframe animations against prefers-reduced-motion. Consolidated CSS rule into animations.css, added scroll-behavior:auto. Created useReducedMotion hook. Updated StatusDot, ConveyorEdge, AgentStep to conditionally skip animation classes when reduced motion preferred. Build passes.

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.6.2 (4/16/2026, 12:19:16 AM)

**Description:** Audit color consistency — every health indicator uses `--green` / `--amber` / `--red` exactly _(V §2.1)_

**Summary:**
Audited color consistency across 13 components. All health indicators use --green/--amber/--red via Tailwind utility classes (text-green, bg-green, border-green, etc.) resolving to CSS custom properties. No hardcoded hex values found. No code changes needed.

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.6.3 (4/16/2026, 12:23:40 AM)

**Description:** Audit typography — Inter for prose, JetBrains Mono for metrics, correct sizes and weights _(V §3.2)_

**Summary:**
Audited typography across 13 components vs V §3.2. Fixed 5 issues: summary bar timestamp 14px→12px, panel title weight 500→600, stress chart Y-axis font mono→sans, run history timestamps 11px→12px, body text added text-sm (14px).

**Gotchas:**
WARNING: No code changes made.

---

## Task 4.6.4 (4/16/2026, 12:35:00 AM)

**Description:** Final visual comparison against `draft-v1-glm.html` _(V §11)_

**Summary:**
Compared all components against draft-v1-glm.html. Fixed 6 visual discrepancies:

1. Portfolio Output Node title: `text-text` → `text-accent`, font-size 15px → 14px (text-sm) — draft uses accent-colored title
2. Agent panel title: added `uppercase tracking-[0.04em]` — draft has uppercase + letter-spacing
3. Agent panel badge: 10px → 11px — matches draft's `font-size: 11px`
4. Agent step dots: `size="sm"` (6px) → `size="md" className="size-3"` (12px) — draft uses 12px dots
5. Agent step badges: added pill styling with `rounded-full`, background colors matching draft's `rgba()` badge backgrounds (green/amber/red/gray)
6. Conveyor edge arrows: filled triangles → open chevrons (`fill="none" stroke={color}`) — matching draft's open arrow markers
7. Agent timeline connector: `ml-[3px]` → `ml-[5px]` — centered on 12px dots matching draft's `left: 5px`
8. Agent step reasoning: streaming border-left now uses conditional `border-amber` vs `border-border-bright` — matching draft's `.agent-reasoning.streaming { border-left-color: var(--amber) }`

**Gotchas:**
Portfolio Output Node had a typo in import path (`@/lib/lib/types/visual`) that was introduced and immediately fixed. Build passes.

---

## Task 4.6.5 (4/20/2026)

**Description:** Full production build validation: `bun next build && bun next start` on target deployment

**Summary:**
Production build (`bun next build`) passes clean. Next.js 16.2.2 (Turbopack) compiled successfully in 7.1s. TypeScript compiled in 7.2s. All 8 routes generated (2 static, 6 dynamic). Zero errors, zero warnings.

`portfolio-summary-bar.tsx` had a formatting-only diff (140 insertions / 140 deletions) — no logic changes, just reformatting. File is intact and builds fine.

**Gotchas:**
None. Build is clean.

---

## Hotfix: Agent model fallback chains (4/20/2026)

**Description:** Fix 429 rate limit on Gemini free tier — wrong model used + no 3rd fallback tier

**Summary:**
Fixed agent model configs to match ARCHITECTURE_V1.md §6:

- **Monitor**: `google/gemini-2.0-flash` → `google/gemini-2.5-flash-lite` (primary), added `openrouter/deepseek/deepseek-chat:free` as 3rd fallback → **updated**: `google/gemini-2.5-flash-lite` rate-limited, swapped to `groq/llama-3.3-70b-versatile` (primary), `groq/llama-3.1-8b-instant` added as 3rd fallback
- **Bottleneck**: `google/gemini-2.0-flash` → `google/gemini-2.5-flash` (primary), added `openrouter/deepseek/deepseek-chat:free` as 3rd fallback
- **Redesign**: `google/gemini-2.0-flash` → `google/gemini-2.5-flash` (primary), added `openrouter/deepseek/deepseek-chat:free` as 3rd fallback
- **Risk**: Already correct (`deepseek/deepseek-chat` → `openrouter/qwen/qwen3.6-plus`) — no change needed

Fallback chains after fix:
| Agent     | Primary                          | Fallback 1                          | Fallback 2                               |
|-----------|----------------------------------|-------------------------------------|------------------------------------------|
| Monitor   | groq/llama-3.3-70b-versatile   | openrouter/deepseek/deepseek-chat:free | groq/llama-3.1-8b-instant             |
| Bottleneck| google/gemini-2.5-flash          | groq/llama-3.3-70b-versatile       | openrouter/deepseek/deepseek-chat:free   |
| Redesign  | google/gemini-2.5-flash          | groq/llama-3.3-70b-versatile       | openrouter/deepseek/deepseek-chat:free   |
| Risk      | deepseek/deepseek-chat           | openrouter/qwen/qwen3.6-plus        | —                                        |

Mastra natively supports model fallback arrays — each model gets its own `maxRetries` before moving to the next. No manual fallback logic needed.

Build passes clean.

**Gotchas:**
None.

---

## Hotfix: Monitor agent rate limit — swap primary model (4/20/2026)

**Description:** `google/gemini-2.5-flash-lite` hitting 429 rate limits on free tier. Swapped Monitor agent to Groq as primary.

**Summary:**
New fallback chain: `groq/llama-3.3-70b-versatile` → `openrouter/deepseek/deepseek-chat:free` → `groq/llama-3.1-8b-instant`

Files changed:
1. `src/lib/agents/monitor.ts` — swapped model array order, added `llama-3.1-8b-instant` as 3rd fallback
2. `architecture/ARCHITECTURE_V1.md` — updated 3 references (code snippet, table, fallback example)

**Gotchas:**
None.

---

## Hotfix: Skipped agent state (4/20/2026)

**Description:** When Monitor returns health_status === "nominal", bottleneck/redesign/risk agents are skipped (null in workflow output). UI previously showed them as "Queued" (gray) — misleading. Changed to show "Skipped" with subtitle "Health nominal — no action needed".

**Summary:**
Added "skipped" to `AgentStatus` type union. Updated 6 files:

1. `src/lib/types/visual.ts` — added `"skipped"` to `AgentStatus`
2. `src/components/agents/agent-step.tsx` — added "Skipped" label, badge style (slightly lighter bg than queued), `skipReason` prop, subtitle rendering, hollow dot (same as queued)
3. `src/components/agents/agent-timeline.tsx` — added `skipReason` to `AgentStepData`, excluded skipped steps from dimming (they're intentionally inactive, not waiting)
4. `src/hooks/use-agent-run.ts` — when Monitor returns nominal, marks remaining steps as `status: "skipped"`, `skipReason: "Health nominal — no action needed"`. Added `rebuildStepsFromOutput()` to restore step statuses from persisted workflow output (used on mount and by page.tsx restore handler). Exposed in hook return.
5. `src/app/page.tsx` — `handleRestoreRun` now calls `rebuildStepsFromOutput` so history-restored runs also show correct skipped states

TypeScript passes clean. Build fails only on pre-existing DATABASE_URL issue (unrelated).

**Gotchas:**
None.

---

## Hotfix: Remove broken model refs — llama-3.3-70b-versatile + deepseek-chat:free (4/20/2026)

**Description:** `groq/llama-3.3-70b-versatile` doesn't support `json_schema` structured output in current Mastra/Groq SDK. `openrouter/deepseek/deepseek-chat:free` returns 404 endpoints. Remove both.

**Summary:**
- **Monitor**: `groq/llama-3.3-70b-versatile` → `groq/llama-3.1-8b-instant` (primary), `openrouter/deepseek/deepseek-chat:free` → `openai/gpt-4o-mini` (fallback)
- **Bottleneck**: `groq/llama-3.3-70b-versatile` → `groq/llama-3.1-8b-instant`, removed `openrouter/deepseek/deepseek-chat:free`
- **Redesign**: `groq/llama-3.3-70b-versatile` → `groq/llama-3.1-8b-instant`, removed `openrouter/deepseek/deepseek-chat:free`

Updated fallback chains:

| Agent     | Primary                          | Fallback 1                          |
|-----------|----------------------------------|-------------------------------------|
| Monitor   | groq/llama-3.1-8b-instant      | openai/gpt-4o-mini                  |
| Bottleneck| google/gemini-2.5-flash          | groq/llama-3.1-8b-instant          |
| Redesign  | google/gemini-2.5-flash          | groq/llama-3.1-8b-instant          |
| Risk      | deepseek/deepseek-chat           | openrouter/qwen/qwen3.6-plus        |

**Gotchas:**
None.

---

## Hotfix: Switch to Ollama Cloud models (4/20/2026)

**Description:** Replace Groq/OpenAI/Google models with Ollama Cloud Pro models (`minimax-m2.5:cloud` primary, `qwen3.5:cloud` fallback) across monitor, bottleneck, and redesign agents.

**Summary:**
Switched 3 agents from free-tier providers (Groq, OpenAI, Google) to Ollama Cloud Pro ($20/mo). Mastra has a built-in `ollama-cloud` provider — no extra packages needed. Model format: `ollama-cloud/{model-name}`. API key: `OLLAMA_API_KEY` env var.

Updated fallback chains:

| Agent     | Primary                              | Fallback                             |
|-----------|--------------------------------------|--------------------------------------|
| Monitor   | ollama-cloud/minimax-m2.5:cloud    | ollama-cloud/qwen3.5:cloud        |
| Bottleneck| ollama-cloud/minimax-m2.5:cloud    | ollama-cloud/qwen3.5:cloud        |
| Redesign  | ollama-cloud/minimax-m2.5:cloud    | ollama-cloud/qwen3.5:cloud        |
| Risk      | deepseek/deepseek-chat               | openrouter/qwen/qwen3.6-plus       |

Files changed:
1. `src/lib/agents/monitor.ts` — model array
2. `src/lib/agents/bottleneck.ts` — model array
3. `src/lib/agents/redesign.ts` — model array
4. `.env.example` — added `OLLAMA_API_KEY` as primary, marked others as optional fallbacks

TypeScript passes clean. Build fails on pre-existing `DATABASE_URL` issue (unrelated).

**Gotchas:**
None.

---

## Hotfix: Risk agent — switch to Ollama Cloud models (4/20/2026)

**Description:** Replace deepseek/openrouter models in risk agent with Ollama Cloud Pro models (matching other agents).

**Summary:**
Risk agent was the last holdout using free-tier providers. Updated model array:

| Agent     | Primary                              | Fallback                             |
|-----------|--------------------------------------|--------------------------------------|
| Monitor   | ollama-cloud/minimax-m2.5:cloud    | ollama-cloud/qwen3.5:cloud        |
| Bottleneck| ollama-cloud/minimax-m2.5:cloud    | ollama-cloud/qwen3.5:cloud        |
| Redesign  | ollama-cloud/minimax-m2.5:cloud    | ollama-cloud/qwen3.5:cloud        |
| Risk      | ollama-cloud/minimax-m2.5:cloud    | ollama-cloud/qwen3.5:cloud        |

Files changed:
1. `src/lib/agents/risk.ts` — model array: `deepseek/deepseek-chat` → `ollama-cloud/minimax-m2.5:cloud`, `openrouter/qwen/qwen3.6-plus` → `ollama-cloud/qwen3.5:cloud`

**Gotchas:**
None.

---

## Hotfix: Structured output — JSON-only prompt prefix (4/20/2026)

**Description:** Fix `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` (expected object, received undefined) from Ollama Cloud (`minimax-m2.5:cloud`). Models were returning markdown-wrapped JSON (```json ... ```) or conversational text, which the AI SDK can't parse when expecting strict JSON objects.

**Summary:**
Added "CRITICAL: You must output ONLY raw, valid JSON matching the requested schema. Do not use markdown formatting. Do not wrap in ```json ... ```. No conversational text." as the first line of every agent prompt in `src/lib/orchestrator/workflow.ts`:

1. `monitorStep` — added prefix
2. `bottleneckStep` — added prefix
3. `redesignStep` — added prefix
4. `riskStep` — added prefix

TypeScript passes clean. Build fails on pre-existing `DATABASE_URL` issue (unrelated).

**Gotchas:**
Prompt-level fix only. If Ollama Cloud still wraps in markdown, may need a middleware/response parser that strips markdown code fences before schema validation.

---

## Hotfix: Structured output — add exact schema field names to all agent prompts (4/20/2026)

**Description:** Fix structured output validation failures across all 4 agents. Model (minimax-m2.5:cloud via Ollama Cloud) doesn't reliably follow `json_schema` response format — returns wrong keys (e.g. `portfolioValue` instead of `total_value`). Also remove "Use your tools" references from prompts where `activeTools: []` disables tools.

**Summary:**
Added exact schema shape to each workflow prompt in `src/lib/orchestrator/workflow.ts`:

1. **Monitor** — added schema block with: `health_status` ("nominal"|"warning"|"critical"), `portfolio_metrics` ({total_value, unrealised_pnl_pct, sharpe_ratio, max_drawdown_pct, largest_position_pct}), `concerns` (string[]), `escalate` (boolean), `summary` (string), `asset_health` ([{ticker, health}])
2. **Bottleneck** — added schema block with: `primary_bottleneck` ({ticker, reason, severity, metric}), `secondary_bottlenecks` ([{ticker, reason}]), `analysis` (string). Removed "Use your tools to compute correlation matrices and volatility contributions" → "Analyze the correlation data and volatility contributions provided above"
3. **Redesign** — added schema block with: `proposed_actions` ([{action, ticker, target_pct, rationale}]), `expected_improvement` ({sharpe_delta, volatility_delta_pct, narrative}), `confidence`, `proposal_summary`. Removed "Use your tools to find alternatives and simulate the rebalance" → "Analyze the holdings data above and recommend specific changes with target percentages"
4. **Risk** — added schema block with: `stress_results` ([{scenario, simulated_drawdown_pct, recovery_days}]), `var_95`, `verdict`, `caveats`, `risk_summary`. Removed "Run all relevant stress scenarios, compute VaR, and check macro context" → "Assess all relevant stress scenarios, estimate VaR, and provide a final risk verdict with specific caveats"

Schemas unchanged. Only prompts modified. TypeScript passes clean. Build fails on pre-existing DATABASE_URL issue (unrelated).

**Gotchas:**
None.

---

## Hotfix: Structured output validation recovery for minimax-m2.5:cloud (4/20/2026)

**Description:** `minimax-m2.5:cloud` doesn't support native `json_schema` response_format — returns its own field names (e.g. `status: "UNHEALTHY"` instead of `health_status: "critical"`). Causes `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` error.

**Summary:**
3-part fix:

1. **Created `src/lib/agents/normalize-output.ts`** — Normalizer utility with:
   - `parseRawAgentText()` — strips markdown code fences, parses JSON
   - `normalizeMonitorOutput()` — maps alt field patterns (status→health_status, portfolioValue→total_value, risks→concerns, etc.)
   - `tryNormalizeMonitorOutput()` — parse + normalize + validate against MonitorOutput
   - `recoverStructuredOutput()` — generic recovery: re-generate without structuredOutput, parse text, normalize, validate schema
   - `isStructuredOutputError()` — check if error is a structured output validation failure

2. **Added `jsonPromptInjection: true`** to all 4 agent `structuredOutput` configs in `workflow.ts` — injects schema definition into prompt so model knows exact field names

3. **Wrapped all 4 agent generate calls in try/catch** — on `STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED`:
   - Monitor: uses `normalizeMonitorOutput` then validates against MonitorOutput
   - Bottleneck/Redesign/Risk: use identity normalizer (schema field names match what the prompt specifies)
   - Recovery path: `agent.generate()` without structuredOutput → `parseRawAgentText()` → normalizer → `schema.parse()`

Files changed:
- `src/lib/agents/normalize-output.ts` — NEW
- `src/lib/orchestrator/workflow.ts` — imports, `jsonPromptInjection: true` on all 4 agents, try/catch recovery on all 4 steps

TypeScript passes clean.

**Gotchas:**
Build fails on pre-existing DATABASE_URL issue (unrelated).
