import { tool } from "ai";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";

const execAsync = promisify(exec);

interface DangerousPattern {
	pattern: RegExp;
	reason: string;
}

// Ported from ~/.claude/hooks/git-guard.ts
const GIT_DANGEROUS_PATTERNS: DangerousPattern[] = [
	{ pattern: /git\s+push\s+.*--force(?!-with-lease\b)/i, reason: "force push without --force-with-lease" },
	{ pattern: /git\s+push\s+(?:.*\s)?-f(?:\s|$)/i, reason: "force push (-f) without lease" },
	{ pattern: /git\s+reset\s+--hard/i, reason: "hard reset (destroys uncommitted changes)" },
	{ pattern: /git\s+clean\s+.*-[a-z]*f/i, reason: "clean -f (removes untracked files)" },
	{ pattern: /git\s+clean\s+.*-[a-z]*d/i, reason: "clean -d (removes untracked directories)" },
	{ pattern: /git\s+branch\s+.*-D/i, reason: "force delete branch (-D)" },
	{ pattern: /git\s+rebase\s+.*-i/i, reason: "interactive rebase (can rewrite history)" },
	{ pattern: /git\s+filter-branch/i, reason: "filter-branch (rewrites history)" },
	{ pattern: /git\s+reflog\s+expire/i, reason: "reflog expire (removes recovery points)" },
	{ pattern: /git\s+gc\s+.*--prune=now/i, reason: "aggressive garbage collection" },
	{ pattern: /git\s+checkout\s+.*--force/i, reason: "force checkout (discards local changes)" },
	{ pattern: /git\s+checkout\s+.*-f(?:\s|$)/i, reason: "force checkout (-f)" },
	{ pattern: /git\s+stash\s+drop/i, reason: "stash drop (permanently removes stash)" },
	{ pattern: /git\s+stash\s+clear/i, reason: "stash clear (removes all stashes)" },
	{ pattern: /git\s+update-ref\s+-d/i, reason: "update-ref -d (deletes references)" },
	{ pattern: /git\s+replace/i, reason: "replace (creates replacement objects)" },
];

const SYSTEM_DANGEROUS_PATTERNS: DangerousPattern[] = [
	{ pattern: /rm\s+-[a-z]*r[a-z]*f\s+\//i, reason: "recursive force delete from root" },
	{ pattern: /rm\s+-[a-z]*f[a-z]*r\s+\//i, reason: "recursive force delete from root" },
	{ pattern: /\bmkfs\b/i, reason: "filesystem format command" },
	{ pattern: /\bdd\s+if=/i, reason: "raw disk write (dd)" },
];

function guardCommand(command: string): string | null {
	if (!command?.trim()) return null;
	const normalized = command.trim().replace(/\s+/g, " ");

	if (/\bgit\b/i.test(normalized)) {
		for (const { pattern, reason } of GIT_DANGEROUS_PATTERNS) {
			if (pattern.test(normalized)) return `Blocked dangerous git command: ${reason}`;
		}
	}

	for (const { pattern, reason } of SYSTEM_DANGEROUS_PATTERNS) {
		if (pattern.test(normalized)) return `Blocked dangerous system command: ${reason}`;
	}

	return null;
}

export const runBashTool = tool({
	description:
		"Execute a bash command in the project root and return the output. Used for building, linting, tests, file search, etc.",
	inputSchema: z.object({
		command: z.string().describe("The bash command to execute"),
	}),
	execute: async ({ command }) => {
		const blocked = guardCommand(command);
		if (blocked) {
			return { success: false, stdout: "", stderr: blocked, error: blocked };
		}

		try {
			const { stdout, stderr } = await execAsync(command, {
				cwd: process.cwd(),
			});
			return { success: true, stdout, stderr };
		} catch (error: any) {
			return {
				success: false,
				stdout: error.stdout ?? "",
				stderr: error.stderr ?? "",
				error: error.message,
			};
		}
	},
});
