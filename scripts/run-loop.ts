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
function handleStreamEvent(
  raw: string,
  rolePrefix: string,
  touch: () => void,
): void {
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(raw);
  } catch {
    // Not JSON (e.g. plain text fallback) — print as-is.
    if (raw.trim()) process.stdout.write(`${rolePrefix} ${raw}\n`);
    return;
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
  } else if (type === "result") {
    // Final event — show token usage and cost.
    const usage = ev.usage as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    const cost = ev.cost_usd as number | undefined;
    const parts: string[] = [];
    if (usage?.input_tokens !== undefined)
      parts.push(`in:${usage.input_tokens}`);
    if (usage?.output_tokens !== undefined)
      parts.push(`out:${usage.output_tokens}`);
    if (cost !== undefined) parts.push(`$${cost.toFixed(4)}`);
    if (parts.length) {
      process.stdout.write(`  ${colors.gray("📊 " + parts.join("  "))}\n`);
    }
    touch();
  }
  // "system" and "user" events are informational — skip them.
}

/** Streams Claude output live to the terminal. Resolves with exit code. */
function runClaude(
  role: "Builder" | "Reviewer",
  prompt: string,
): Promise<number> {
  return new Promise((resolve) => {
    const roleColor = role === "Builder" ? "green" : "cyan";
    const rolePrefix = colors[roleColor](`[${role}]`);

    log(`${role} agent starting...`, roleColor);
    divider("·", "gray");

    // --output-format stream-json emits JSONL events in real-time (thinking,
    // tool calls, text, token counts). Prompt piped via stdin to avoid
    // Windows shell mangling of -- tokens and && separators in the text.
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
    proc.stdout.on("data", (chunk: Buffer) => {
      jsonBuf += chunk.toString();
      const lines = jsonBuf.split("\n");
      jsonBuf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) handleStreamEvent(line.trim(), rolePrefix, touch);
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) process.stdout.write(`${colors.yellow("[stderr]")} ${text}\n`);
    });

    proc.on("close", (code) => {
      clearInterval(heartbeat);
      if (jsonBuf.trim()) handleStreamEvent(jsonBuf.trim(), rolePrefix, touch);
      divider("·", "gray");
      resolve(code ?? 1);
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

  const buildExit = await runClaude(
    "Builder",
    `Builder role: You are fully autonomous — never ask the user questions, never pause for input, use your best judgment to make all decisions. Before coding, read ~/.claude/skills/web-design-guidelines/SKILL.md, ~/.claude/skills/vercel-react-best-practices/SKILL.md, and ~/.claude/skills/tdd/SKILL.md for standards. Then pick the next unchecked task in tasks/TASKS.md and implement it following those standards. For tasks involving secrets or API keys, create the file with commented-out placeholder values (e.g. SOME_KEY=your-key-here) and commit the template — never block on missing values. After implementing, use the test-generator agent to write tests if applicable. Then run: git add --all && git commit -m 'type: short description'. Do not stop until the commit is made.`,
  );

  if (buildExit !== 0) {
    log(`Builder exited with error (${buildExit}). Stopping.`, "red");
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
  const reviewExit = await runClaude(
    "Reviewer",
    `Reviewer role: Use the code-reviewer agent to inspect the latest git commit for bugs, type errors, style issues, and incomplete logic. Then use the ai-slop-remover agent to check for AI slop patterns and unnecessary complexity. If issues are found, fix them and commit with a message starting with fix:. If everything looks good, output exactly: LGTM`,
  );

  if (reviewExit !== 0) {
    log(
      `Reviewer exited with error (${reviewExit}). Continuing anyway.`,
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
divider("═");
