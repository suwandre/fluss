import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { jsonSchema, tool } from "ai";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface MCPServerConfig {
	name: string;
	command: string;
	args: string[];
}

// sequential-thinking: forces step-by-step reasoning — critical for local models
// context7: live library docs — useful when builder works with external packages
// qmd: project knowledge base — builder can query past learnings/gotchas
const MCP_SERVERS: MCPServerConfig[] = [
	{
		name: "sequential-thinking",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
	},
	{
		name: "context7",
		command: "npx",
		args: ["-y", "@upstash/context7-mcp@latest"],
	},
	{
		name: "qmd",
		command: "qmd",
		args: ["mcp"],
	},
	{
		name: "playwright",
		command: "npx",
		args: ["-y", "@playwright/mcp@latest"],
	},
];

async function connectServer(config: MCPServerConfig): Promise<Record<string, any>> {
	const transport = new StdioClientTransport({
		command: config.command,
		args: config.args,
	});

	const client = new Client(
		{ name: "fluss-loop-v2", version: "1.0.0" },
		{ capabilities: {} },
	);

	await client.connect(transport);

	const { tools: mcpTools } = await client.listTools();
	const toolsMap: Record<string, any> = {};

	for (const mcpTool of mcpTools) {
		toolsMap[mcpTool.name] = tool({
			description: mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
			inputSchema: jsonSchema(mcpTool.inputSchema as Parameters<typeof jsonSchema>[0]),
			execute: async (args) => {
				try {
					const result = await client.callTool({
						name: mcpTool.name,
						arguments: args as Record<string, unknown>,
					});
					return result.content;
				} catch (err: any) {
					return { error: err.message };
				}
			},
		});
	}

	return toolsMap;
}

/**
 * Query the qmd knowledge base for context relevant to a task.
 * Returns a trimmed string of results, or empty string if unavailable.
 */
export async function queryKnowledge(taskDescription: string): Promise<string> {
	try {
		const { stdout } = await execAsync(
			`qmd query ${JSON.stringify(taskDescription)} --limit 3`,
			{ cwd: process.cwd() },
		);
		return stdout.trim();
	} catch {
		return "";
	}
}

/**
 * Record a task learning/gotcha to the qmd knowledge base.
 * Silently skips if qmd is not installed.
 */
export async function recordKnowledge(
	type: "learning" | "issue" | "note",
	content: string,
): Promise<void> {
	try {
		// Detect project name from git remote, fallback to folder name
		const { stdout: remoteUrl } = await execAsync("git remote get-url origin", {
			cwd: process.cwd(),
		}).catch(() => ({ stdout: "" }));

		const projectName =
			remoteUrl.trim().match(/\/([^/]+?)(?:\.git)?$/)?.[1] ??
			process.cwd().split(/[\\/]/).pop() ??
			"fluss";

		const knowledgeDir = `${process.env.HOME ?? process.env.USERPROFILE}/.ai-knowledges/${projectName}`;
		const date = new Date().toISOString().split("T")[0];
		const slug = content
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.slice(0, 40)
			.replace(/-$/, "");
		const filePath = `${knowledgeDir}/learnings/${date}-${slug}.md`;

		const body = `# ${type}: ${content}\n\n_Recorded by fluss-loop-v2 on ${new Date().toISOString()}_\n`;

		await execAsync(`mkdir -p "${knowledgeDir}/learnings" "${knowledgeDir}/issues"`);
		const fs = await import("fs");
		fs.writeFileSync(filePath, body, "utf-8");

		// Re-index so it's immediately searchable
		await execAsync("qmd embed", { cwd: process.cwd() }).catch(() => {});
	} catch {
		// qmd not installed or collection not set up — skip silently
	}
}

export async function loadMCPTools(): Promise<Record<string, any>> {
	const allTools: Record<string, any> = {};

	for (const server of MCP_SERVERS) {
		try {
			console.log(`  MCP: starting ${server.name}...`);
			const tools = await connectServer(server);
			Object.assign(allTools, tools);
			console.log(`  MCP: ${server.name} ready (${Object.keys(tools).length} tools)`);
		} catch (err: any) {
			console.warn(`  MCP: ${server.name} failed — ${err.message}`);
		}
	}

	return allTools;
}
