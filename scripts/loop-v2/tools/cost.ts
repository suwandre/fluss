// GLM 5.1 pricing (cloud): $1.40 / 1M input tokens, $4.40 / 1M output tokens
const PRICE_INPUT_PER_M = 1.4;
const PRICE_OUTPUT_PER_M = 4.4;

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
}

export interface CostEntry {
	agent: string;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
}

function calcCost(u: TokenUsage): number {
	return (u.inputTokens / 1_000_000) * PRICE_INPUT_PER_M +
		(u.outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;
}

class CostTracker {
	private entries: CostEntry[] = [];
	private cycleStart = 0;

	record(agent: string, usage: TokenUsage): number {
		const costUsd = calcCost(usage);
		this.entries.push({ agent, ...usage, costUsd });
		console.log(
			`  [cost] ${agent}: in=${usage.inputTokens.toLocaleString()} out=${usage.outputTokens.toLocaleString()} $${costUsd.toFixed(4)}`,
		);
		return costUsd;
	}

	markCycleStart(): void {
		this.cycleStart = this.entries.length;
	}

	cycleSummary(): void {
		const cycleEntries = this.entries.slice(this.cycleStart);
		const total = cycleEntries.reduce((s, e) => s + e.costUsd, 0);
		console.log(`  [cost] task total: $${total.toFixed(4)}`);
	}

	sessionSummary(): void {
		const totalIn = this.entries.reduce((s, e) => s + e.inputTokens, 0);
		const totalOut = this.entries.reduce((s, e) => s + e.outputTokens, 0);
		const totalCost = this.entries.reduce((s, e) => s + e.costUsd, 0);
		console.log(`\n[session cost] in=${totalIn.toLocaleString()} out=${totalOut.toLocaleString()} total=$${totalCost.toFixed(4)}`);
	}
}

export const costTracker = new CostTracker();
