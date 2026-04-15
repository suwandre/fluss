import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";

export type TaskStatus = "incomplete" | "in_progress" | "complete" | "failed";

export interface Task {
	id: number;
	description: string;
	status: TaskStatus;
}

export interface ProgressEntry {
	taskId: number;
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
	if (existsSync(STATE_FILE)) {
		const data = readFileSync(STATE_FILE, "utf-8");
		return JSON.parse(data);
	}
	return { tasks: [], progress: [] };
}

export function saveState(state: State) {
	writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
	syncMarkdownFiles(state);
}

export function getNextTask(): Task | undefined {
	const state = loadState();
	return state.tasks.find(
		(t) => t.status === "incomplete" || t.status === "in_progress",
	);
}

export function markTaskFailed(taskId: number, reason: string) {
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

export function markTaskInProgress(taskId: number) {
	const state = loadState();
	const task = state.tasks.find((t) => t.id === taskId);
	if (task) {
		task.status = "in_progress";
		saveState(state);
	}
}

export function markTaskComplete(
	taskId: number,
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

	// Sync TASKS.md
	let tasksMdContent = "# Tasks\n\n";
	for (const task of state.tasks) {
		const checkbox =
			task.status === "complete" ? "[x]" : task.status === "failed" ? "[!]" : "[ ]";
		tasksMdContent += `- ${checkbox} **Task ${task.id}:** ${task.description}\n`;
	}
	writeFileSync(TASKS_MD, tasksMdContent, "utf-8");

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
