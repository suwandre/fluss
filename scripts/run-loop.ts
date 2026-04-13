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

/** Streams Claude output live to the terminal. Resolves with exit code. */
function runClaude(
  role: "Builder" | "Reviewer",
  prompt: string,
): Promise<number> {
  return new Promise((resolve) => {
    const roleColor = role === "Builder" ? "green" : "cyan";
    const rolePrefix = colors[roleColor](`[${role}]`);

    log(`${role} agent starting — streaming output below...`, roleColor);
    divider("·", "gray");

    const proc = spawn(
      "claude",
      [
        "--dangerously-skip-permissions",
        "--print", // non-interactive but streams output
        "--verbose", // show tool calls (Read, Write, Bash, etc.)
        prompt,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: repo,
        shell: true,
      },
    );

    // Stream stdout line-by-line with role prefix
    let buffer = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) process.stdout.write(`${rolePrefix} ${line}\n`);
      }
    });

    // Stream stderr in yellow
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) process.stdout.write(`${colors.yellow("[stderr]")} ${text}\n`);
    });

    proc.on("close", (code) => {
      if (buffer.trim()) process.stdout.write(`${rolePrefix} ${buffer}\n`);
      divider("·", "gray");
      resolve(code ?? 1);
    });
  });
}

// ── Guard ────────────────────────────────────────────────────────────────────
try {
  execSync("claude --version", {
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

// ── Boot ─────────────────────────────────────────────────────────────────────
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

  // ── Builder ────────────────────────────────────────────────────────────────
  const before = git("rev-parse HEAD");
  log(`HEAD before build: ${before.slice(0, 7)}`, "gray");

  const buildExit = await runClaude(
    "Builder",
    "Builder role: pick the next unchecked task in tasks/TASKS.md, implement it, then run `git add -A && git commit -m '<type>: <short description>'`. Do not stop until the commit is made.",
  );

  if (buildExit !== 0) {
    log(`Builder exited with error (${buildExit}). Stopping.`, "red");
    break;
  }

  const after = git("rev-parse HEAD");
  if (after === before) {
    log(
      "Builder ran but made no commit. Stopping — check output above.",
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

  // ── Reviewer ───────────────────────────────────────────────────────────────
  const reviewExit = await runClaude(
    "Reviewer",
    "Reviewer role: inspect the latest git commit. Check for bugs, type errors, style issues, and incomplete logic. If you find issues, fix them and commit with a message starting with `fix:`. If everything looks good, output exactly: LGTM",
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
    log(`⚠ Reviewer found issues — fixed [${fixHash}]: ${reviewMsg}`, "yellow");
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
