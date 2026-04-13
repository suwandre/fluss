#!/usr/bin/env bun
// scripts/e2e-test.ts
// End-to-end test: add holdings → trigger agent run → see Monitor output stream → node borders update
// Usage: bun scripts/e2e-test.ts [baseUrl]
// Requires: dev server running + DB up + API keys configured

const BASE_URL = process.argv[2] ?? "http://localhost:3000";

const C = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
};

function log(msg: string, color: keyof typeof C = "green") {
  console.log(C[color](`  ${msg}`));
}

const TEST_HOLDINGS = [
  { ticker: "AAPL", assetClass: "equity", quantity: "10", avgCost: "150.00" },
  { ticker: "MSFT", assetClass: "equity", quantity: "5", avgCost: "300.00" },
  { ticker: "BTC", assetClass: "crypto", quantity: "0.5", avgCost: "40000.00" },
];

interface TestResult {
  passed: boolean;
  errors: string[];
}

async function fetchJSON(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/portfolio/holdings`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

async function cleanupHoldings(): Promise<void> {
  const holdings = (await fetchJSON(`${BASE_URL}/api/portfolio/holdings`)) as Array<{ id: string }>;
  for (const h of holdings) {
    await fetch(`${BASE_URL}/api/portfolio/holdings/${h.id}`, { method: "DELETE" });
  }
}

async function addHoldings(): Promise<Array<{ id: string; ticker: string }>> {
  const added: Array<{ id: string; ticker: string }> = [];
  for (const h of TEST_HOLDINGS) {
    const result = (await fetchJSON(`${BASE_URL}/api/portfolio/holdings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(h),
    })) as { id: string; ticker: string };
    added.push(result);
  }
  return added;
}

async function verifyHoldings(expected: Array<{ ticker: string }>): Promise<boolean> {
  const holdings = (await fetchJSON(`${BASE_URL}/api/portfolio/holdings`)) as Array<{ ticker: string }>;
  const tickers = holdings.map((h) => h.ticker);
  return expected.every((e) => tickers.includes(e.ticker));
}

interface StreamedMonitorOutput {
  runId: string | null;
  fullText: string;
  parsed: Record<string, unknown> | null;
  chunkCount: number;
}

async function triggerAgentRun(): Promise<StreamedMonitorOutput> {
  const res = await fetch(`${BASE_URL}/api/agents/run`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Agent run failed: HTTP ${res.status} — ${body}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let runId: string | null = null;
  let chunkCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n");
    buffer = events.pop()!;

    for (const line of events) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      if (event.type === "data-run-id") {
        runId = (event.data as Record<string, string>)?.runId ?? null;
      }

      if (event.type === "text-delta" && typeof event.delta === "string") {
        fullText += event.delta;
        chunkCount++;
      }

      if (event.type === "error" && typeof event.errorText === "string") {
        throw new Error(`Stream error: ${event.errorText}`);
      }
    }
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(fullText);
  } catch {
    // Not valid JSON
  }

  return { runId, fullText, parsed, chunkCount };
}

function validateMonitorOutput(output: StreamedMonitorOutput, result: TestResult): void {
  // Must have received streamed chunks
  if (output.chunkCount === 0) {
    result.errors.push("No text-delta chunks received from stream");
  } else {
    log(`✓ Received ${output.chunkCount} text-delta chunks`);
  }

  // Must have a run ID
  if (!output.runId) {
    result.errors.push("No run ID received from stream");
  } else {
    log(`✓ Run ID: ${output.runId.slice(0, 8)}...`);
  }

  // Must parse into valid JSON
  if (!output.parsed) {
    result.errors.push(
      `Stream output is not valid JSON. Raw (first 500 chars): ${output.fullText.slice(0, 500)}`,
    );
    return;
  }
  log("✓ Output parsed as valid JSON");

  const obj = output.parsed;

  // Validate health_status
  const validHealth = ["nominal", "warning", "critical"];
  if (!validHealth.includes(obj.health_status as string)) {
    result.errors.push(`Invalid health_status: ${obj.health_status}`);
  } else {
    log(`✓ health_status: ${obj.health_status}`);
  }

  // Validate portfolio_metrics exists
  if (!obj.portfolio_metrics || typeof obj.portfolio_metrics !== "object") {
    result.errors.push("Missing portfolio_metrics");
  } else {
    const metrics = obj.portfolio_metrics as Record<string, unknown>;
    const requiredMetrics = ["total_value", "unrealised_pnl_pct", "sharpe_ratio", "max_drawdown_pct"];
    for (const key of requiredMetrics) {
      if (metrics[key] === undefined) {
        result.errors.push(`Missing portfolio_metrics.${key}`);
      }
    }
    log(`✓ portfolio_metrics present with keys: ${Object.keys(metrics).join(", ")}`);
  }

  // Validate concerns is an array
  if (!Array.isArray(obj.concerns)) {
    result.errors.push("concerns is not an array");
  } else {
    log(`✓ concerns: ${obj.concerns.length} item(s)`);
  }

  // Validate escalate is boolean
  if (typeof obj.escalate !== "boolean") {
    result.errors.push(`escalate is not boolean: ${obj.escalate}`);
  } else {
    log(`✓ escalate: ${obj.escalate}`);
  }

  // Validate summary is a non-empty string
  if (typeof obj.summary !== "string" || obj.summary.length === 0) {
    result.errors.push("summary is missing or empty");
  } else {
    log(`✓ summary: "${obj.summary.slice(0, 80)}..."`);
  }

  // Validate asset_health for node border updates
  if (!Array.isArray(obj.asset_health)) {
    result.errors.push("asset_health is not an array — node borders cannot update");
    return;
  }

  const healthTickers = (obj.asset_health as Array<{ ticker: string; health: string }>).map(
    (a) => a.ticker.toLowerCase(),
  );
  const expectedTickers = TEST_HOLDINGS.map((h) => h.ticker.toLowerCase());

  log(`✓ asset_health entries: ${(obj.asset_health as unknown[]).length}`);

  for (const ticker of expectedTickers) {
    if (!healthTickers.includes(ticker)) {
      result.errors.push(`asset_health missing ticker: ${ticker} — node border will not update`);
    } else {
      const entry = (obj.asset_health as Array<{ ticker: string; health: string }>).find(
        (a) => a.ticker.toLowerCase() === ticker,
      )!;
      if (!validHealth.includes(entry.health)) {
        result.errors.push(`Invalid health for ${ticker}: ${entry.health}`);
      } else {
        log(`✓ ${ticker} health: ${entry.health} → node border will update`);
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(C.cyan("═".repeat(60)));
  console.log(C.cyan("  E2E Test: Task 2.5.1"));
  console.log(C.cyan("═".repeat(60)));
  console.log(`  Target: ${BASE_URL}\n`);

  const result: TestResult = { passed: true, errors: [] };

  try {
    // Step 1: Health check
    log("Step 1: Health check...", "cyan");
    if (!(await healthCheck())) {
      throw new Error(
        `Server not reachable at ${BASE_URL}. Start with: bun run dev`,
      );
    }
    log("✓ Server reachable");

    // Step 2: Clean up existing holdings
    log("\nStep 2: Clean up existing holdings...", "cyan");
    await cleanupHoldings();
    log("✓ Holdings cleared");

    // Step 3: Add test holdings
    log("\nStep 3: Add test holdings...", "cyan");
    const added = await addHoldings();
    log(`✓ Added ${added.length} holdings: ${added.map((a) => a.ticker).join(", ")}`);

    // Step 4: Verify holdings in DB
    log("\nStep 4: Verify holdings exist...", "cyan");
    if (!(await verifyHoldings(TEST_HOLDINGS))) {
      throw new Error("Holdings verification failed — not all tickers found in GET response");
    }
    log("✓ All holdings verified in DB");

    // Step 5: Trigger agent run + read SSE stream
    log("\nStep 5: Trigger agent run (this may take 10-30s)...", "cyan");
    const streamOutput = await triggerAgentRun();
    log(`✓ Stream complete (${streamOutput.fullText.length} chars)`);

    // Step 6: Validate Monitor output
    log("\nStep 6: Validate Monitor output...", "cyan");
    validateMonitorOutput(streamOutput, result);

    // Step 7: Cleanup
    log("\nStep 7: Cleanup test holdings...", "cyan");
    await cleanupHoldings();
    log("✓ Test holdings removed");
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  // Report
  console.log("\n" + C.cyan("═".repeat(60)));
  if (result.errors.length === 0) {
    console.log(C.green("  ✓ ALL TESTS PASSED"));
  } else {
    console.log(C.red("  ✗ TESTS FAILED"));
    result.passed = false;
    for (const err of result.errors) {
      console.log(C.red(`    • ${err}`));
    }
  }
  console.log(C.cyan("═".repeat(60)));

  process.exit(result.passed ? 0 : 1);
}

main();