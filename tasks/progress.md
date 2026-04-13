# Progress Log

This file is updated after every completed task. Builder and reviewer both read this before starting.

---

## Critical Conventions & Gotchas

- **Package manager:** `bun` — use `bun run <script>`, `bunx`, never `npm`
- **Next.js:** Breaking-changes version — read `node_modules/next/dist/docs/` before any route/page code
- **DB:** Drizzle ORM + Postgres. Local dev via Docker (`docker-compose.yml`). Config in `drizzle.config.ts`
- **Arch/design refs:** `architecture/ARCHITECTURE_V1.md` + `architecture/VISUAL_DESIGN_V1.md` — check both before every task
- **Shared types:** `src/lib/types/visual.ts` — `HealthState`, `AssetClass`, `AgentStatus`. Do not duplicate elsewhere
- **CSS tokens:** All colors use CSS custom properties (`--green`, `--amber`, `--red`, `--bg-card`, etc.) from `globals.css`. Never hardcode hex
- **Formatters:** Centralised in `src/lib/format.ts` — use these, do not inline format logic in components
- **AssetClass:** Single source of truth — check `src/lib/types/visual.ts` before adding new asset class references
- **Animations:** All `@keyframes` in `src/styles/animations.css`. `edge-flow` and `dot-pulse` registered in Tailwind v4 theme. `prefers-reduced-motion` suppresses all of them
- **Market routing:** Unified in `src/lib/market/index.ts` — auto-detects provider (CoinGecko for crypto, Yahoo for equities). Ticker case normalized internally. Never call yahoo/coingecko wrappers directly from routes
- **React Flow:** Using `@xyflow/react`. Custom nodes/edges registered on the `<ReactFlow>` component. Edge markers and CSS tokens must be set explicitly — React Flow does not inherit CSS vars automatically
- **Dagre layout:** `src/components/factory/layout-engine.ts` — left-to-right, nodesep 60, ranksep 200
- **Floating point display:** `-0.0%` bug fixed — use `formatPercent()` from `src/lib/format.ts` which handles this case

---

## Completed Tasks

### Phase 1.1 — Project Scaffolding (all done)
- Next.js 16 + Bun + TypeScript + App Router + Tailwind CSS initialized
- shadcn/ui initialized with dark theme defaults
- Deps installed: `@xyflow/react`, `@dagrejs/dagre`, `drizzle-orm`, `drizzle-kit`, `postgres`, `yahoo-finance2`, `recharts`

### Phase 1.2 — Theme & Styling (all done)
- Tailwind extended with full color token set, Inter + JetBrains Mono, 8px border radius
- `globals.css`: full dark palette in `:root` CSS custom properties
- `src/styles/animations.css`: all `@keyframes` (pulse-green/amber/red, dot-pulse, cursor-blink, edge-flow, fade-in-up)
- `prefers-reduced-motion` suppression in `globals.css`
- Font loading in `src/app/layout.tsx` via `next/font/google`
- `src/lib/types/visual.ts`: `HealthState`, `AssetClass`, `AgentStatus`

### Phase 1.3 — Database (all done)
- Drizzle schema: `src/lib/db/schema.ts` — `holdings`, `market_snapshots`, `agent_runs` tables
- `drizzle.config.ts` pointing to `DATABASE_URL`
- Initial migration generated and applied
- Local Postgres running via Docker

### Phase 1.4 — Holdings API (all done)
- `POST /api/portfolio/holdings` — add holding; `createHoldingSchema` validates quantity/avgCost with `isNaN` check
- `GET /api/portfolio/holdings` — fetch all with live prices via yahoo-finance2
- `DELETE /api/portfolio/holdings/[id]` — remove by UUID

### Phase 1.5 — Market Data (all done)
- `src/lib/market/yahoo.ts` — price snapshot + historical OHLCV via `yahoo-finance2` `.chart()` method
- `src/lib/market/coingecko.ts` — price snapshot + OHLCV via CoinGecko `market_chart` endpoint (numeric mode); fetch timeout added; handles free tier (no key)
- `src/lib/market/index.ts` — unified `getPrice(ticker)` / `getHistory(ticker)`; auto-detects provider; normalizes ticker case; uses `allSettled` for batch; Zod validation on outputs; single `AssetClass` source
- `GET /api/market/snapshot/[ticker]` — live price, optional `assetClass` query param
- `GET /api/market/historical/[ticker]` — OHLCV history

### Phase 1.6 — UI Primitives (all done)
- `<StatusDot />` — health dot with glow; uses `dot-pulse` opacity animation registered in Tailwind v4 theme
- `<MetricDisplay />` — label/value pair with color variants
- `<VolatilityBar />` — inline bar with filled/unfilled segments and label

### Phase 1.7 — React Flow Components (all done — up to 1.7.6)
- `<MachineNode />` — custom React Flow node; health border color from `HealthState`; includes `<MetricDisplay>`, `<VolatilityBar>`, `<StatusDot>`. Review fix: topology-based props, CSS tokens, shared constants extracted
- `<ConveyorEdge />` — custom React Flow edge; dashed stroke; correlation-based color (`--teal`/`--amber`/`--red`) and width (1.5/2.5/3.5px); custom SVG markers; `edge-flow` `stroke-dashoffset` animation (deferred full enable to Phase 3). Review fix: seamless dash pattern, marker sizing, CSS token usage
- `<PortfolioOutputNode />` — aggregate output node; accent border; inline SVG hexagon icon
- `<PortfolioSummaryBar />` — top metrics bar; hardcoded values; "+" button placeholder. Review fix: display bugs (floating-point -0.0% via `formatPercent()` from `src/lib/format.ts`)
- `src/components/factory/layout-engine.ts` — dagre auto-layout (LR, nodesep 60, ranksep 200)
- `<FactoryFloor />` — React Flow canvas; composes MachineNode + ConveyorEdge + PortfolioOutputNode; dot grid background; auto-layout applied on mount

---

### Phase 1.8 — Page Composition (in progress)
- **1.8.1** `src/app/page.tsx` wired: `"use client"` required (passes `onAddHolding` callback to summary bar); flex-col `h-screen overflow-hidden` layout; `<PortfolioSummaryBar />` at top (72px), flex row below with `<FactoryFloor />` (flex-[7]) and `<aside>` placeholder (flex-[3], min 340px, max 420px, border-left, bg-card); hardcoded prop values for now. Gotcha: page must be client component because `onAddHolding` is a function prop — can be refactored to a child client wrapper later if RSC is needed.

### Phase 1.8.2 — Visual alignment vs draft-v1-glm.html (done)
Code comparison against draft. Fixes applied:
- Summary bar: cell padding `px-3` → `px-5` (matches draft's `padding: 0 20px`)
- Summary bar Last Run cell: restructured to [label+value left / button right], health on a separate row below (matches draft layout)
- Output node width: `w-[220px]` → `w-[200px]` per spec
- Factory floor background dots: `var(--border)` → `rgba(255,255,255,0.03)` per draft
- Machine node name separator: `·` → `—` (em dash, per draft's `&mdash;`)
- Gotcha: pre-existing type error in `scripts/run-loop.ts` (`shell: true` — bool not assignable to string in ExecSyncOptions); fixed to pass shell path string

### Phase 1.8.3 — Build validation (done)
- `bun next build`: compiled successfully, TypeScript clean, all 5 routes generated (1 static, 4 dynamic)
- `bun next start`: server ready in 143ms on localhost:3000
- Gotcha: `memcache.go` credential errors in output are from a Kubernetes context in the shell environment — not app-related, safe to ignore

### Phase 2.1.1 — Mastra packages installed (done)
- `@mastra/core@1.24.1` + `@mastra/pg@1.9.0` added to `package.json` via `bun add`

### Phase 2.1.2 — Vercel AI SDK + providers installed (done)
- `ai@6.0.158`, `@ai-sdk/google@3.0.62`, `@ai-sdk/groq@3.0.35` installed via `bun add`
- Verified Mastra's built-in model router handles DeepSeek and OpenRouter natively via model strings (`'deepseek/deepseek-chat'`, `'openrouter/qwen/qwen3.6-plus'`) — no `@ai-sdk/openai` needed
- Mastra auto-reads `DEEPSEEK_API_KEY` and `OPENROUTER_API_KEY` from environment
- Build passes clean

### Phase 2.1 — Mastra & AI SDK setup (all done)
- **2.1.1** `@mastra/core@1.24.1` + `@mastra/pg@1.9.0` installed
- **2.1.2** `ai@6.0.158`, `@ai-sdk/google@3.0.62`, `@ai-sdk/groq@3.0.35` installed
- **2.1.3** `.env.example` committed with all API key placeholders (Google AI, Groq, OpenRouter, DeepSeek, Alpha Vantage, CoinGecko, NewsAPI, FRED) + `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `ORCHESTRATOR_TICK_INTERVAL_MS`. `.gitignore` updated with `!.env.example` exception
- **2.1.4** `src/lib/mastra.ts` — Mastra instance with `PostgresStore` using `DATABASE_URL`. Agents will inherit storage when registered

### Phase 2.2 — Monitor Agent (in progress)
- **2.2.1** `src/lib/agents/monitor.ts` — Monitor Agent with instructions (factory supervisor role), model fallback chain `[gemini-2.5-flash-lite → groq/llama-3.3-70b → openrouter/deepseek-chat:free]`, two tools: `getPortfolioSnapshot` (queries DB + live prices via `getBatchPrices`), `getHistoricalPerformance` (fetches OHLCV via `getHistory`). Registered in `src/lib/mastra.ts`. Gotcha: Mastra model fallbacks use array `[{ model, maxRetries }]` not `{ provider, fallbacks }`. Gotcha: `createTool` execute receives input directly, not `{ context }`. Gotcha: `OHLCVBar.date` is `Date` — convert to ISO string for Zod schema
- **2.2.2** `MonitorOutput` Zod schema: `health_status`, `portfolio_metrics`, `concerns`, `escalate`, `summary`
- **2.2.2a** Extended `MonitorOutput` with `asset_health: z.array(z.object({ ticker, health }))` for per-holding health in UI

### Phase 2.2.3 — Agent run API route (done)
- `POST /api/agents/run` — fetches holdings from DB, builds portfolio context with live prices via `getBatchPrices`, streams Monitor Agent output with structured output (`MonitorOutput` schema)
- Uses `mastra.getAgent("monitorAgent").stream()` + `toAISdkStream()` from `@mastra/ai-sdk` + `createUIMessageStream`/`createUIMessageStreamResponse` from `ai`
- Installed `@mastra/ai-sdk@1.3.3` for `toAISdkStream()` interop
- Returns 400 if no holdings in DB
- Gotcha: `@mastra/ai-sdk` vendors AI SDK v5 types internally; `ai@6.x` has different `UIMessageChunk` types. Used `value as UIMessageChunk` type assertion — structs are identical at runtime
- Gotcha: `toAISdkStream()` returns `ReadableStream` which isn't typed as `AsyncIterable` in strict TS. Used `getReader()`/`reader.read()` loop instead of `for await...of`
- Gotcha: Mastra `PostgresStore` throws `MASTRA_STORAGE_PG_CREATE_TABLE_FAILED` at build time when DB isn't reachable — non-blocking, route still compiles

### Phase 2.2.4 — Save agent run to DB (done)
- After stream completes, inserts a row into `agent_runs` with: `runId` (UUID), `agentName` ("monitor"), `input` (prompt + portfolio data), `output` (parsed JSON from accumulated text-delta chunks, falls back to `{ raw }` if parse fails), `reasoning` (full raw text), `tokensUsed` (null for now), `durationMs` (wall-clock from request start)
- Accumulates text via `text-delta` chunks in `value.delta` — AI SDK v6 uses `text-delta` not `text`
- DB insert runs inside `createUIMessageStream.execute` after stream loop finishes (guarantees all chunks collected)
- Build passes clean (MASTRA_STORAGE_PG_CREATE_TABLE_FAILED is known non-blocking)

### Phase 2.3 — Agent Reasoning UI (in progress)
- **2.3.1** `<AgentStep />` component created at `src/components/agents/agent-step.tsx`
  - Props: `name`, `status` (AgentStatus), `durationMs?`, `structuredOutput?`, `reasoning?`, `isStreaming?`
  - Status dot via `<StatusDot />`: done=green filled, running=amber filled+pulse, queued=hollow, error=red filled
  - Header row: agent name (Inter 13px) + status label (mono 11px, amber/red/dim) + duration badge (mono 11px, right-aligned)
  - Structured output block: key/value pairs in JetBrains Mono 12px (keys dim, values text color)
  - Collapsible reasoning via shadcn `<Collapsible />`: Inter 13px prose, bg-elevated bg, 2px border-bright left border, toggle shows "▸ Show / ▾ Hide reasoning"
  - Streaming cursor: 2px amber bar with `animate-cursor-blink` (step-end blink), shown both inside reasoning block and standalone when no reasoning yet
  - Installed shadcn `<Collapsible />` as prerequisite (`src/components/ui/collapsible.tsx`)
  - Build passes clean

### Phase 2.3.2 — AgentTimeline (done)
- `<AgentTimeline />` at `src/components/agents/agent-timeline.tsx`
- Accepts `steps: AgentStepData[]` (exported interface with same props as AgentStep)
- Renders each step via `<AgentStep />`, wrapped in a container
- Connector line: 1px `border-l border-border-bright` between dots, `ml-[3px]` to align with dot center (AgentStep dot column is 6px wide at `gap-3` offset, center = 3px)
- Last step: no connector below
- Dimming: steps after the currently running agent get `opacity-45` with `transition-opacity`
- No running agent found → nothing dimmed (all done/queued/error)
- Build passes clean

### Phase 2.3.3 — AgentReasoningPanel (done)
- `<AgentReasoningPanel />` at `src/components/agents/agent-reasoning-panel.tsx`
- Fixed-width right sidebar: `min-w-[340px] max-w-[420px] flex-[3]`, `border-l border-border bg-bg-card`
- Header: "Agent Reasoning" title (Inter 13px) + optional run ID badge (mono 10px, first 8 chars, `bg-bg-elevated` rounded pill) + collapse toggle placeholder (chevron-right SVG button, visual only — collapsed state deferred per V §6.2)
- Body: `<ScrollArea className="flex-1">` wrapping `<AgentTimeline />` with `p-4` padding
- Installed shadcn `<ScrollArea />` as prerequisite (`src/components/ui/scroll-area.tsx` — uses `@base-ui/react/scroll-area`)
- Wired into `src/app/page.tsx`: replaced placeholder `<aside>` with `<AgentReasoningPanel steps={PLACEHOLDER_STEPS} />` — 4 agent slots (Monitor, Bottleneck, Redesign, Risk) all with `status: "queued"`
- Removed `"use client"` explicit import since page already had it
- Build passes clean (known Mastra PG non-blocking error only)

### Phase 2.3 — Agent Reasoning UI (complete)

- **2.3.4** — Confirmed both `<Collapsible />` and `<ScrollArea />` already installed as prerequisites during 2.3.1 and 2.3.3. No new installs needed. Marked complete.

### Phase 2.4 — Live Data Wiring (in progress)

- **2.4.1** — Wire `<AgentReasoningPanel />` to consume `/api/agents/run` SSE stream (done)
  - Created `src/hooks/use-agent-run.ts` — custom hook that POSTs to the endpoint, reads SSE UI message stream, parses text-delta chunks into reasoning, parses final JSON as `MonitorOutput`
  - Hook exposes: `steps`, `runId`, `isRunning`, `error`, `monitorOutput`, `startRun()`
  - Modified `src/app/api/agents/run/route.ts` — sends `data-run-id` custom data part at stream start so client can display run ID badge
  - Updated `src/components/agents/agent-reasoning-panel.tsx` — accepts `isRunning`, `error`, `onRun` props; renders "▶ Run" button in header + error banner
  - Updated `src/app/page.tsx` — replaced hardcoded `PLACEHOLDER_STEPS` with `useAgentRun()` hook; passes all props to panel
  - SSE parsing: splits on `\n`, extracts `data: ` prefix, handles `text-delta` / `data-run-id` / `error` event types, skips `[DONE]`
  - On completion: builds flat `structuredOutput` summary (health, summary, concerns count, escalate) for the AgentStep display
  - Abort handling: AbortController ref cancels in-flight runs on re-trigger
  - Build passes clean (known Mastra PG non-blocking error only)

### Phase 2.4.2 — Machine node border colors from Monitor Agent health (done)

- `FactoryFloor` now accepts `assetHealth` (Record<string, HealthState>) and `globalHealth` (HealthState) props
- `page.tsx` derives `assetHealth` map from `monitorOutput.asset_health` (lowercase ticker keys) via `useMemo`
- Passes `globalHealth` from `monitorOutput.health_status` to `FactoryFloor`
- Inside `FactoryFloor`: `nodesWithHealth` useMemo overlays per-ticker health onto machine node data, and global health onto the portfolio output node
- `MachineNode` already uses `healthBorderMap[data.health]` for border color — no component changes needed, the data just flows in now
- `as typeof nodes` cast needed because spread + Record<string, unknown> widens the discriminated union type
- Removed unused `TICKER_TO_NODE_ID` constant (was dead code from initial scaffold — keeping for now as Phase 3 may need it for dynamic node creation)
- Build passes clean

### Phase 2.4.3 — PortfolioSummaryBar wired to Monitor output (done)

- `useAgentRun` hook: added `lastRunAt: Date | null` state, set to `new Date()` after successful stream completion
- `page.tsx`: replaced all hardcoded `PortfolioSummaryBar` props with values derived from `monitorOutput` via `useMemo`
  - `totalValue` ← `portfolio_metrics.total_value`
  - `unrealisedPnl` ← derived from `total_value` and `unrealised_pnl_pct` (PnL = value × pct / (100 + pct), rounded)
  - `unrealisedPnlPct` ← `portfolio_metrics.unrealised_pnl_pct`
  - `sharpeRatio` ← `portfolio_metrics.sharpe_ratio`
  - `maxDrawdownPct` ← `portfolio_metrics.max_drawdown_pct`
  - `health` ← `health_status`
  - `lastRunAt` ← from hook's new `lastRunAt` state
- When no monitor output: falls back to zeroed values with "nominal" health
- Build passes clean

## Next Task
**2.5.1** — End-to-end test: add holdings → trigger agent run → see Monitor output stream into panel → node borders update

