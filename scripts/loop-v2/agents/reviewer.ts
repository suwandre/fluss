import { z } from "zod";
import { loadAgentDef } from "./loader";

export function getReviewerSystemPrompt(gitDiff: string, taskSummary: string): string {
	const def = loadAgentDef("code-reviewer.md");

	return `${def.systemPrompt}

# TASK CONTEXT
Builder summary: ${taskSummary}

# DIFF TO REVIEW
\`\`\`diff
${gitDiff}
\`\`\`

# OUTPUT REQUIREMENT
After your analysis, you MUST call the submit_review tool exactly once.
- status "LGTM": no Critical or Important issues found.
- status "NEEDS_FIX": Critical or Important issues exist. List them tersely in caveman_feedback.`;
}

export function getReviewerTemperature(): number {
	return loadAgentDef("code-reviewer.md").temperature;
}

export const submitReviewTool = {
	description: "Call this tool EXACTLY ONCE to submit your final review verdict.",
	inputSchema: z.object({
		status: z
			.enum(["LGTM", "NEEDS_FIX"])
			.describe("LGTM = good to ship. NEEDS_FIX = builder must revise."),
		caveman_feedback: z
			.string()
			.describe(
				'Terse feedback. If LGTM, empty or "Looks good." If NEEDS_FIX, list the issues.',
			),
	}),
};
