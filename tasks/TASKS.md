# Portfolio Factory — Task Breakdown

> Authoritative progress tracker for the full build.
> `- [ ]` = pending · `- [x]` = done · Cross-references: **A** = `ARCHITECTURE_V1.md` · **V** = `VISUAL_DESIGN_V1.md`

---

## Phase 1 — Foundation

### 1.1 Project scaffolding

- [x] **1.1.1** Initialize Next.js 16 project with Bun (`bun create next-app` — TypeScript, App Router, Tailwind CSS) _(A §10, Phase 1)_
- [x] **1.1.2** Install shadcn/ui (`bunx shadcn@latest init`) with dark theme defaults
- [x] **1.1.3** Install core dependencies: `@xyflow/react`, `@dagrejs/dagre`, `drizzle-orm`, `drizzle-kit`, `postgres` (PostgreSQL driver for Drizzle) _(A §2)_
- [x] **1.1.4** Install market data packages: `yahoo-finance2` _(A §2, §9)_
- [x] **1.1.5** Install Recharts: `recharts` _(A §2, V §4.13)_

### 1.2 Theme & styling foundation

- [ ] **1.2.1** Configure Tailwind: extend theme with color tokens (`--bg-primary`, `--bg-card`, `--green`, `--amber`, `--red`, etc.), font families (Inter, JetBrains Mono), border radius _(V §2.3, §2.4)_
- [ ] **1.2.2** Set up `globals.css`: CSS custom properties in `:root` matching the full palette _(V §2.4)_
- [ ] **1.2.3** Create `src/styles/animations.css` with all `@keyframes` definitions (pulse-green, pulse-amber, pulse-red, dot-pulse, cursor-blink, edge-flow, fade-in-up) _(V §5.2)_
- [ ] **1.2.4** Add `prefers-reduced-motion` media query in `globals.css` _(V §5.3)_
- [ ] **1.2.5** Configure font loading in `src/app/layout.tsx` — Inter + JetBrains Mono via `next/font/google` _(V §3.1)_
- [ ] **1.2.6** Create `src/lib/types/visual.ts` with shared types: `HealthState`, `AssetClass`, `AgentStatus` _(V §8)_

### 1.3 Database

- [ ] **1.3.1** Define Drizzle schema in `src/lib/db/schema.ts`: `holdings`, `market_snapshots`, `agent_runs` tables _(A §4)_
- [ ] **1.3.2** Create `drizzle.config.ts` pointing to `DATABASE_URL`
- [ ] **1.3.3** Generate initial migration (`bunx drizzle-kit generate`)
- [ ] **1.3.4** Set up PostgreSQL (local dev via Docker or Supabase/Railway free tier)
- [ ] **1.3.5** Run migrations (`bunx drizzle-kit push` or `migrate`)

### 1.4 API routes — Holdings CRUD

- [ ] **1.4.1** `POST /api/portfolio/holdings` — add a holding _(A §7)_
- [ ] **1.4.2** `GET /api/portfolio/holdings` — fetch all holdings with live prices _(A §7)_
- [ ] **1.4.3** `DELETE /api/portfolio/holdings/:id` — remove a holding _(A §7)_

### 1.5 Market data integration

- [ ] **1.5.1** Create `src/lib/market/yahoo.ts` — wrapper for `yahoo-finance2`: price snapshot, historical OHLCV _(A §9)_
- [ ] **1.5.2** Create `src/lib/market/coingecko.ts` — wrapper for CoinGecko API: real-time price, OHLCV _(A §9)_
- [ ] **1.5.3** Create `src/lib/market/index.ts` — unified `getPrice(ticker)`, `getHistory(ticker)` that routes to Yahoo or CoinGecko based on asset class
- [ ] **1.5.4** `GET /api/market/snapshot/:ticker` — live price for a single ticker _(A §7)_
- [ ] **1.5.5** `GET /api/market/historical/:ticker` — OHLCV history _(A §7)_

### 1.6 UI components — primitives

- [ ] **1.6.1** `<StatusDot />` — health indicator dot with glow and optional pulse animation _(V §4.10)_
- [ ] **1.6.2** `<MetricDisplay />` — label + value pair with color variants _(V §4.9)_
- [ ] **1.6.3** `<VolatilityBar />` — inline mini bar with filled/unfilled segments _(V §4.11)_

### 1.7 UI components — React Flow

- [ ] **1.7.1** `<MachineNode />` — custom React Flow node, static with hardcoded data matching spec layout _(V §4.1)_
- [ ] **1.7.2** `<ConveyorEdge />` — custom React Flow edge, static SVG with dashed stroke (no animation yet) _(V §4.2)_
- [ ] **1.7.3** `<PortfolioOutputNode />` — aggregate output node with accent border and inline SVG hexagon icon _(V §4.3)_
- [ ] **1.7.4** `<PortfolioSummaryBar />` — top metrics bar with hardcoded values, "+" button placeholder _(V §4.8)_
- [ ] **1.7.5** `src/components/factory/layout-engine.ts` — dagre auto-layout (left-to-right, nodesep 60, ranksep 200) _(V §7.3)_
- [ ] **1.7.6** `<FactoryFloor />` — React Flow canvas composing MachineNode, ConveyorEdge, PortfolioOutputNode with dot grid background _(V §4.4, §7.4, §7.5)_

### 1.8 Page composition & validation

- [ ] **1.8.1** Wire `src/app/page.tsx` — full layout: `<PortfolioSummaryBar />` (fixed top 72px), `<FactoryFloor />` (flex: 7), right sidebar placeholder (flex: 3, min 340px) _(V §6.1)_
- [ ] **1.8.2** Verify visual output against `draft-v1-glm.html`: node layout, health colors, edge rendering, summary bar _(V §11)_
- [ ] **1.8.3** Validate `bun next build && bun next start` works on target deployment _(A §10, Phase 1)_

---

## Phase 2 — First Agent

### 2.1 Mastra & AI SDK setup

- [ ] **2.1.1** Install Mastra packages: `@mastra/core`, `@mastra/pg` _(A §10, Phase 2)_
- [ ] **2.1.2** Install Vercel AI SDK + providers: `ai`, `@ai-sdk/google`, `@ai-sdk/groq`. Also verify Mastra's built-in provider support for DeepSeek and OpenRouter — if needed, install `@ai-sdk/openai` (OpenAI-compatible base) and configure custom base URLs _(A §6)_
- [ ] **2.1.3** Set up all API keys in `.env.local`: Google AI Studio, Groq, OpenRouter, DeepSeek, CoinGecko (`COINGECKO_API_KEY` — optional, free tier works without key), NewsAPI (`NEWS_API_KEY` — used in Phase 4 RAG), Alpha Vantage (`ALPHA_VANTAGE_API_KEY`), FRED (`FRED_API_KEY`) _(A §12)_
- [ ] **2.1.4** Create `src/lib/mastra.ts` — Mastra instance with PostgreSQL memory store config

### 2.2 Monitor Agent

- [ ] **2.2.1** Create `src/lib/agents/monitor.ts` — Monitor Agent with instructions, model config (gemini-2.5-flash-lite + fallback), and tools (`getPortfolioSnapshot`, `getHistoricalPerformance`) _(A §5.1)_
- [ ] **2.2.2** Define `MonitorOutput` Zod schema: `health_status` (global), `portfolio_metrics`, `concerns`, `escalate`, `summary` _(A §5.1)_
- [ ] **2.2.2a** Extend `MonitorOutput` with `asset_health: z.array(z.object({ ticker, health }))` — the architecture schema only has a global health*status, but the UI needs per-holding health to color individual machine node borders *(V §4.1, §10 Phase 2)\_
- [ ] **2.2.3** Wire `/api/agents/run` to fetch holdings, run Monitor Agent via Mastra, stream output with `createUIMessageStreamResponse` _(A §7, §8 API routes)_
- [ ] **2.2.4** Save agent run to `agent_runs` table on completion

### 2.3 Agent reasoning UI

- [ ] **2.3.1** `<AgentStep />` — individual agent entry: status dot, name, duration badge, structured output block, collapsible reasoning, streaming cursor _(V §4.7)_
- [ ] **2.3.2** `<AgentTimeline />` — vertical timeline container with 4 agent step slots, connector lines, dimming for post-running steps _(V §4.6)_
- [ ] **2.3.3** `<AgentReasoningPanel />` — right sidebar with `<ScrollArea />`, header with run ID badge, collapse toggle placeholder (visual button only — collapsed ~48px icon-strip state is explicitly deferred per V §6.2) _(V §4.5)_
- [ ] **2.3.4** Install shadcn components used by agent panel: `<Collapsible />`, `<ScrollArea />`

### 2.4 Live data wiring

- [ ] **2.4.1** Wire `<AgentReasoningPanel />` to consume the `/api/agents/run` stream (Vercel AI SDK `useChat` or `useAsyncCompletion`) _(A §7)_
- [ ] **2.4.2** Machine node border colors reflect Monitor Agent's health verdict per holding _(V §10, Phase 2)_
- [ ] **2.4.3** `<PortfolioSummaryBar />` — wire total value, P&L, health indicator to Monitor output data _(V §4.8)_

### 2.5 Phase 2 validation

- [ ] **2.5.1** End-to-end test: add holdings → trigger agent run → see Monitor output stream into panel → node borders update

---

## Phase 3 — Full Agent Loop

### 3.0 Dependencies

- [ ] **3.0.1** Install `simple-statistics` (`bun add simple-statistics`) — used for correlation matrices, covariance, percentiles (VaR), and volatility calculations in agent tools

### 3.1 Bottleneck Agent

- [ ] **3.1.1** Create `src/lib/agents/bottleneck.ts` — Bottleneck Agent with tools (`getCorrelationMatrix`, `getVolatilityContribution`, `searchMarketDocuments`) _(A §5.2)_
- [ ] **3.1.2** Define `BottleneckOutput` Zod schema _(A §5.2)_
- [ ] **3.1.3** Implement `getCorrelationMatrix(tickers)` tool — compute rolling correlations from historical price data
- [ ] **3.1.4** Implement `getVolatilityContribution(ticker)` tool — marginal VaR contribution

### 3.2 Redesign Agent

- [ ] **3.2.1** Create `src/lib/agents/redesign.ts` — Redesign Agent with tools (`getAlternativeAssets`, `simulateRebalance`, `getRebalanceHistory`) _(A §5.3)_
- [ ] **3.2.2** Define `RedesignOutput` Zod schema _(A §5.3)_
- [ ] **3.2.3** Implement `simulateRebalance(currentHoldings, proposedChanges)` tool — what-if P&L calculation

### 3.3 Risk Agent

- [ ] **3.3.1** Create `src/lib/agents/risk.ts` — Risk Agent with tools (`runHistoricalStressTest`, `computeVar`, `getMacroContext`) _(A §5.4)_
- [ ] **3.3.2** Define `RiskOutput` Zod schema _(A §5.4)_
- [ ] **3.3.3** Implement `runHistoricalStressTest(holdings, scenario)` tool — fetch historical prices, simulate P&L for crypto and traditional scenarios _(A §5.4)_
- [ ] **3.3.4** Implement `computeVar(holdings, confidenceLevel)` tool — Value at Risk calculation

### 3.4 Workflow orchestration

- [ ] **3.4.1** Create `src/lib/orchestrator/workflow.ts` — Mastra workflow with all steps (fetchMarket → monitor → conditional branch → bottleneck → redesign → risk) _(A §7, Mastra Workflow)_
- [ ] **3.4.1a** Add a dedicated workflow step (after fetchMarket) that computes the full correlation matrix and passes it through the workflow context — the Bottleneck Agent's `getCorrelationMatrix` tool computes it internally but doesn't expose it in its output schema; the frontend needs the raw matrix to color/weight conveyor edges
- [ ] **3.4.2** Wire `/api/agents/run` to use the full workflow instead of Monitor only
- [ ] **3.4.3** All four agent steps stream sequentially into the panel — `<AgentTimeline />` shows full run progression _(V §10, Phase 3)_

### 3.5 React Flow live wiring

- [ ] **3.5.1** Enable edge flow animation on `<ConveyorEdge />` (`stroke-dashoffset` animation, 1.2s cycle) _(V §5.1, §10 Phase 3)_
- [ ] **3.5.2** Wire correlation colors to computed correlation matrix — edge stroke color (teal/amber/red) and stroke width (1.5/2.5/3.5px) _(V §2.2, §4.2)_
- [ ] **3.5.3** Render cross-correlation edges (between two machine nodes, not to output) at 50% opacity _(V §4.2)_

### 3.6 Agent memory

- [ ] **3.6.1** Configure Mastra memory (conversation + working memory via `@mastra/pg`) for each agent _(A §7, Mastra Workflow note)_
- [ ] **3.6.2** Verify agents can reference previous run context in their reasoning

### 3.7 Phase 3 validation

- [ ] **3.7.1** End-to-end test: trigger run → all 4 agents stream in order → Monitor says "warning" → Bottleneck identifies problem → Redesign proposes changes → Risk stress-tests → full output visible in panel + edges animate with correlation data

---

## Phase 4 — Polish & Observability

### 4.1 Holdings input modal

- [ ] **4.1.1** Install shadcn components: `<Dialog />`, `<Input />`, `<Select />`, `<Button />` _(V §9)_
- [ ] **4.1.2** `<HoldingsInput />` modal — form with Ticker, Quantity, Avg Cost, Asset Class fields _(V §4.12)_
- [ ] **4.1.3** Wire ticker validation on blur: call `/api/market/snapshot/:ticker`, show live price preview (green success / red error) _(V §4.12)_
- [ ] **4.1.4** Wire "+" button in `<PortfolioSummaryBar />` to open `<HoldingsInput />` _(V §4.8)_
- [ ] **4.1.5** Wire form submit to `POST /api/portfolio/holdings` and refresh factory floor

### 4.2 Stress test chart

- [ ] **4.2.1** `<StressTestChart />` — horizontal Recharts `BarChart` consuming `RiskOutput.stress_results`, dark theme, `--bg-elevated` bars, `--red` for drawdown > 15% _(V §4.13)_
- [ ] **4.2.2** Custom Recharts tooltip styled with `--bg-card`, `--border`, `--text` _(V §4.13)_
- [ ] **4.2.3** Integrate `<StressTestChart />` into the agent panel (shown after Risk Agent completes)

### 4.3 Portfolio summary bar — live metrics

- [ ] **4.3.1** Wire `<PortfolioSummaryBar />` to live data: total value, unrealized P&L, Sharpe ratio, max drawdown from Monitor output _(V §4.8)_
- [ ] **4.3.2** Wire "Last Run" timestamp and health indicator from most recent agent run _(V §4.8)_

### 4.4 Agent run history

- [ ] **4.4.1** `GET /api/agents/history` — fetch past agent run results with pagination _(A §10, Phase 4)_
- [ ] **4.4.2** Create run history view (route or panel) showing past runs with timestamps and verdicts

### 4.5 Auto-tick & background

- [ ] **4.5.1** Install `node-cron` (`bun add node-cron`) for the auto-tick scheduler
- [ ] **4.5.2** Set up cron job to re-run orchestrator every 15 minutes (`ORCHESTRATOR_TICK_INTERVAL_MS`) _(A §10, Phase 4)_
- [ ] **4.5.3** pgvector setup — enable `vector` extension, add `market_documents` table to Drizzle schema, generate and run migration _(A §4)_
- [ ] **4.5.4** News RAG integration for Bottleneck Agent — ingest headlines via NewsAPI, store embeddings, wire `searchMarketDocuments` tool _(A §10, Phase 4)_

### 4.6 Polish & final validation

- [ ] **4.6.1** Audit all animations against `prefers-reduced-motion` — confirm suppression works _(V §5.3)_
- [ ] **4.6.2** Audit color consistency — every health indicator uses `--green` / `--amber` / `--red` exactly _(V §2.1)_
- [ ] **4.6.3** Audit typography — Inter for prose, JetBrains Mono for metrics, correct sizes and weights _(V §3.2)_
- [ ] **4.6.4** Final visual comparison against `draft-v1-glm.html` _(V §11)_
- [ ] **4.6.5** Full production build validation: `bun next build && bun next start` on target deployment

---

_Total: ~70 tasks across 4 phases | Reference: ARCHITECTURE_V1.md + VISUAL_DESIGN_V1.md_
