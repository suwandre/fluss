import { createOpenAI } from "@ai-sdk/openai";
import { exec } from "child_process";
import { promisify } from "util";
import { generateText, stepCountIs, tool } from "ai";
import { BUILDER_TEMPERATURE, finishTaskTool, getBuilderPrompt } from "./agents/builder";
import { getReviewerSystemPrompt, getReviewerTemperature, submitReviewTool } from "./agents/reviewer";
import { runSlopRemover } from "./agents/slop-remover";
import { runSimplifier } from "./agents/simplifier";
import { runTestGenerator } from "./agents/test-generator";
import { diffHasUIChanges, runUIReviewer } from "./agents/ui-reviewer";
import {
	getNextTask,
	markTaskComplete,
	markTaskFailed,
	markTaskInProgress,
	type Task,
} from "./state";
import { runBashTool } from "./tools/bash";
import { readFileTool, writeFileTool } from "./tools/fs";
import { commitChanges, getGitDiff } from "./tools/git";
import { loadMCPTools, queryKnowledge, recordKnowledge } from "./tools/mcp";
import { costTracker } from "./tools/cost";

const execAsync = promisify(exec);

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1";
const MODEL_NAME = process.env.OLLAMA_MODEL || "glm-5.1:cloud";
const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 3);
const BUILDER_MAX_STEPS = Number(process.env.BUILDER_MAX_STEPS ?? 100);
const REVIEWER_MAX_STEPS = Number(process.env.REVIEWER_MAX_STEPS ?? 5);
const SLOP_MAX_STEPS = Number(process.env.SLOP_MAX_STEPS ?? 10);
const DIFF_MAX_CHARS = Number(process.env.DIFF_MAX_CHARS ?? 8000);

const ollamaProvider = createOpenAI({
	baseURL: OLLAMA_BASE_URL,
	apiKey: "ollama",
});

const model = ollamaProvider.chat(MODEL_NAME);

function truncateDiff(diff: string): string {
	if (diff.length <= DIFF_MAX_CHARS) return diff;
	const truncated = diff.slice(0, DIFF_MAX_CHARS);
	return `${truncated}\n\n... [diff truncated at ${DIFF_MAX_CHARS} chars — ${diff.length - DIFF_MAX_CHARS} chars omitted]`;
}

async function revertWorkingTree() {
	await execAsync("git checkout -- .", { cwd: process.cwd() }).catch(() => {});
	await execAsync("git clean -fd", { cwd: process.cwd() }).catch(() => {});
}

async function runLoop() {
	console.log(`\nFluss Loop v2 — model: ${MODEL_NAME}`);
	console.log(`  builder temp: ${BUILDER_TEMPERATURE} | max steps: builder=${BUILDER_MAX_STEPS} reviewer=${REVIEWER_MAX_STEPS}`);

	console.log("\nLoading MCP tools...");
	const mcpTools = await loadMCPTools();
	const mcpToolCount = Object.keys(mcpTools).length;
	console.log(`MCP tools loaded: ${mcpToolCount > 0 ? Object.keys(mcpTools).join(", ") : "none"}\n`);

	while (true) {
		const task = getNextTask();
		if (!task) {
			console.log("All tasks complete. Exiting.");
			break;
		}

		console.log(`\n================================`);
		console.log(`Task ${task.id}: ${task.description}`);
		console.log(`================================`);

		markTaskInProgress(task.id);
		costTracker.markCycleStart();

		// Query knowledge base for relevant context before starting
		console.log("  Querying prior knowledge...");
		const priorKnowledge = await queryKnowledge(task.description);
		if (priorKnowledge) {
			console.log("  Prior knowledge found — injecting into builder prompt.");
		}

		let reviewerFeedback: string | undefined;
		let taskDone = false;

		for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
			console.log(`\n-- Attempt ${attempt}/${MAX_RETRIES} --`);

			const builderResult = await runBuilder(task, mcpTools, reviewerFeedback, priorKnowledge || undefined);

			if (builderResult.status === "FAILED") {
				console.error(`Builder failed: ${builderResult.caveman_summary}`);
				break;
			}

			if (builderResult.tests_passed === false) {
				console.warn("Builder reported tests did NOT pass — treating as NEEDS_FIX.");
				reviewerFeedback = "Typecheck/build failed. Fix all type errors and build errors before finishing.";
				if (attempt < MAX_RETRIES) {
					await revertWorkingTree();
				}
				continue;
			}

			// Clean up AI slop before reviewer sees the diff
			await runSlopRemover(model, SLOP_MAX_STEPS);

			// UI review for .tsx changes — blocking issues short-circuit to retry
			if (await diffHasUIChanges()) {
				const uiReview = await runUIReviewer(model);
				if (uiReview.severity === "blocking") {
					reviewerFeedback = `UI guideline violations (fix before shipping):\n${uiReview.findings.join("\n")}`;
					if (attempt < MAX_RETRIES) {
						await revertWorkingTree();
					}
					continue;
				}
			}

			const gitDiff = await getGitDiff();
			const rawDiff: string = gitDiff.success ? (gitDiff.diff ?? "") : "";

			if (!rawDiff.trim()) {
				console.log("No changes detected. Marking complete with warning.");
				markTaskComplete(
					task.id,
					builderResult.caveman_summary as string,
					"WARNING: No code changes made.",
				);
				taskDone = true;
				break;
			}

			const diffString = truncateDiff(rawDiff);
			if (diffString.length < rawDiff.length) {
				console.log(`  Diff truncated: ${rawDiff.length} → ${diffString.length} chars`);
			}

			const reviewerResult = await runReviewer(diffString, builderResult.caveman_summary as string);

			if (reviewerResult.status === "LGTM") {
				console.log("Reviewer: LGTM.");

				// Simplify structure before commit
				await runSimplifier(model, SLOP_MAX_STEPS);

				// Generate/update tests for changed code
				await runTestGenerator(model, task.description, SLOP_MAX_STEPS + 2);

				const commitMsg = `feat(task-${task.id}): ${(builderResult.caveman_summary as string).substring(0, 50)}`;
				const commitResult = await commitChanges(commitMsg);
				if (!commitResult.success) {
					console.error(`Commit/push failed: ${commitResult.error}`);
				}
				markTaskComplete(
					task.id,
					builderResult.caveman_summary as string,
					builderResult.gotchas as string | undefined,
				);
				await recordKnowledge("learning", `Task ${task.id}: ${builderResult.caveman_summary as string}`);
				if (builderResult.gotchas) {
					await recordKnowledge("note", `Task ${task.id} gotchas: ${builderResult.gotchas as string}`);
				}
				taskDone = true;
				break;
			}

			// NEEDS_FIX — save feedback, revert, retry
			reviewerFeedback = reviewerResult.caveman_feedback as string;
			console.warn(`Reviewer rejected: ${reviewerFeedback}`);

			if (attempt < MAX_RETRIES) {
				console.log("Reverting changes for retry...");
				await revertWorkingTree();
			}
		}

		if (!taskDone) {
			console.error(`Task ${task.id} exhausted ${MAX_RETRIES} attempts.`);
			markTaskFailed(task.id, reviewerFeedback ?? "Exhausted retries without LGTM.");
			break;
		}

		// Print per-task cost summary
		costTracker.cycleSummary();
	}

	costTracker.sessionSummary();
}

async function runBuilder(
	task: Task,
	mcpTools: Record<string, any>,
	reviewerFeedback?: string,
	priorKnowledge?: string,
) {
	console.log(`=> Builder${reviewerFeedback ? " (retry with feedback)" : ""}`);

	let finishResult: any = null;

	const { text, usage } = await generateText({
		model,
		temperature: BUILDER_TEMPERATURE,
		system: getBuilderPrompt(task.description, reviewerFeedback, priorKnowledge),
		prompt: "Start your work. Call finish_task when done.",
		tools: {
			read_file: readFileTool,
			write_file: writeFileTool,
			run_bash: runBashTool,
			finish_task: tool({
				description: finishTaskTool.description,
				inputSchema: finishTaskTool.inputSchema,
				execute: async (args) => {
					finishResult = args;
					return { ack: "Task finished recorded." };
				},
			}),
			...mcpTools,
		},
		stopWhen: stepCountIs(BUILDER_MAX_STEPS),
		onStepFinish: ({ toolCalls }) => {
			if (toolCalls?.length > 0) {
				console.log(`  tools: ${toolCalls.map((t: any) => t.toolName).join(", ")}`);
			}
		},
	});

	costTracker.record("builder", usage);

	if (!finishResult) {
		return {
			status: "FAILED",
			tests_passed: false,
			caveman_summary: "Builder stopped before finish_task. Output: " + text.substring(0, 100),
		};
	}

	return finishResult;
}

async function runReviewer(gitDiff: string, taskSummary: string) {
	console.log("=> Reviewer");

	let reviewResult: any = null;

	const { usage } = await generateText({
		model,
		temperature: getReviewerTemperature(),
		system: getReviewerSystemPrompt(gitDiff, taskSummary),
		prompt: "Analyze the diff and submit your review via submit_review.",
		tools: {
			run_bash: runBashTool,
			submit_review: tool({
				description: submitReviewTool.description,
				inputSchema: submitReviewTool.inputSchema,
				execute: async (args) => {
					reviewResult = args;
					return { ack: "Review recorded." };
				},
			}),
		},
		stopWhen: stepCountIs(REVIEWER_MAX_STEPS),
		onStepFinish: ({ toolCalls }) => {
			if (toolCalls?.length > 0) {
				console.log(`  tools: ${toolCalls.map((t: any) => t.toolName).join(", ")}`);
			}
		},
	});

	costTracker.record("reviewer", usage);

	if (!reviewResult) {
		return {
			status: "NEEDS_FIX",
			caveman_feedback: "Reviewer failed to call submit_review.",
		};
	}

	return reviewResult;
}

runLoop().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
