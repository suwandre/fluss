import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { runBashTool } from "../tools/bash";
import { readFileTool, writeFileTool } from "../tools/fs";
import { costTracker } from "../tools/cost";
import { loadAgentDef } from "./loader";

export async function runSimplifier(
	model: any,
	maxSteps = 10,
): Promise<{ changes_made: string; files_modified: string[] }> {
	console.log("=> Simplifier");

	const def = loadAgentDef("simplify.md");
	let result: { changes_made: string; files_modified: string[] } | null = null;

	const { usage } = await generateText({
		model,
		temperature: def.temperature,
		system: def.systemPrompt,
		prompt: "Review the recent git changes and simplify where possible. Start with git diff HEAD.",
		tools: {
			read_file: readFileTool,
			write_file: writeFileTool,
			run_bash: runBashTool,
			finish_simplify: tool({
				description: "Call this EXACTLY ONCE when finished simplifying.",
				inputSchema: z.object({
					changes_made: z.string().describe("1-3 sentence terse summary of simplifications made, or 'No simplifications needed.'"),
					files_modified: z.array(z.string()).describe("File paths modified."),
				}),
				execute: async (args) => {
					result = args;
					return { ack: "Simplification recorded." };
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
	costTracker.record("simplifier", usage);

	if (!result) {
		console.warn("  Simplifier skipped (no finish_simplify call).");
		return { changes_made: "No simplifications performed.", files_modified: [] };
	}

	console.log(`  simplified: ${(result as { changes_made: string }).changes_made}`);
	return result;
}
