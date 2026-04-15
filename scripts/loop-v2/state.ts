import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

export type TaskStatus = "incomplete" | "in_progress" | "complete" | "failed";

export interface Task {
	id: string;
	description: string;
	status: TaskStatus;
}

export interface ProgressEntry {
	taskId: string;
	summary: string;
	gotchas?: string;
	timestamp: string;
}

export interface State {
	tasks: Task[];
	progress: ProgressEntry[];
}

const STATE_FILE = resolve(process.cwd(), "tasks.json");
const TASKS_MD = resolve(process.cwd(), "tasks/TASKS.md");
const PROGRESS_MD = resolve(process.cwd(), "tasks/progress.md");

function ensureDirectories() {
	const tasksDir = dirname(TASKS_MD);
	if (!existsSync(tasksDir)) {
		mkdirSync(tasksDir, { recursive: true });
	}
}

export function loadState(): State {
	const state: State = { tasks: [], progress: [] };
	
	// Load tasks from TASKS.md
	if (existsSync(TASKS_MD)) {
		const content = readFileSync(TASKS_MD, "utf-8");
		const lines = content.split("\n");
		for (const line of lines) {
			const match = line.match(/^- \[( |x|!)\] \*\*([^]+?)\*\* (.*)$/);
			if (match) {
				const checkbox = match[1] || " ";
				state.tasks.push({
					id: match[2] || "",
					description: match[3] || "",
					status: checkbox === "x" ? "complete" : checkbox === "!" ? "failed" : "incomplete"
				});
			}
		}
	}

	// Load progress from tasks.json if it exists (for logs)
	if (existsSync(STATE_FILE)) {
		try {
			const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
			if (data && data.progress) {
				state.progress = data.progress;
			}
		} catch (_ignore) {
			// ignore
		}
	}
	
	return state;
}

export function saveState(state: State) {
	// Save progress back to tasks.json safely
	writeFileSync(STATE_FILE, JSON.stringify({ progress: state.progress }, null, 2), "utf-8");
	syncMarkdownFiles(state);
}

export function getNextTask(): Task | undefined {
	const state = loadState();
	return state.tasks.find(
		(t) => t.status === "incomplete" || t.status === "in_progress",
	);
}

export function markTaskFailed(taskId: string, reason: string) {
	const state = loadState();
	const task = state.tasks.find((t) => t.id === taskId);
	if (task) {
		task.status = "failed";
		state.progress.push({
			taskId,
			summary: `FAILED: ${reason}`,
			timestamp: new Date().toISOString(),
		});
		saveState(state);
	}
}

export function markTaskInProgress(taskId: string) {
	const state = loadState();
	const task = state.tasks.find((t) => t.id === taskId);
	if (task) {
		task.status = "in_progress";
		saveState(state);
	}
}

export function markTaskComplete(
	taskId: string,
	summary: string,
	gotchas?: string,
) {
	const state = loadState();
	const taskIndex = state.tasks.findIndex((t) => t.id === taskId);
	if (taskIndex !== -1) {
		const task = state.tasks[taskIndex];
		if (task) {
			task.status = "complete";
			state.progress.push({
				taskId,
				summary,
				gotchas,
				timestamp: new Date().toISOString(),
			});
			saveState(state);
		}
	}
}

function syncMarkdownFiles(state: State) {
	ensureDirectories();

	// Sync TASKS.md by just updating checkboxes to preserve formatting
	if (existsSync(TASKS_MD)) {
		let content = readFileSync(TASKS_MD, "utf-8");
		const lines = content.split("\n");
		
		for (let i = 0; i < lines.length; i++) {
			const match = lines[i].match(/^- \[( |x|!)\] \*\*([^]+?)\*\*(.*)$/);
			if (match) {
				const id = match[2];
				const task = state.tasks.find(t => t.id === id);
				if (task) {
					const char = task.status === "complete" ? "x" : task.status === "failed" ? "!" : " ";
					lines[i] = `- [${char}] **${id}**${match[3]}`;
				}
			}
		}
		writeFileSync(TASKS_MD, lines.join("\n"), "utf-8");
	}

	// Sync progress.md
	let progressMdContent = "# Progress Log\n\n";
	for (const entry of state.progress) {
		const task = state.tasks.find((t) => t.id === entry.taskId);
		progressMdContent += `## Task ${entry.taskId} (${new Date(entry.timestamp).toLocaleString()})\n`;
		if (task) progressMdContent += `**Description:** ${task.description}\n\n`;
		progressMdContent += `**Summary:**\n${entry.summary}\n\n`;
		if (entry.gotchas) {
			progressMdContent += `**Gotchas:**\n${entry.gotchas}\n\n`;
		}
		progressMdContent += "---\n\n";
	}
	writeFileSync(PROGRESS_MD, progressMdContent, "utf-8");
}
