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

// ── NEW: Resolve binary path once at startup ──────────────────────────────────
// Bare "claude" with shell:true on Windows causes cmd.exe to mangle the args
// array — special chars in the prompt get misinterpreted and flags like -A end
// up being passed to claude itself. Resolving the full path and passing it
// directly to spawn avoids this entirely.
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

const claudeBin = resolveBin("claude"); // e.g. C:\Users\suwan\AppData\Roaming\npm\claude.cmd

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

    // Prompt is piped via stdin to avoid shell mangling on Windows.
    // When the prompt is passed as a positional arg with shell:true, cmd.exe
    // reassembles the args into a string and may parse tokens like --all or &&
    // as flags/separators rather than literal text.
    const proc = spawn(
      claudeBin,
      ["--dangerously-skip-permissions", "--print", "--verbose"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: repo,
        shell: true, // still needed to execute .cmd wrappers on Windows
        env: {
          ...process.env,
          // Only prepend Git on Windows; leave PATH untouched on Unix
          PATH:
            process.platform === "win32"
              ? `C:\\Program Files\\Git\\cmd;C:\\Program Files\\Git\\bin;${process.env.PATH}`
              : process.env.PATH,
        },
      },
    );

    // Write prompt to stdin then close it so claude knows input is done.
    proc.stdin.write(prompt, "utf8");
    proc.stdin.end();

    let buffer = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) process.stdout.write(`${rolePrefix} ${line}\n`);
      }
    });

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

// ── Guard ─────────────────────────────────────────────────────────────────────
log(`Resolved claude: ${claudeBin}`, "gray"); // visible at startup so you can verify
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

  // ── Builder ─────────────────────────────────────────────────────────────────
  const before = git("rev-parse HEAD");
  log(`HEAD before build: ${before.slice(0, 7)}`, "gray");

  const buildExit = await runClaude(
    "Builder",
    // ← git add --all instead of -A; no backticks in commit template
    "Builder role: pick the next unchecked task in tasks/TASKS.md, implement it, then stage and commit all changes with: git add --all && git commit -m 'type: short description'. Do not stop until the commit is made.",
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

  // ── Reviewer ────────────────────────────────────────────────────────────────
  const reviewExit = await runClaude(
    "Reviewer",
    // ← no backticks in the fix: instruction to avoid shell mangling
    "Reviewer role: inspect the latest git commit. Check for bugs, type errors, style issues, and incomplete logic. If you find issues, fix them and commit with a message starting with fix:. If everything looks good, output exactly: LGTM",
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
