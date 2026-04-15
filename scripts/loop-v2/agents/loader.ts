import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface AgentDef {
	name: string;
	description: string;
	temperature: number;
	systemPrompt: string;
}

export function loadAgentDef(filename: string): AgentDef {
	const filePath = join(import.meta.dir, "prompts", filename);

	if (!existsSync(filePath)) {
		throw new Error(`Agent prompt not found: ${filePath}`);
	}

	const raw = readFileSync(filePath, "utf-8");
	const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

	if (!match) {
		return { name: filename, description: "", temperature: 0.7, systemPrompt: raw.trim() };
	}

	const [, frontmatter, body] = match;

	return {
		name: frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? filename,
		description: frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "",
		temperature: parseFloat(frontmatter.match(/^temperature:\s*([\d.]+)$/m)?.[1] ?? "0.7"),
		systemPrompt: body.trim(),
	};
}
