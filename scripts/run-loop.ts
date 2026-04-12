#!/usr/bin/env bun
// scripts/run-loop.ts
// Full builder+reviewer automation loop.
// Usage: bun scripts/run-loop.ts [maxCycles]

import { execSync, spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = resolve(__dirname, "..");
process.chdir(repo);

const maxCycles = parseInt(process.argv[2] ?? "999", 10);

const colors = {
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray:   (s: string) => `\x1b[90m${s}\x1b[0m`,
};

function log(msg: string, color: keyof typeof colors = "green") {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(colors[color](`[${ts}] ${msg}`));
}

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: repo }).toString().trim();
}

function hasIncompleteTasks(): boolean {
  const content = readFileSync("tasks/TASKS.md", "utf8");
  return content.includes("- [ ]");
}

function runClaude(prompt: string): number {
  const result = spawnSync("claude", ["-p", prompt, "--cwd", repo], {
    stdio: "inherit",
    cwd: repo,
  });
  return result.status ?? 1;
}

// Guard
try {
  execSync("claude --version", { stdio: "ignore" });
} catch {
  log("ERROR: 'claude' not found. Run: npm install -g @anthropic-ai/claude-code", "red");
  process.exit(1);
}

log("Builder+Reviewer loop starting (GLM via Claude Code)", "cyan");
log(`Repo: ${repo}`, "gray");
log("Press Ctrl+C to stop.", "gray");
console.log("");

let cycle = 0;

while (cycle < maxCycles) {
  if (!hasIncompleteTasks()) {
    log("All tasks complete. Loop done.", "green");
    break;
  }

  cycle++;
  console.log("=".repeat(50));
  log(`Cycle ${cycle} - Builder starting...`, "green");

  const before = git("rev-parse HEAD");

  const buildExit = runClaude("Builder role. Work on next task.");
  if (buildExit !== 0) {
    log(`Builder exited with error (${buildExit}). Stopping.`, "red");
    break;
  }

  const after = git("rev-parse HEAD");
  if (after === before) {
    log("Builder ran but made no commit. Stopping - check output above.", "yellow");
    break;
  }

  log(`Builder committed: ${git("log -1 --pretty=%s")}`, "green");
  console.log("");

  log(`Cycle ${cycle} - Reviewer starting...`, "cyan");

  const reviewExit = runClaude("Reviewer role. Check the latest commit.");
  if (reviewExit !== 0) {
    log(`Reviewer exited with error (${reviewExit}). Continuing anyway.`, "yellow");
  }

  const reviewMsg = git("log -1 --pretty=%s");
  if (reviewMsg.startsWith("fix:")) {
    log(`Reviewer found issues - fixed: ${reviewMsg}`, "yellow");
  } else {
    log("Reviewer: LGTM", "green");
  }

  console.log("");
}

log(`Loop finished after ${cycle} cycle(s).`, "cyan");
