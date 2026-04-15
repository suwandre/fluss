import { tool } from "ai";
import { exec } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { extname, resolve } from "path";
import { promisify } from "util";
import { z } from "zod";

const execAsync = promisify(exec);

const BIOME_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json"]);
const PRETTIER_EXTENSIONS = new Set([".md", ".mdx"]);

async function autoFormat(fullPath: string): Promise<void> {
	const ext = extname(fullPath);
	if (BIOME_EXTENSIONS.has(ext)) {
		try {
			await execAsync(`bunx biome format --write "${fullPath}"`, { cwd: process.cwd() });
		} catch {
			// biome unavailable or failed — silent skip
		}
	} else if (PRETTIER_EXTENSIONS.has(ext)) {
		try {
			await execAsync(`npx prettier --write "${fullPath}"`, { cwd: process.cwd() });
		} catch {
			// prettier unavailable or failed — silent skip
		}
	}
}

export const readFileTool = tool({
	description: "Read the contents of a file",
	inputSchema: z.object({
		filePath: z
			.string()
			.describe("The absolute or relative path to the file to read"),
	}),
	execute: async ({ filePath }) => {
		try {
			const fullPath = resolve(process.cwd(), filePath);
			const content = readFileSync(fullPath, "utf-8");
			return { success: true, content };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	},
});

export const writeFileTool = tool({
	description: "Write content to a file, completely overwriting it",
	inputSchema: z.object({
		filePath: z
			.string()
			.describe("The absolute or relative path to the file to write"),
		content: z.string().describe("The complete content to write to the file"),
	}),
	execute: async ({ filePath, content }) => {
		try {
			const fullPath = resolve(process.cwd(), filePath);
			writeFileSync(fullPath, content, "utf-8");
			await autoFormat(fullPath);
			return { success: true, message: `Wrote ${filePath}` };
		} catch (error: any) {
			return { success: false, error: error.message };
		}
	},
});
