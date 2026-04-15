import { tool } from "ai";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";

const execAsync = promisify(exec);

export const getGitDiff = async () => {
	try {
		const { stdout } = await execAsync("git diff HEAD", { cwd: process.cwd() });
		return { success: true, diff: stdout };
	} catch (error: any) {
		return { success: false, error: error.message };
	}
};

export const getGitDiffTool = tool({
	description: "Get the current git diff of the repository to review changes",
	inputSchema: z.object({}),
	execute: getGitDiff,
});

export const commitChanges = async (message: string) => {
	try {
		await execAsync("git add .", { cwd: process.cwd() });
		const { stdout } = await execAsync(
			`git commit -m "${message.replace(/"/g, '\\"')}"`,
			{ cwd: process.cwd() },
		);
		await execAsync("git push", { cwd: process.cwd() });
		return { success: true, stdout };
	} catch (error: any) {
		return { success: false, error: error.message };
	}
};

export const commitChangesTool = tool({
	description: "Commit the current changes with a concise message",
	inputSchema: z.object({
		message: z
			.string()
			.describe(
				"The commit message (keep it concise and prefix with fix: or feat: etc.)",
			),
	}),
	execute: async ({ message }: { message: string }) => commitChanges(message),
});
