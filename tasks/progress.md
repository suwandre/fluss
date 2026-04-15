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

## Task 4.5.4 (4/16/2026, 12:20:00 AM)

**Description:** News RAG integration for Bottleneck Agent — ingest headlines via NewsAPI, store embeddings, wire `searchMarketDocuments` tool _(A §10, Phase 4)_

**Summary:**
Created `src/lib/market/news-rag.ts` with full News RAG pipeline:

- `ingestNewsHeadlines(tickers?)` — fetches from NewsAPI /v2/everything, generates OpenAI text-embedding-3-small embeddings (1536 dims), stores in market_documents table with dedup
- `searchMarketDocumentsRAG(query, tickers?, limit)` — generates query embedding, performs pgvector cosine similarity search (threshold >0.5), returns ranked results with snippets and relevance scores
- Installed `@ai-sdk/openai` for embedding generation
- Wired `searchMarketDocuments` tool in bottleneck.ts to call `searchMarketDocumentsRAG` (was previously returning empty stub)
- Added news ingestion to scheduler tick — runs before each orchestrator workflow, non-fatal on failure
- Created `POST /api/market/news` (ingest) and `GET /api/market/news?q=...` (search) API routes
- Requires `NEWS_API_KEY` and `OPENAI_API_KEY` env vars

**Gotchas:**

- Requires OPENAI_API_KEY env var for embeddings (text-embedding-3-small, 1536 dims matching schema)
- News ingestion in scheduler is non-fatal — won't block workflow if NewsAPI or OpenAI is unavailable
- Dedup is title-based (extracts title from "TITLE: DESCRIPTION" content format)
