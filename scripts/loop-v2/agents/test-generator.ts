import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { runBashTool } from "../tools/bash";
import { readFileTool, writeFileTool } from "../tools/fs";
import { costTracker } from "../tools/cost";
import { loadAgentDef } from "./loader";

export async function runTestGenerator(
	model: any,
	taskDescription: string,
	maxSteps = 12,
): Promise<{ tests_created: string; files_modified: string[] }> {
	console.log("=> Test Generator");

	const def = loadAgentDef("test-generator.md");
	let result: { tests_created: string; files_modified: string[] } | null = null;

	const { usage } = await generateText({
		model,
		temperature: def.temperature,
		system: def.systemPrompt,
		prompt: `Task that was just implemented: "${taskDescription}"\n\nReview the changes with git diff HEAD, then generate or update tests for the modified code. Focus on behavior, not implementation details.`,
		tools: {
			read_file: readFileTool,
			write_file: writeFileTool,
			run_bash: runBashTool,
			finish_tests: tool({
				description: "Call this EXACTLY ONCE when finished generating tests.",
				inputSchema: z.object({
					tests_created: z.string().describe("Terse summary of tests written and what they cover. If no tests were needed, say so."),
					files_modified: z.array(z.string()).describe("Test file paths created or modified."),
				}),
				execute: async (args) => {
					result = args;
					return { ack: "Tests recorded." };
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
	costTracker.record("test-generator", usage);

	if (!result) {
		console.warn("  Test generator skipped (no finish_tests call).");
		return { tests_created: "No tests generated.", files_modified: [] };
	}

	console.log(`  tests: ${(result as { tests_created: string }).tests_created}`);
	return result;
}
