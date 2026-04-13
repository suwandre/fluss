#!/usr/bin/env bun
// scripts/run-loop.ts
// Full builder+reviewer automation loop.
// Usage: bun scripts/run-loop.ts [maxCycles]

import { execSync, spawn } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, "..");
process.chdir(repo);

const maxCycles = parseInt(process.argv[2] ?? "999", 10);

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

function log(msg: string, color: keyof typeof colors = "green") {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(colors[color](`[${ts}] ${msg}`));
}

function divider(char = "─", color: keyof typeof colors = "gray") {
  console.log(colors[color](char.repeat(60)));
}

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: repo }).toString().trim();
}

function hasIncompleteTasks(): boolean {
  const content = readFileSync("tasks/TASKS.md", "utf8");
  return content.includes("- [ ]");
}

function countTasks(): { done: number; total: number } {
  const content = readFileSync("tasks/TASKS.md", "utf8");
  const total = (content.match(/- \[[ x]\]/g) ?? []).length;
  const done = (content.match(/- \[x\]/gi) ?? []).length;
  return { done, total };
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function fmtTokens(u: TokenUsage): string {
  return `in:${u.inputTokens.toLocaleString()}  out:${u.outputTokens.toLocaleString()}  $${u.costUsd.toFixed(4)}`;
}

// ── Resolve binary path once at startup ───────────────────────────────────────
// Bare "claude" with shell:true on Windows causes cmd.exe to mangle the args
// array. Resolving the full .cmd path avoids this.
function resolveBin(name: string): string {
  if (process.platform === "win32") {
    const npmGlobal = `${process.env.APPDATA}\\npm\\${name}.cmd`;
    try {
      execSync(`"${npmGlobal}" --version`, {
        stdio: "ignore",
        shell: "cmd.exe",
      });
      return npmGlobal;
    } catch {
      log(`ERROR: '${npmGlobal}' not found or not executable.`, "red");
      process.exit(1);
    }
  }
  try {
    return execSync(`which ${name}`, { encoding: "utf8" })
      .trim()
      .split("\n")[0]
      .trim();
  } catch {
    log(`ERROR: '${name}' not found in PATH.`, "red");
    process.exit(1);
  }
}

const claudeBin = resolveBin("claude");

// ── stream-json event renderer ─────────────────────────────────────────────────
// Claude Code emits JSONL when --output-format stream-json is used.
// Each line is one of: system | assistant | result
// assistant.message.content is an array of blocks: thinking | text | tool_use
// Returns TokenUsage if this was a `result` event, otherwise null.
function handleStreamEvent(
  raw: string,
  rolePrefix: string,
  touch: () => void,
): TokenUsage | null {
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(raw);
  } catch {
    // Not JSON (e.g. plain text fallback) — print as-is.
    if (raw.trim()) process.stdout.write(`${rolePrefix} ${raw}\n`);
    return null;
  }

  const type = ev.type as string | undefined;

  if (type === "assistant") {
    const msg = ev.message as { content?: unknown[] } | undefined;
    for (const block of msg?.content ?? []) {
      const b = block as Record<string, unknown>;

      if (b.type === "thinking" && typeof b.thinking === "string") {
        // Trim long thinking blocks — show first 300 chars.
        const snip = b.thinking.slice(0, 300).replace(/\n+/g, " ");
        const ellipsis = b.thinking.length > 300 ? "..." : "";
        process.stdout.write(`  ${colors.gray("💭 " + snip + ellipsis)}\n`);
        touch();
      } else if (b.type === "text" && typeof b.text === "string") {
        for (const line of b.text.split("\n")) {
          if (line.trim()) process.stdout.write(`${rolePrefix} ${line}\n`);
        }
        touch();
      } else if (b.type === "tool_use") {
        const name = b.name as string;
        const inputStr = JSON.stringify(b.input ?? {});
        const snippet =
          inputStr.length > 120 ? `${inputStr.slice(0, 120)}...` : inputStr;
        process.stdout.write(
          `  ${colors.yellow("⚙ " + name)} ${colors.gray(snippet)}\n`,
        );
        touch();
      }
    }
    return null;
  }

  if (type === "result") {
    const usage = ev.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    const costUsd = (ev.cost_usd as number | undefined) ?? 0;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    touch();
    return { inputTokens, outputTokens, costUsd };
  }

  // "system" and "user" events are informational — skip them.
  return null;
}

/** Streams Claude output live to the terminal. Resolves with exit code + token usage. */
function runClaude(
  role: "Builder" | "Reviewer",
  prompt: string,
): Promise<{ code: number; tokens: TokenUsage }> {
  return new Promise((resolve) => {
    const roleColor = role === "Builder" ? "green" : "cyan";
    const rolePrefix = colors[roleColor](`[${role}]`);

    log(`${role} agent starting...`, roleColor);
    divider("·", "gray");

    const proc = spawn(
      claudeBin,
      [
        "--dangerously-skip-permissions",
        "--print",
        "--verbose",
        "--output-format",
        "stream-json",
        // --bare skips ALL plugin sync, hooks, and attribution at startup.
        // This is the real fix for `config state marker set` (0x80070002):
        // --settings alone only merges with global settings, so worktrunk is
        // still loaded. --bare prevents it from loading at all.
        // --settings still supplies env vars (auth token, model routing, etc.)
        // since --bare explicitly supports that pathway.
        "--bare",
        // Each build/reviewer call is a fresh spawn() with no --continue /
        // --resume, so context never carries over between cycles. This flag
        // makes it explicit: no session files written to disk at all.
        "--no-session-persistence",
        // --bare disables CLAUDE.md/AGENTS.md auto-discovery. Re-inject
        // AGENTS.md explicitly so the agent gets the Builder/Reviewer role
        // definitions, caveman style, dev guidelines, and Next.js rules.
        "--append-system-prompt-file",
        `"${repo}\\AGENTS.md"`,
        "--settings",
        `"${repo}\\.claude\\loop-settings.json"`,
        // Never pause to ask the user a question — the loop is fully autonomous.
        "--disallowed-tools",
        "AskUserQuestion,AskFollowupQuestion",
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: repo,
        shell: true, // required to execute .cmd wrappers on Windows
        env: {
          ...process.env,
          PATH:
            process.platform === "win32"
              ? `C:\\Program Files\\Git\\cmd;C:\\Program Files\\Git\\bin;${process.env.PATH}`
              : process.env.PATH,
        },
      },
    );

    proc.stdin.write(prompt, "utf8");
    proc.stdin.end();

    // Heartbeat: print "still working..." if silent for 15 s so the terminal
    // never looks frozen during long tool calls or API waits.
    let lastOutputAt = Date.now();
    const touch = () => {
      lastOutputAt = Date.now();
    };
    const heartbeat = setInterval(() => {
      if (Date.now() - lastOutputAt > 15_000) {
        process.stdout.write(colors.gray("  ... still working\n"));
        lastOutputAt = Date.now();
      }
    }, 5_000);

    let jsonBuf = "";
    let callTokens: TokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

    proc.stdout.on("data", (chunk: Buffer) => {
      jsonBuf += chunk.toString();
      const lines = jsonBuf.split("\n");
      jsonBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const usage = handleStreamEvent(line.trim(), rolePrefix, touch);
        if (usage) callTokens = usage;
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) process.stdout.write(`${colors.yellow("[stderr]")} ${text}\n`);
    });

    proc.on("close", (code) => {
      clearInterval(heartbeat);
      if (jsonBuf.trim()) {
        const usage = handleStreamEvent(jsonBuf.trim(), rolePrefix, touch);
        if (usage) callTokens = usage;
      }
      // Print per-call token summary.
      process.stdout.write(
        `  ${colors.gray("📊 this call: " + fmtTokens(callTokens))}\n`,
      );
      divider("·", "gray");
      resolve({ code: code ?? 1, tokens: callTokens });
    });
  });
}

// ── Guard ─────────────────────────────────────────────────────────────────────
log(`Resolved claude: ${claudeBin}`, "gray");
try {
  execSync(`"${claudeBin}" --version`, {
    stdio: "ignore",
    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
  });
} catch {
  log(
    "ERROR: 'claude' not found. Run: npm install -g @anthropic-ai/claude-code",
    "red",
  );
  process.exit(1);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
divider("═");
log("Builder+Reviewer loop starting (GLM via Claude Code)", "cyan");
log(`Repo:       ${repo}`, "gray");
log(`Max cycles: ${maxCycles}`, "gray");
const { done: d0, total: t0 } = countTasks();
log(`Tasks:      ${d0}/${t0} complete`, "gray");
log("Press Ctrl+C to stop.", "gray");
divider("═");
console.log("");

let cycle = 0;
const sessionTokens: TokenUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

function addTokens(acc: TokenUsage, t: TokenUsage): void {
  acc.inputTokens += t.inputTokens;
  acc.outputTokens += t.outputTokens;
  acc.costUsd += t.costUsd;
}

while (cycle < maxCycles) {
  if (!hasIncompleteTasks()) {
    log("✓ All tasks complete. Loop done.", "green");
    break;
  }

  const { done, total } = countTasks();
  cycle++;

  divider("═");
  log(`Cycle ${cycle}  |  Tasks: ${done}/${total} done`, "magenta");
  divider("═");

  // ── Builder ──────────────────────────────────────────────────────────────────
  const before = git("rev-parse HEAD");
  log(`HEAD before build: ${before.slice(0, 7)}`, "gray");

  const { code: buildCode, tokens: buildTokens } = await runClaude(
    "Builder",
    `You are in Builder role (see AGENTS.md). ONE TASK ONLY this cycle.

Find the FIRST "- [ ]" in tasks/TASKS.md. Implement that single task. Do not touch any other tasks.

When done: git add --all && git commit -m 'type(scope): description' && git push. Then STOP.`,
  );
  addTokens(sessionTokens, buildTokens);
  log(`Session tokens: ${fmtTokens(sessionTokens)}`, "gray");

  if (buildCode !== 0) {
    log(`Builder exited with error (${buildCode}). Stopping.`, "red");
    break;
  }

  const after = git("rev-parse HEAD");
  if (after === before) {
    log(
      "Builder ran but made no commit. Stopping -- check output above.",
      "yellow",
    );
    log(
      "Tip: ensure the builder prompt ends with a git commit instruction.",
      "gray",
    );
    break;
  }

  const commitMsg = git("log -1 --pretty=%s");
  const commitHash = git("log -1 --pretty=%h");
  log(`✓ Builder committed [${commitHash}]: ${commitMsg}`, "green");
  console.log("");

  // ── Reviewer ─────────────────────────────────────────────────────────────────
  const { code: reviewCode, tokens: reviewTokens } = await runClaude(
    "Reviewer",
    `You are in Reviewer role (see AGENTS.md). Inspect the LATEST commit only.

If issues found: fix, then git add --all && git commit -m 'fix: description' && git push. Output: FIXED.
If clean: output exactly: LGTM

Then STOP.`,
  );
  addTokens(sessionTokens, reviewTokens);
  log(`Session tokens: ${fmtTokens(sessionTokens)}`, "gray");

  if (reviewCode !== 0) {
    log(
      `Reviewer exited with error (${reviewCode}). Continuing anyway.`,
      "yellow",
    );
  }

  const reviewMsg = git("log -1 --pretty=%s");
  if (reviewMsg.startsWith("fix:")) {
    const fixHash = git("log -1 --pretty=%h");
    log(
      `⚠ Reviewer found issues -- fixed [${fixHash}]: ${reviewMsg}`,
      "yellow",
    );
  } else {
    log("✓ Reviewer: LGTM", "green");
  }

  console.log("");
}

divider("═");
log(`Loop finished after ${cycle} cycle(s).`, "cyan");
const { done: df, total: tf } = countTasks();
log(`Final task status: ${df}/${tf} complete`, "gray");
log(`Total tokens used: ${fmtTokens(sessionTokens)}`, "gray");
divider("═");
