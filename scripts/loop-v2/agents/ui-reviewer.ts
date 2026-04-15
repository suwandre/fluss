import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { runBashTool } from "../tools/bash";
import { readFileTool, writeFileTool } from "../tools/fs";
import { costTracker } from "../tools/cost";
import { loadAgentDef } from "./loader";

export interface UIReviewResult {
	severity: "blocking" | "advisory" | "pass";
	findings: string[];
	filesChecked: string[];
}

/**
 * Checks whether the current git diff touches any .tsx files.
 * If not, skips the UI review entirely.
 */
export async function diffHasUIChanges(): Promise<boolean> {
	const { exec } = await import("child_process");
	const { promisify } = await import("util");
	const execAsync = promisify(exec);
	try {
		const { stdout } = await execAsync("git diff HEAD --name-only");
		return stdout.split("\n").some((f) => f.trim().endsWith(".tsx"));
	} catch {
		return false;
	}
}

export async function runUIReviewer(
	model: any,
	maxSteps = 8,
): Promise<UIReviewResult> {
	console.log("=> UI Reviewer");

	const def = loadAgentDef("ui-reviewer.md");
	let result: UIReviewResult | null = null;

	const { usage } = await generateText({
		model,
		temperature: def.temperature,
		system: def.systemPrompt,
		prompt: "Run `git diff HEAD` to get the UI changes, then review all modified .tsx files against the guidelines. Call finish_ui_review when done.",
		tools: {
			read_file: readFileTool,
			write_file: writeFileTool,
			run_bash: runBashTool,
			finish_ui_review: tool({
				description: "Call this EXACTLY ONCE with your review results.",
				inputSchema: z.object({
					severity: z
						.enum(["blocking", "advisory", "pass"])
						.describe("blocking = must fix before commit. advisory = minor issues, ok to ship. pass = no issues."),
					findings: z
						.array(z.string())
						.describe("List of findings in 'file:line - issue' format. Empty if pass."),
					filesChecked: z
						.array(z.string())
						.describe("List of .tsx files reviewed."),
				}),
				execute: async (args) => {
					result = args;
					return { ack: "UI review recorded." };
				},
			}),
		},
		stopWhen: stepCountIs(maxSteps),
		onStepFinish: ({ toolCalls }) => {
			if (toolCalls?.length > 0) {
				console.log(`  tools: ${toolCalls.map((t: any) => t.toolName).join(", ")}`);
			}
		},
	});
	costTracker.record("ui-reviewer", usage);

	if (!result) {
		console.warn("  UI reviewer skipped (no finish_ui_review call).");
		return { severity: "pass", findings: [], filesChecked: [] };
	}

	const r = result as UIReviewResult;
	if (r.severity === "blocking") {
		console.warn(`  UI review BLOCKING: ${r.findings.length} issue(s)`);
		for (const f of r.findings) console.warn(`    ${f}`);
	} else if (r.severity === "advisory") {
		console.log(`  UI review advisory: ${r.findings.length} minor issue(s)`);
	} else {
		console.log("  UI review: pass");
	}

	return r;
}
