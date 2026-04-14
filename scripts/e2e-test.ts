#!/usr/bin/env bun
// scripts/e2e-test.ts
// End-to-end test for Phase 3.7.1: full workflow pipeline validation
// Triggers run -> all 4 agents stream in order -> Monitor -> Bottleneck -> Redesign -> Risk
// Validates: agent step events, structured outputs, correlation matrix, workflow completion
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

// -- Workflow event types --

interface WorkflowStreamEvent {
  type: string;
  payload?: Record<string, unknown>;
}

interface StreamedWorkflowOutput {
  runId: string | null;
  stepStarts: string[];
  stepResults: Map<string, Record<string, unknown>>;
  workflowFinish: boolean;
  rawEvents: WorkflowStreamEvent[];
}

async function triggerWorkflowRun(): Promise<StreamedWorkflowOutput> {
  const res = await fetch(`${BASE_URL}/api/agents/run`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Workflow run failed: HTTP ${res.status} -- ${body}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const stepStarts: string[] = [];
  const stepResults = new Map<string, Record<string, unknown>>();
  let workflowFinish = false;
  let runId: string | null = null;
  const rawEvents: WorkflowStreamEvent[] = [];

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

      // Extract run ID
      if (
        event.type === "data-run-id" &&
        typeof (event.data as Record<string, string>)?.runId === "string"
      ) {
        runId = (event.data as Record<string, string>).runId;
      }

      // Parse workflow events
      if (event.type === "data-workflow-event" && event.data) {
        const wfEvent = event.data as Record<string, unknown>;
        const wfType = wfEvent.type as string;
        const wfPayload = wfEvent.payload as Record<string, unknown> | undefined;

        rawEvents.push({ type: wfType, payload: wfPayload });

        if (wfType === "workflow-step-start" && wfPayload?.id) {
          stepStarts.push(wfPayload.id as string);
        }

        if (wfType === "workflow-step-result" && wfPayload) {
          const stepId = wfPayload.id as string;
          const output = wfPayload.output as Record<string, unknown>;
          if (stepId && output) {
            stepResults.set(stepId, output);
          }
        }

        if (wfType === "workflow-finish") {
          workflowFinish = true;
        }
      }

      // Surface stream errors
      if (event.type === "error" && typeof event.errorText === "string") {
        throw new Error(`Stream error: ${event.errorText}`);
      }
    }
  }

  return { runId, stepStarts, stepResults, workflowFinish, rawEvents };
}

// -- Validation functions --

const VALID_HEALTH = ["nominal", "warning", "critical"] as const;

function validateMonitorOutput(
  output: Record<string, unknown>,
  result: TestResult,
): void {
  if (!(VALID_HEALTH as readonly string[]).includes(output.health_status as string)) {
    result.errors.push(`Monitor: invalid health_status "${output.health_status}"`);
  } else {
    log(`Monitor health_status: ${output.health_status}`);
  }

  const metrics = output.portfolio_metrics as Record<string, unknown> | undefined;
  if (!metrics || typeof metrics !== "object") {
    result.errors.push("Monitor: missing portfolio_metrics");
  } else {
    const required = ["total_value", "unrealised_pnl_pct", "sharpe_ratio", "max_drawdown_pct"];
    for (const key of required) {
      if (metrics[key] === undefined) {
        result.errors.push(`Monitor: missing portfolio_metrics.${key}`);
      }
    }
    log(`Monitor portfolio_metrics present (${Object.keys(metrics).length} keys)`);
  }

  if (!Array.isArray(output.concerns)) {
    result.errors.push("Monitor: concerns is not an array");
  } else {
    log(`Monitor concerns: ${output.concerns.length} item(s)`);
  }

  if (typeof output.escalate !== "boolean") {
    result.errors.push(`Monitor: escalate is not boolean: ${output.escalate}`);
  } else {
    log(`Monitor escalate: ${output.escalate}`);
  }

  if (typeof output.summary !== "string" || output.summary.length === 0) {
    result.errors.push("Monitor: summary is missing or empty");
  } else {
    log(`Monitor summary: "${(output.summary as string).slice(0, 80)}..."`);
  }

  if (!Array.isArray(output.asset_health)) {
    result.errors.push("Monitor: asset_health is not an array -- node borders cannot update");
    return;
  }
  log(`Monitor asset_health: ${(output.asset_health as unknown[]).length} entries`);
  const healthTickers = (output.asset_health as Array<{ ticker: string; health: string }>).map(
    (a) => a.ticker.toLowerCase(),
  );
  for (const ticker of TEST_HOLDINGS.map((h) => h.ticker.toLowerCase())) {
    if (!healthTickers.includes(ticker)) {
      result.errors.push(`Monitor: asset_health missing ticker ${ticker}`);
    } else {
      const entry = (output.asset_health as Array<{ ticker: string; health: string }>).find(
        (a) => a.ticker.toLowerCase() === ticker,
      )!;
      log(`Monitor ${ticker} health: ${entry.health}`);
    }
  }
}

function validateBottleneckOutput(
  output: Record<string, unknown>,
  result: TestResult,
): void {
  if (!output.primary_bottleneck || typeof output.primary_bottleneck !== "object") {
    result.errors.push("Bottleneck: missing primary_bottleneck");
  } else {
    const pb = output.primary_bottleneck as Record<string, unknown>;
    log(`Bottleneck primary: ${pb.ticker} (${pb.severity}) -- ${pb.reason}`);
  }

  if (typeof output.analysis !== "string") {
    result.errors.push("Bottleneck: missing analysis");
  } else {
    log(`Bottleneck analysis: "${(output.analysis as string).slice(0, 60)}..."`);
  }
}

function validateRedesignOutput(
  output: Record<string, unknown>,
  result: TestResult,
): void {
  if (!Array.isArray(output.proposed_actions)) {
    result.errors.push("Redesign: proposed_actions is not an array");
  } else {
    log(`Redesign proposed_actions: ${output.proposed_actions.length} action(s)`);
  }

  const validConfidence = ["high", "medium", "low"];
  if (!validConfidence.includes(output.confidence as string)) {
    result.errors.push(`Redesign: invalid confidence "${output.confidence}"`);
  } else {
    log(`Redesign confidence: ${output.confidence}`);
  }

  if (!output.expected_improvement || typeof output.expected_improvement !== "object") {
    result.errors.push("Redesign: missing expected_improvement");
  } else {
    log(`Redesign expected_improvement present`);
  }
}

function validateRiskOutput(
  output: Record<string, unknown>,
  result: TestResult,
): void {
  const validVerdicts = ["approve", "approve_with_caveats", "reject"];
  if (!validVerdicts.includes(output.verdict as string)) {
    result.errors.push(`Risk: invalid verdict "${output.verdict}"`);
  } else {
    log(`Risk verdict: ${output.verdict}`);
  }

  if (!Array.isArray(output.stress_results)) {
    result.errors.push("Risk: stress_results is not an array");
  } else {
    log(`Risk stress_results: ${output.stress_results.length} scenario(s)`);
  }

  if (output.var_95 === undefined || output.var_95 === null) {
    result.errors.push("Risk: missing var_95");
  } else {
    log(`Risk var_95: ${output.var_95}`);
  }
}

function validateCorrelationMatrix(
  matrix: unknown[],
  result: TestResult,
): void {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    result.errors.push("Correlation matrix is missing or empty -- edges cannot be colored");
    return;
  }

  log(`Correlation matrix: ${matrix.length} ticker(s)`);

  for (const entry of matrix as Array<Record<string, unknown>>) {
    const ticker = entry.ticker as string;
    const correlations = entry.correlations as Array<{ with: string; correlation: number }>;
    if (!ticker || !Array.isArray(correlations)) {
      result.errors.push(`Correlation matrix: invalid entry for "${ticker}"`);
      continue;
    }
    log(`  ${ticker}: ${correlations.map((c) => `${c.with}=${c.correlation.toFixed(2)}`).join(", ")}`);
  }
}

// -- Main --

async function main(): Promise<void> {
  console.log(C.cyan("=".repeat(60)));
  console.log(C.cyan("  E2E Test: Phase 3.7.1 -- Full Workflow Pipeline"));
  console.log(C.cyan("=".repeat(60)));
  console.log(`  Target: ${BASE_URL}\n`);

  const result: TestResult = { passed: true, errors: [] };

  try {
    // Step 1: Health check
    log("Step 1: Health check...", "cyan");
    if (!(await healthCheck())) {
      throw new Error(`Server not reachable at ${BASE_URL}. Start with: bun run dev`);
    }
    log("Server reachable");

    // Step 2: Clean up existing holdings
    log("\nStep 2: Clean up existing holdings...", "cyan");
    await cleanupHoldings();
    log("Holdings cleared");

    // Step 3: Add test holdings
    log("\nStep 3: Add test holdings...", "cyan");
    const added = await addHoldings();
    log(`Added ${added.length} holdings: ${added.map((a) => a.ticker).join(", ")}`);

    // Step 4: Verify holdings in DB
    log("\nStep 4: Verify holdings exist...", "cyan");
    if (!(await verifyHoldings(TEST_HOLDINGS))) {
      throw new Error("Holdings verification failed -- not all tickers found in GET response");
    }
    log("All holdings verified in DB");

    // Step 5: Trigger full workflow run + read SSE stream
    log("\nStep 5: Trigger workflow run (may take 30-120s for all 4 agents)...", "cyan");
    const output = await triggerWorkflowRun();
    log(`Stream complete (${output.rawEvents.length} events)`);

    // Step 6: Validate run metadata
    log("\nStep 6: Validate run metadata...", "cyan");
    if (!output.runId) {
      result.errors.push("No run ID received from stream");
    } else {
      log(`Run ID: ${output.runId.slice(0, 8)}...`);
    }

    // Step 7: Validate workflow step progression
    log("\nStep 7: Validate workflow step events...", "cyan");
    const expectedSteps = [
      "fetch-market-snapshot",
      "compute-correlation-matrix",
      "monitor",
      "bottleneck",
      "redesign",
      "risk",
    ];

    for (const stepId of expectedSteps) {
      if (output.stepStarts.includes(stepId)) {
        log(`Step started: ${stepId}`);
      } else {
        const isConditional = ["bottleneck", "redesign", "risk"].includes(stepId);
        if (isConditional) {
          log(`  Skipped (nominal): ${stepId}`, "yellow");
        } else {
          result.errors.push(`Step never started: ${stepId}`);
        }
      }
    }

    if (output.workflowFinish) {
      log("Workflow finished event received");
    } else {
      result.errors.push("No workflow-finish event received -- stream may have ended prematurely");
    }

    // Step 8: Validate Monitor output (always present)
    log("\nStep 8: Validate Monitor output...", "cyan");
    const monitorResult = output.stepResults.get("monitor");
    if (!monitorResult) {
      result.errors.push("No monitor step result found");
    } else {
      validateMonitorOutput(monitorResult, result);
    }

    // Step 9: Validate escalation path if health != nominal
    log("\nStep 9: Validate escalation path...", "cyan");
    const isEscalation =
      monitorResult &&
      monitorResult.health_status !== "nominal";

    if (isEscalation) {
      log(`Health is "${monitorResult!.health_status}" -- escalation path active`, "yellow");

      // Bottleneck
      const bottleneckResult = output.stepResults.get("bottleneck");
      if (!bottleneckResult) {
        result.errors.push("Escalation active but no bottleneck step result");
      } else {
        const bottleneckAgentOutput = bottleneckResult.bottleneck as Record<string, unknown> | null;
        if (!bottleneckAgentOutput) {
          result.errors.push("Escalation active but bottleneck agent output is null");
        } else {
          validateBottleneckOutput(bottleneckAgentOutput, result);
        }
      }

      // Redesign
      const redesignResult = output.stepResults.get("redesign");
      if (!redesignResult) {
        result.errors.push("Escalation active but no redesign step result");
      } else {
        const redesignAgentOutput = redesignResult.redesign as Record<string, unknown> | null;
        if (!redesignAgentOutput) {
          result.errors.push("Escalation active but redesign agent output is null");
        } else {
          validateRedesignOutput(redesignAgentOutput, result);
        }
      }

      // Risk
      const riskResult = output.stepResults.get("risk");
      if (!riskResult) {
        result.errors.push("Escalation active but no risk step result");
      } else {
        const riskAgentOutput = riskResult.risk as Record<string, unknown> | null;
        if (!riskAgentOutput) {
          result.errors.push("Escalation active but risk agent output is null");
        } else {
          validateRiskOutput(riskAgentOutput, result);
        }
      }
    } else {
      log("Health is nominal -- no escalation (Bottleneck/Redesign/Risk skipped)", "yellow");
    }

    // Step 10: Validate correlation matrix (for edge coloring)
    log("\nStep 10: Validate correlation matrix...", "cyan");
    let correlationMatrix: unknown[] | null = null;

    const corrStepResult = output.stepResults.get("compute-correlation-matrix");
    if (corrStepResult?.correlationMatrix) {
      correlationMatrix = corrStepResult.correlationMatrix as unknown[];
    }
    // Fallback: check other step results (they include correlationMatrix passthrough)
    if (!correlationMatrix) {
      output.stepResults.forEach((stepOutput) => {
        if (!correlationMatrix && Array.isArray(stepOutput.correlationMatrix) && stepOutput.correlationMatrix.length > 0) {
          correlationMatrix = stepOutput.correlationMatrix as unknown[];
        }
      });
    }

    if (correlationMatrix) {
      validateCorrelationMatrix(correlationMatrix, result);
    } else {
      result.errors.push("No correlation matrix found -- edges cannot be colored/animated");
    }

    // Step 11: Cleanup test holdings
    log("\nStep 11: Cleanup test holdings...", "cyan");
    await cleanupHoldings();
    log("Test holdings removed");
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  // Report
  console.log("\n" + C.cyan("=".repeat(60)));
  if (result.errors.length === 0) {
    console.log(C.green("  ALL TESTS PASSED"));
  } else {
    console.log(C.red("  TESTS FAILED"));
    result.passed = false;
    for (const err of result.errors) {
      console.log(C.red(`    * ${err}`));
    }
  }
  console.log(C.cyan("=".repeat(60)));

  process.exit(result.passed ? 0 : 1);
}

main();