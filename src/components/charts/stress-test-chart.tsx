"use client";

import {
	BarChart,
	Bar,
	YAxis,
	Tooltip,
	ResponsiveContainer,
	Cell,
	LabelList,
} from "recharts";

interface StressResult {
	scenario: string;
	simulated_drawdown_pct: number;
	recovery_days: number | null;
}

interface StressTestChartProps {
	data: StressResult[];
}

/** Color for bars: --bg-elevated normally, --red when drawdown > 15% */
function barFill(drawdown: number): string {
	return drawdown > 15 ? "var(--red)" : "var(--bg-elevated)";
}

/** Custom tooltip styled with --bg-card, --border, --text */
function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: StressResult }>;
}) {
	if (!active || !payload?.length) return null;
	const item = payload[0].payload;

	return (
		<div
			className="rounded border px-3 py-2 text-[12px] font-mono shadow-lg"
			style={{
				background: "var(--bg-card)",
				borderColor: "var(--border)",
				color: "var(--text)",
			}}
		>
			<div className="font-medium mb-1" style={{ color: "var(--text)" }}>
				{item.scenario}
			</div>
			<div
				style={{
					color:
						item.simulated_drawdown_pct > 15 ? "var(--red)" : "var(--text)",
			}}
			>
				Drawdown: {item.simulated_drawdown_pct.toFixed(1)}%
			</div>
			{item.recovery_days != null && (
				<div style={{ color: "var(--text-muted)" }}>
					Recovery: ~{item.recovery_days}d
				</div>
			)}
		</div>
	);
}

/**
 * Horizontal Recharts BarChart consuming RiskOutput.stress_results.
 * Dark theme, --bg-elevated bars, --red for drawdown > 15% (V §4.13).
 * X-axis hidden — value labels on bars replace it.
 */
export function StressTestChart({ data }: StressTestChartProps) {
	if (!data.length) return null;

	// Sort by drawdown descending for visual impact
	const sorted = [...data].sort(
		(a, b) => b.simulated_drawdown_pct - a.simulated_drawdown_pct,
	);

	return (
		<div className="w-full" data-slot="stress-test-chart">
			<h3 className="text-[11px] font-mono text-text-muted mb-2 uppercase tracking-wider">
				Stress Test Results
			</h3>
			<ResponsiveContainer width="100%" height={sorted.length * 40 + 24}>
				<BarChart
					data={sorted}
					layout="vertical"
					margin={{ top: 8, right: 60, bottom: 8, left: 0 }}
				>
					<YAxis
						type="category"
						dataKey="scenario"
						tick={{
							fill: "var(--text-muted)",
							fontSize: 11,
							fontFamily: "var(--font-sans)",
						}}
						axisLine={false}
						tickLine={false}
						width={140}
					/>
					<Tooltip
						content={<CustomTooltip />}
						cursor={{ fill: "var(--bg-elevated)", opacity: 0.3 }}
					/>
					<Bar
						dataKey="simulated_drawdown_pct"
						radius={[0, 4, 4, 0]}
						barSize={20}
					>
						{sorted.map((entry, i) => (
							<Cell key={i} fill={barFill(entry.simulated_drawdown_pct)} />
						))}
						<LabelList
							dataKey="simulated_drawdown_pct"
							position="right"
							formatter={(v) => `-${Number(v).toFixed(1)}%`}
							style={{
								fill: "var(--text)",
								fontSize: 11,
								fontFamily: "var(--font-mono)",
							}}
						/>
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</div>
	);
}