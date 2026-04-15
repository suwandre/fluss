import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { runBashTool } from "../tools/bash";
import { readFileTool, writeFileTool } from "../tools/fs";
import { costTracker } from "../tools/cost";
import { loadAgentDef } from "./loader";

export const finishCleanupTool = {
	description: "Call this EXACTLY ONCE when finished cleaning up the code.",
	inputSchema: z.object({
		changes_made: z
			.string()
			.describe("1-3 sentence summary of what was cleaned up. Be terse."),
		files_modified: z
			.array(z.string())
			.describe("List of file paths that were modified."),
	}),
};

export async function runSlopRemover(model: any, maxSteps = 10): Promise<{ changes_made: string; files_modified: string[] }> {
	console.log("=> Slop Remover");

	const def = loadAgentDef("ai-slop-remover.md");
	let cleanupResult: { changes_made: string; files_modified: string[] } | null = null;

	const { usage } = await generateText({
		model,
		temperature: def.temperature,
		system: def.systemPrompt,
		prompt: "Review the recent git changes and clean up any AI slop. Start with git diff HEAD.",
		tools: {
			read_file: readFileTool,
			write_file: writeFileTool,
			run_bash: runBashTool,
			finish_cleanup: tool({
				description: finishCleanupTool.description,
				inputSchema: finishCleanupTool.inputSchema,
				execute: async (args) => {
					cleanupResult = args;
					return { ack: "Cleanup recorded." };
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
	costTracker.record("slop-remover", usage);

	if (!cleanupResult) {
		console.warn("  Slop remover skipped (no finish_cleanup call).");
		return { changes_made: "No cleanup performed.", files_modified: [] };
	}

	console.log(`  cleaned: ${(cleanupResult as { changes_made: string }).changes_made}`);
	return cleanupResult;
}
