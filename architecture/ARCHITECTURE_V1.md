# Portfolio Factory — Architecture v1

> A multi-agent AI system that models an investment portfolio as a living factory floor.
> Capital flows through "machines" (asset classes), agents monitor and reason over the factory's health,
> and the UI surfaces their reasoning in real time.
> Built with **Next.js 16, Mastra, PostgreSQL, Vercel AI SDK, and Bun.**

---

## 1. Project Overview

### What It Is

The Portfolio Factory is a web application where a user connects their portfolio holdings (manually or via API),
and four specialised AI agents — Monitor, Bottleneck, Redesign, and Risk — continuously observe and reason over
the portfolio's health. Their outputs are streamed live into a factory-floor UI where assets are "machines"
and capital flows are "conveyor belts."

### Core Mental Model

```
Raw Capital (Cash)
     │
     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Equity ETF  │────▶│ Growth Layer │────▶│              │
│  Machine     │     │  Assembler   │     │   Portfolio  │
└──────────────┘     └──────────────┘     │   Output     │
┌──────────────┐     ┌──────────────┐     │   (Net P&L,  │
│  Bond        │────▶│ Stability    │────▶│   Sharpe,    │
│  Machine     │     │  Assembler   │     │   Drawdown)  │
└──────────────┘     └──────────────┘     │              │
┌──────────────┘                          │              │
│  Crypto      │─────────────────────────▶│              │
│  Machine     │                          └──────────────┘
└──────────────┘
```

Each "machine" (asset/asset class) has measurable properties:

- **Yield Rate** — expected return
- **Failure Frequency** — volatility (standard deviation)
- **Power Consumption** — fees + slippage
- **Output Quality** — Sharpe ratio contribution

Correlations between assets are conveyor belt dependencies — a correlated breakdown
propagates downstream. The agent layer makes these structural relationships visible and
provides natural-language reasoning over them.

---

## 2. Tech Stack

| Layer                       | Technology                               | Reason                                                                                                                     |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Runtime                     | **Bun**                                  | Faster installs, startup, native TS execution. No native addon deps in this project. Validated on Linux VPS.               |
| Package Manager             | **Bun** (`bun install`)                  | Drop-in npm replacement, dramatically faster                                                                               |
| Frontend Framework          | **Next.js 16** (App Router)              | SSR, streaming, React Flow integration                                                                                     |
| UI Library                  | Tailwind CSS + shadcn/ui                 | Fast, clean, dark mode ready                                                                                               |
| Factory Visualization       | React Flow                               | Node/edge graph, perfect for factory metaphor                                                                              |
| Charts                      | **Recharts**                             | React-native charting for stress test visualisation, time-series, bar charts. Minimal config.                              |
| Agent Framework             | **Mastra** (`@mastra/core`)              | TypeScript-native agent + workflow orchestration with conditional branching, built on Vercel AI SDK                        |
| Streaming                   | **Vercel AI SDK** (`ai` package)         | `useChat`, `streamText`, tool calling. Mastra is built on top of this — no adapter needed.                                 |
| LLM Provider                | **Multi-provider (free tier)**           | Google Gemini 2.5 Flash (primary), Groq + OpenRouter (fallbacks), DeepSeek (reasoning). **$0 total cost.**                 |
| ORM                         | **Drizzle ORM**                          | Type-safe DB access, schema-as-code, migration generation. Replaces raw SQL with fully typed queries.                      |
| Database                    | PostgreSQL (Supabase or Railway)         | Portfolio data, agent memory, run history                                                                                  |
| Vector Store                | pgvector (same Postgres)                 | Agent RAG over market news/reports                                                                                         |
| Market Data (Equities/ETFs) | Yahoo Finance (`yahoo-finance2`)         | Free, comprehensive, covers stocks/ETFs/crypto via `BTC-USD` tickers                                                       |
| Market Data (Crypto)        | **CoinGecko API**                        | Generous free tier with real-time/historical prices, OHLCV, on-chain data. Best crypto data API in 2026.                   |
| Fundamentals                | Alpha Vantage                            | Free tier: 25 calls/day                                                                                                    |
| Deployment                  | Railway ($5 free credit/mo) or Linux VPS | Railway covers hosting + DB with free credit. VPS (e.g. Hetzner CX11 ~€4/mo) for full control. No serverless timeout risk. |

### Why Mastra over LangGraph?

| Factor              | Mastra                                            | LangGraph.js                                         |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| Language            | TypeScript-native (not a Python port)             | Python-first, TS port lags behind                    |
| Vercel AI SDK       | Built on top of it — zero adapter overhead        | Requires `@ai-sdk/langchain` adapter                 |
| Workflow branching  | `.branch()`, `.parallel()`, `.dountil()`          | Manual graph construction with `addConditionalEdges` |
| Memory              | Built-in (conversation, working, semantic recall) | Manual `agent_memory` table                          |
| Developer tooling   | Mastra Studio — visual agent debugger             | LangSmith (separate product)                         |
| DX benchmark        | 94.2% task completion, 18h dev time (NextBuild)   | 87.4% task completion, 41h dev time                  |
| Production adoption | Replit, PayPal, Brex, SoftBank                    | Mature but Python-centric ecosystem                  |

### Why Bun over Node.js?

| Factor             | Assessment                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Package management | `bun install` is a drop-in, dramatically faster. Zero risk.                                  |
| Runtime on Linux   | App Router, Server Components, API Routes all work. Official `nextjs/adapter-bun` available. |
| Native addons      | This project has none (no bcrypt, no canvas). Main Bun blocker is avoided.                   |
| Windows dev        | Bun works for `bun install` and `bun run dev`. Full runtime validated on Linux VPS only.     |
| Cold starts        | ~3x faster than Node.js. Relevant for VPS auto-scaling.                                      |

**Validation step**: During Phase 1, confirm `bun next build && bun next start` works end-to-end on the target VPS before committing. Rollback to `node` is trivial (just change the runtime command).

---

## 3. System Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     NEXT.JS APP (Bun)                    │
│                                                         │
│  ┌──────────────────────┐   ┌─────────────────────────┐ │
│  │   Factory Floor UI   │   │   Agent Reasoning Panel │ │
│  │   (React Flow)       │   │   (Streamed via AI SDK) │ │
│  └──────────┬───────────┘   └────────────┬────────────┘ │
│             │                            │              │
│  ┌──────────▼────────────────────────────▼────────────┐ │
│  │              API Routes (Next.js)                   │ │
│  │  /api/agents/run   /api/portfolio   /api/market     │ │
│  └──────────┬─────────────────────────────────────────┘ │
└─────────────│───────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────┐
│              MASTRA AGENT ORCHESTRATOR                    │
│                                                         │
│   ┌─────────┐  ┌────────────┐  ┌──────────┐  ┌───────┐ │
│   │ Monitor │  │ Bottleneck │  │ Redesign │  │ Risk  │ │
│   │  Agent  │  │   Agent    │  │  Agent   │  │ Agent │ │
│   └────┬────┘  └─────┬──────┘  └────┬─────┘  └───┬───┘ │
│        │             │              │             │     │
│   ┌────▼─────────────▼──────────────▼─────────────▼───┐ │
│   │         Mastra Memory + PostgreSQL Storage         │ │
│   └────────────────────────────────────────────────────┘ │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                    EXTERNAL DATA LAYER                   │
│  Yahoo Finance API │ CoinGecko API │ Alpha Vantage API   │
└─────────────────────────────────────────────────────────┘
```

### Mastra Workflow Definition

The agent flow is defined as a Mastra **workflow** — a deterministic state machine with conditional branching:

```
START
  │
  ▼
[fetchMarketSnapshot]        ← Step: pulls live prices for all holdings
  │
  ▼
[monitorAgent]               ← Analyses current state, emits health_report
  │
  ├── health = "warning" ──▶ [bottleneckAgent]   ← Identifies which asset is dragging
  │                               │
  │                               ▼
  │                         [redesignAgent]       ← Proposes rebalancing actions
  │                               │
  │                               ▼
  │                         [riskAgent]           ← Stress-tests the proposal
  │                               │
  │                               ▼
  │                         [emitRecommendation]  ← Structured output to UI
  │
  └── health = "nominal" ──▶ [emitStatusUpdate]  ← Brief summary to UI
  │
  ▼
END (loop re-triggers on next tick)
```

---

## 4. Database Schema

The SQL below is the canonical schema. In code, this is managed via **Drizzle ORM** — schema is defined as TypeScript types, migrations are generated by `drizzle-kit generate`, and all DB queries are fully typed.

```sql
-- User's portfolio holdings
CREATE TABLE holdings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  ticker        TEXT NOT NULL,
  asset_class   TEXT NOT NULL,          -- 'equity', 'etf', 'crypto', 'bond', 'fx'
  quantity      NUMERIC NOT NULL,
  avg_cost      NUMERIC NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Live market snapshots (cached, refreshed every N minutes)
CREATE TABLE market_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL,
  price         NUMERIC NOT NULL,
  change_pct_1d NUMERIC,
  change_pct_7d NUMERIC,
  volume_24h    NUMERIC,
  market_cap    NUMERIC,
  fetched_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Agent run history (every time the orchestrator ticks)
CREATE TABLE agent_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        TEXT NOT NULL,          -- groups all agents in one tick
  agent_name    TEXT NOT NULL,          -- 'monitor', 'bottleneck', 'redesign', 'risk'
  input         JSONB NOT NULL,
  output        JSONB NOT NULL,
  reasoning     TEXT,
  tokens_used   INT,
  duration_ms   INT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- pgvector: news/report embeddings for RAG
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE market_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT,
  source        TEXT,                   -- 'news', 'report', 'earnings'
  content       TEXT NOT NULL,
  embedding     vector(1536),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON market_documents USING ivfflat (embedding vector_cosine_ops);
```

**Note**: Mastra has its own memory system (conversation history, working memory, semantic recall) managed via `@mastra/pg` or `@mastra/libsql`. The `agent_runs` table above is for the Portfolio Factory's domain-specific history. Mastra memory handles the agent-level context persistence.

---

## 5. The Four Agents

### 5.1 Monitor Agent

**Role:** The factory floor supervisor. Runs on every tick. Computes portfolio health metrics and decides whether to escalate to the other agents.

**Mastra definition:**

```typescript
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const monitorAgent = new Agent({
  id: "monitor",
  name: "Monitor Agent",
  instructions: `You are the Monitor Agent in a Portfolio Factory system. Your job is to observe the
current state of a portfolio and assess its health like a factory supervisor walking
the floor. You look for: concentration risk (any single asset > 30% of portfolio),
unusual drawdown (any asset down > 15% from cost basis), correlation clustering
(multiple assets moving identically — hidden single point of failure), and fee drag.

For crypto portfolios, evaluate sector diversification: Layer 1s (ETH, SOL),
Layer 2s (ARB, OP), DeFi (UNI, AAVE), infrastructure (LINK, GRT), and
cash/stablecoins (USDC) are distinct sectors. A portfolio of 10 altcoins with
no BTC or stablecoins has near-zero true diversification.

Be direct and specific. If something looks wrong, name it precisely.`,
  model: "groq/llama-3.3-70b-versatile",
  tools: {
    getPortfolioSnapshot: createTool({
      id: "get-portfolio-snapshot",
      description: "Fetch current holdings with live prices from DB",
      inputSchema: z.object({}),
      execute: async () => {
        /* ... */
      },
    }),
    getHistoricalPerformance: createTool({
      id: "get-historical-performance",
      description: "Pull price history for a ticker",
      inputSchema: z.object({ ticker: z.string(), days: z.number() }),
      execute: async ({ context }) => {
        /* ... */
      },
    }),
  },
});
```

**Output schema (structured output via Mastra):**

```typescript
const MonitorOutput = z.object({
  health_status: z.enum(["nominal", "warning", "critical"]),
  portfolio_metrics: z.object({
    total_value: z.number(),
    unrealised_pnl_pct: z.number(),
    sharpe_ratio: z.number().nullable(),
    max_drawdown_pct: z.number(),
    largest_position_pct: z.number(),
  }),
  concerns: z.array(z.string()),
  escalate: z.boolean(),
  summary: z.string(),
});
```

---

### 5.2 Bottleneck Agent

**Role:** Only runs if Monitor escalates. Identifies _which specific machine_ is limiting factory throughput.

**Tools:**

- `getCorrelationMatrix(tickers)` — computes rolling correlations
- `getVolatilityContribution(ticker)` — marginal VaR contribution
- `searchMarketDocuments(query)` — RAG over recent news

**Output schema:**

```typescript
const BottleneckOutput = z.object({
  primary_bottleneck: z.object({
    ticker: z.string(),
    reason: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    metric: z.string(),
  }),
  secondary_bottlenecks: z.array(
    z.object({
      ticker: z.string(),
      reason: z.string(),
    }),
  ),
  analysis: z.string(),
});
```

---

### 5.3 Redesign Agent

**Role:** Given the bottleneck report, proposes a concrete rebalancing action. Does NOT make trades — outputs a structured proposal with reasoning.

**Tools:**

- `getAlternativeAssets(assetClass, constraints)` — suggests replacement/complement assets
- `simulateRebalance(currentHoldings, proposedChanges)` — runs a what-if calculation
- `getRebalanceHistory()` — reads past proposals to avoid repeating

**Output schema:**

```typescript
const RedesignOutput = z.object({
  proposed_actions: z.array(
    z.object({
      action: z.enum(["reduce", "increase", "replace", "add", "remove"]),
      ticker: z.string(),
      target_pct: z.number(),
      rationale: z.string(),
    }),
  ),
  expected_improvement: z.object({
    sharpe_delta: z.number().nullable(),
    volatility_delta_pct: z.number().nullable(),
    narrative: z.string(),
  }),
  confidence: z.enum(["low", "medium", "high"]),
  proposal_summary: z.string(),
});
```

---

### 5.4 Risk Agent

**Role:** Stress-tests the Redesign Agent's proposal. Runs historical scenario analysis.

**Tools:**

- `runHistoricalStressTest(holdings, scenario)` — fetches historical prices, simulates P&L
- `computeVar(holdings, confidenceLevel)` — Value at Risk calculation
- `getMacroContext()` — current rates, VIX, yield curve shape from free APIs

**Crypto-native stress scenarios** (used when portfolio is crypto-only):

| Scenario            | Period              | What it tests                 |
| ------------------- | ------------------- | ----------------------------- |
| BTC Halving Rally   | Nov 2020 – Apr 2021 | Upside concentration risk     |
| May 2021 Crash      | May 12–19, 2021     | BTC -53% in a week            |
| Terra/LUNA Collapse | May 2022            | Contagion across DeFi         |
| FTX Collapse        | Nov 2022            | Exchange counterparty risk    |
| 2024 BTC ETF Rally  | Oct 2023 – Mar 2024 | BTC dominance surge, ALTs lag |

**Traditional stress scenarios** (used when portfolio includes equities/bonds):

| Scenario             | Period         | What it tests                          |
| -------------------- | -------------- | -------------------------------------- |
| COVID Crash          | Feb – Mar 2020 | Broad liquidity crisis                 |
| 2022 Rate Hike Cycle | Jan – Oct 2022 | Bond + equity simultaneous drawdown    |
| 2008 GFC             | Sep – Nov 2008 | Systemic risk across all asset classes |

**Output schema:**

```typescript
const RiskOutput = z.object({
  stress_results: z.array(
    z.object({
      scenario: z.string(),
      simulated_drawdown_pct: z.number(),
      recovery_days: z.number().nullable(),
    }),
  ),
  var_95: z.number(),
  verdict: z.enum(["approve", "approve_with_caveats", "reject"]),
  caveats: z.array(z.string()),
  risk_summary: z.string(),
});
```

---

## 6. LLM Strategy ($0 Cost)

All agents use **free-tier** LLM APIs. No credit card required for any provider.

### Provider Lineup

| Provider             | Models (free)                           | Rate Limit                     | Tool Calling | Structured Output |
| -------------------- | --------------------------------------- | ------------------------------ | ------------ | ----------------- |
| **Google AI Studio** | Gemini 2.5 Pro, Flash, Flash-Lite       | 5-15 RPM, 250K TPM, 1K req/day | Yes          | Yes (JSON mode)   |
| **Groq**             | Llama 3.3 70B, Llama 4 Scout, Qwen3 32B | 30-60 RPM, 1K req/day          | Yes          | Yes               |
| **OpenRouter**       | Qwen 3.6 Plus, DeepSeek R1, Llama 4     | 20 RPM, 50 req/day             | Yes (varies) | Yes (varies)      |
| **DeepSeek**         | DeepSeek V3, R1                         | No hard limit, 5M free tokens  | Yes          | Yes               |

All providers expose OpenAI-compatible APIs. Mastra supports them all natively via model strings like `'google/gemini-2.5-flash'`, `'groq/llama-3.3-70b-versatile'`, `'openrouter/qwen/qwen3.6-plus'`.

### Agent → Model Assignment

Agents are tiered by frequency and reasoning complexity:

| Agent                            | Primary Model                  | Fallback                       | Rationale                                      |
| -------------------------------- | ------------------------------ | ------------------------------ | ---------------------------------------------- |
| **Monitor** (every tick)         | `groq/llama-3.3-70b-versatile` | `openrouter/deepseek/deepseek-chat:free` | Runs most often — Groq rate limits are generous on free tier |
| **Bottleneck** (on escalation)   | `google/gemini-2.5-flash`      | `groq/llama-3.3-70b-versatile` | Good reasoning for correlation analysis        |
| **Redesign** (on escalation)     | `google/gemini-2.5-flash`      | `groq/llama-3.3-70b-versatile` | Tool calling + structured output for proposals |
| **Risk** (rare, heavy reasoning) | `deepseek/deepseek-chat`       | `openrouter/qwen/qwen3.6-plus` | Stress-test reasoning, runs infrequently       |

### Fallback Chain (Mastra)

Mastra supports model fallbacks natively. If the primary provider is rate-limited, it automatically tries the next:

```typescript
import { Agent } from "@mastra/core/agent";

const monitorAgent = new Agent({
  id: "monitor",
  name: "Monitor Agent",
  model: {
    provider: "groq/llama-3.3-70b-versatile",
    fallbacks: [
      "openrouter/deepseek/deepseek-chat:free",
      "groq/llama-3.1-8b-instant",
    ],
  },
  // ...
});
```

This triples the effective daily quota. If Google's free tier is exhausted (1K req/day), Groq picks up (1K req/day), then OpenRouter (50 req/day). For a hobby project running every 15 minutes, this is more than sufficient.

### Cost: $0

| Provider         | Monthly Cost            | Setup                                                  |
| ---------------- | ----------------------- | ------------------------------------------------------ |
| Google AI Studio | **$0**                  | Sign in with Google at ai.google.dev, generate API key |
| Groq             | **$0**                  | Sign up at console.groq.com, instant API key           |
| OpenRouter       | **$0**                  | Sign up at openrouter.ai, free models marked `:free`   |
| DeepSeek         | **$0** (5M free tokens) | Sign up at platform.deepseek.com                       |

**Total: $0/month.** If the project ever needs paid models (GPT-4o, Claude), Mastra makes it trivial to add them — just change the model string.

---

## 7. Mastra Workflow Orchestrator

The workflow is the core of the system — it defines the conditional agent flow as a deterministic state machine.

```typescript
// src/lib/orchestrator/workflow.ts

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { monitorAgent } from "./agents/monitor";
import { bottleneckAgent } from "./agents/bottleneck";
import { redesignAgent } from "./agents/redesign";
import { riskAgent } from "./agents/risk";
import { fetchMarketSnapshot } from "./tools/market";

const HoldingsSchema = z.array(
  z.object({
    ticker: z.string(),
    asset_class: z.string(),
    quantity: z.number(),
    avg_cost: z.number(),
    current_price: z.number(),
  }),
);

const MarketSnapshotSchema = z.array(
  z.object({
    ticker: z.string(),
    price: z.number(),
    change_pct_1d: z.number().nullable(),
    change_pct_7d: z.number().nullable(),
  }),
);

const fetchMarketStep = createStep({
  id: "fetch-market",
  inputSchema: z.object({ holdings: HoldingsSchema }),
  outputSchema: z.object({
    holdings: HoldingsSchema,
    market_snapshot: MarketSnapshotSchema,
  }),
  execute: async ({ context }) => {
    const snapshot = await fetchMarketSnapshot(context.inputData.holdings);
    return { holdings: context.inputData.holdings, market_snapshot: snapshot };
  },
});

const monitorStep = createStep({
  id: "monitor",
  inputSchema: z.object({
    holdings: HoldingsSchema,
    market_snapshot: MarketSnapshotSchema,
  }),
  outputSchema: z.object({
    escalate: z.boolean(),
    monitor_output: z.any(),
    holdings: HoldingsSchema,
    market_snapshot: MarketSnapshotSchema,
  }),
  execute: async ({ context }) => {
    const { holdings, market_snapshot } =
      context.getStepResult("fetch-market")!;
    const result = await monitorAgent.generate(
      `Analyze this portfolio:\n${JSON.stringify({ holdings, market_snapshot })}`,
      { output: MonitorOutput },
    );
    return {
      escalate: result.object.health_status !== "nominal",
      monitor_output: result.object,
      holdings,
      market_snapshot,
    };
  },
});

const bottleneckStep = createStep({
  id: "bottleneck",
  inputSchema: z.any(),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const { monitor_output, holdings, market_snapshot } =
      context.getStepResult("monitor")!;
    const result = await bottleneckAgent.generate(
      `Identify bottlenecks given:\n${JSON.stringify({ monitor_output, holdings, market_snapshot })}`,
      { output: BottleneckOutput },
    );
    return { bottleneck_output: result.object, holdings, market_snapshot };
  },
});

const redesignStep = createStep({
  id: "redesign",
  inputSchema: z.any(),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const { bottleneck_output, holdings } =
      context.getStepResult("bottleneck")!;
    const result = await redesignAgent.generate(
      `Propose rebalancing:\n${JSON.stringify({ bottleneck_output, holdings })}`,
      { output: RedesignOutput },
    );
    return { redesign_output: result.object, holdings };
  },
});

const riskStep = createStep({
  id: "risk",
  inputSchema: z.any(),
  outputSchema: z.any(),
  execute: async ({ context }) => {
    const { redesign_output, holdings } = context.getStepResult("redesign")!;
    const result = await riskAgent.generate(
      `Stress-test this proposal:\n${JSON.stringify({ redesign_output, holdings })}`,
      { output: RiskOutput },
    );
    return { risk_output: result.object };
  },
});

export const portfolioFactoryWorkflow = createWorkflow({
  id: "portfolio-factory",
  inputSchema: z.object({ holdings: HoldingsSchema }),
  outputSchema: z.any(),
})
  .then(fetchMarketStep)
  .then(monitorStep)
  .branch([
    [["escalate", true], bottleneckStep.then(redesignStep).then(riskStep)],
  ])
  .commit();
```

---

## 7. API Routes

```
POST   /api/portfolio/holdings          — Add/update holdings
GET    /api/portfolio/holdings          — Fetch all holdings with live prices
DELETE /api/portfolio/holdings/:id      — Remove a holding

POST   /api/agents/run                  — Trigger a full workflow run (streaming)
GET    /api/agents/history              — Fetch past agent run results

GET    /api/market/snapshot/:ticker     — Fetch live price for a single ticker
GET    /api/market/historical/:ticker   — Fetch OHLCV history
```

The `/api/agents/run` route:

1. Fetches holdings from DB
2. Runs `portfolioFactoryWorkflow.stream({ holdings })`
3. Streams each agent's output token-by-token via the Vercel AI SDK `createUIMessageStreamResponse`
4. The frontend consumes the stream with `useChat` or `useAsyncCompletion`

Since Mastra is built on Vercel AI SDK, streaming is native — no adapter layer needed.

---

## 8. Frontend Components

> **Detailed visual specification:** See [`VISUAL_DESIGN_V1.md`](./VISUAL_DESIGN_V1.md) for the full component
> specs, color system, typography, animation layer, and file structure. What follows is a high-level overview.
> **Visual reference prototype:** [`draft-v1-glm.html`](./draft-v1-glm.html) — open in browser.

### Factory Floor (`<FactoryFloor />`)

Built with React Flow. Each holding is a **node** rendered as a machine card:

```
┌─────────────────────────┐
│  ⚙️  AAPL               │
│  Apple Inc. — Equity     │
│─────────────────────────│
│  Weight:    22.4%        │
│  P&L:       +14.2%       │
│  Volatility: ██░░ Med    │
│  Sharpe:    1.34         │
│─────────────────────────│
│  Status: 🟢 Nominal      │
└─────────────────────────┘
```

Edges between correlated assets are **conveyor belts** — thicker edge = higher correlation.
Edge color: green (low correlation), yellow (medium), red (high — danger signal).

Node border color reflects agent verdict: green (nominal), amber (warning), red (bottleneck identified).

### Agent Panel (`<AgentReasoningPanel />`)

A vertical timeline on the right sidebar. Each agent's output streams in as it completes,
like a terminal readout. Collapsible. Shows: agent name, status badge, full reasoning text, metrics table.

### Portfolio Summary Bar (`<PortfolioSummaryBar />`)

Top bar: Total Value | Unrealised P&L | Sharpe Ratio | Max Drawdown | Last Run: {timestamp}

### Holdings Input (`<HoldingsInput />`)

Simple form: Ticker + Quantity + Avg Cost + Asset Class. Validates ticker via market API before saving.

---

## 9. Data Sources (All Free Tier)

| Data Type                | Source                 | Endpoint / Library                                |
| ------------------------ | ---------------------- | ------------------------------------------------- |
| Stock/ETF prices         | Yahoo Finance          | `yahoo-finance2` npm package                      |
| Crypto prices            | **CoinGecko**          | `/api/v3/simple/price`, `/api/v3/coins/{id}/ohlc` |
| Fundamentals (P/E, etc.) | Alpha Vantage          | Free tier: 25 calls/day                           |
| FX rates                 | Open Exchange Rates    | Free tier: 1000 calls/month                       |
| News headlines           | NewsAPI                | Free tier: 100 calls/day                          |
| VIX / macro              | FRED (Federal Reserve) | `api.stlouisfed.org/fred` — fully free            |
| Historical OHLCV         | Yahoo Finance          | `yahoo-finance2` historical data                  |

### CoinGecko Free Tier (2026)

CoinGecko's free (Demo) plan provides access to most endpoints: real-time and historical prices, OHLCV data, on-chain data from GeckoTerminal, NFT metrics, and discovery tools. Rate limited to 30 calls/minute on the free tier. For a hobby project polling every 15 minutes, this is more than sufficient.

---

## 10. Implementation Phases

### Phase 1 — Foundation (Week 1)

- [ ] Initialize Next.js 16 project with Bun (`bun create next-app`)
- [ ] Set up Tailwind + shadcn/ui
- [ ] Install Drizzle ORM (`bun add drizzle-orm drizzle-kit`), define schema in TypeScript, generate migrations
- [ ] Set up PostgreSQL (Railway $5 free credit or Hetzner VPS), run migrations
- [ ] Build Holdings CRUD (`/api/portfolio/holdings` + `<HoldingsInput />`)
- [ ] Integrate `yahoo-finance2` and CoinGecko for live price fetching
- [ ] Build static React Flow factory floor (hardcoded nodes, no agents yet)
- [ ] Render live prices on machine nodes
- [ ] **Validate**: Confirm `bun next build && bun next start` works on target deployment

### Phase 2 — First Agent (Week 2)

- [ ] Install Mastra (`@mastra/core`, `@mastra/pg`)
- [ ] Install Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/groq`) and provider packages
- [ ] Set up free API keys: Google AI Studio, Groq, OpenRouter, DeepSeek
- [ ] Implement Monitor Agent with structured output (Zod schema)
- [ ] Wire `/api/agents/run` to stream Monitor output
- [ ] Build `<AgentReasoningPanel />` consuming the stream
- [ ] Node border colors reflect monitor health verdict

### Phase 3 — Full Agent Loop (Week 3)

- [ ] Implement Bottleneck, Redesign, and Risk agents
- [ ] Wire full Mastra workflow with conditional branching
- [ ] Implement agent memory via Mastra's built-in memory system
- [ ] Add correlation matrix computation + edge colors to React Flow
- [ ] Stream all four agents sequentially into the panel

### Phase 4 — Polish & Observability (Week 4)

- [ ] Agent run history page (`/api/agents/history`)
- [ ] Install Recharts (`bun add recharts`), build stress test visualisation (bar chart per scenario)
- [ ] pgvector setup + news RAG for Bottleneck Agent
- [ ] Auto-tick: re-run orchestrator every 15 minutes via cron
- [ ] `<PortfolioSummaryBar />` with all live metrics

---

## 11. Key Design Decisions

### Why free models instead of GPT-4o?

This is a hobby project with no revenue stream. Free-tier LLM APIs in 2026 are remarkably capable — Gemini 2.5 Flash outperforms GPT-4 on many benchmarks and costs $0 at 1K requests/day. By spreading load across 4 providers via Mastra's fallback system, the combined free quota easily covers a portfolio tool ticking every 15 minutes. If paid models are ever needed, Mastra makes it a one-line change per agent.

### Why Mastra over LangGraph?

Mastra is TypeScript-native, built on Vercel AI SDK (which the project already uses for streaming), provides workflows with conditional branching, built-in memory, and Mastra Studio for visual debugging. LangGraph.js is a Python port with a steeper learning curve, requires a separate adapter (`@ai-sdk/langchain`) for streaming, and its state API (`channels`) was rewritten to `Annotation.Root` — a moving target. For a TypeScript learning project, Mastra reduces friction at every layer.

### Why Bun?

For a project deploying to a Linux VPS with no native addon dependencies, Bun provides faster installs, faster startup, and native TypeScript execution. The `bun install` → `bun run dev` → `bun next start` path is validated for Next.js 16 on Linux. Windows dev works for `bun install` and `bun run dev`. The rollback to Node.js is trivial (change the runtime command) if issues arise.

### Why Drizzle ORM?

Raw SQL in a TypeScript project means every DB call is untyped — a frequent source of runtime bugs. Drizzle generates your SQL schema from TypeScript definitions, provides fully typed queries, and works natively with PostgreSQL. It's lightweight (no runtime overhead), integrates with Mastra's `@mastra/pg`, and `drizzle-kit` handles migrations. For a learning project, it also teaches the modern TypeScript DB access pattern used across the industry.

### Why Railway or Hetzner for deployment?

**Railway** provides $5 free credit per month — enough to cover a hobby PostgreSQL instance and a small app deployment with zero out-of-pocket cost. No serverless timeout constraints; your agents run as long as they need.

**Hetzner Cloud CX11** (~€4/month in Falkenstein, DE) gives full VPS control, no platform limits on cron intervals, and low-latency access from Berlin. Better if you want to run Bun natively and manage your own Postgres.

Both avoid Vercel's 60-second serverless function timeout on the free plan. Four chained LLM calls at 3–5 seconds each is fine in practice, but slow provider responses could push against the limit. Railway and VPS deployments have no such constraint.

### Why CoinGecko as primary for crypto?

CoinGecko's 2026 free tier provides access to real-time prices, historical OHLCV, on-chain data, and discovery endpoints — significantly richer than Yahoo Finance's `BTC-USD` ticker approach. For crypto-only portfolios, CoinGecko is the **primary** data source (not a secondary one). It provides per-coin metadata, market cap rankings, sector classification, and historical data that Yahoo Finance simply doesn't offer for crypto. Yahoo Finance remains the primary source for equities/ETFs/FX.

### Does this work for crypto-only portfolios?

Yes — arguably it's **more useful** for crypto-only than mixed portfolios. The factory metaphor's real power is making hidden correlation visible. In crypto, most people think they're diversified across 10 coins while holding 10 variations of the same BTC-correlated trade. The Bottleneck Agent surfacing "your ETH, SOL, AVAX, and ARB positions have a 0.91 rolling 30-day correlation — you have one position spread across four tickers" is genuinely eye-opening.

The Monitor Agent's prompt includes crypto sector awareness (L1/L2/DeFi/infrastructure/stablecoins). The Risk Agent includes crypto-native stress scenarios (Terra/LUNA, FTX, 2021 crashes). The `asset_class` field in holdings supports `'crypto'` natively. No architecture changes needed.

---

## 12. Environment Variables

```env
# .env.local

# LLM Providers (all free tier)
GOOGLE_GENERATIVE_AI_API_KEY=     # Google AI Studio — ai.google.dev
GROQ_API_KEY=                     # Groq — console.groq.com
OPENROUTER_API_KEY=               # OpenRouter — openrouter.ai
DEEPSEEK_API_KEY=                 # DeepSeek — platform.deepseek.com

# Database
DATABASE_URL=

# Market Data
ALPHA_VANTAGE_API_KEY=
COINGECKO_API_KEY=                # Optional: free tier works without key
NEWS_API_KEY=
FRED_API_KEY=                     # Free at fred.stlouisfed.org

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
ORCHESTRATOR_TICK_INTERVAL_MS=900000   # 15 minutes
```

---

_Architecture version: 1.0 | Project: Portfolio Factory | Stack: Next.js 16, Mastra, PostgreSQL, Vercel AI SDK, Bun_
