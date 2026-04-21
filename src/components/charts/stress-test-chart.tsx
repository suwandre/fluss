"use client";

import {
	BarChart,
	Bar,
	XAxis,
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

/** Transformed row for Recharts */
interface ChartRow {
	scenario: string;
	drawdown: number; // absolute value for bar length
	drawdown_pct: number; // signed original for tooltip
	recovery_days: number | null;
}

function toChartRow(r: StressResult): ChartRow {
	return {
		scenario: r.scenario,
		drawdown: Math.abs(r.simulated_drawdown_pct),
		drawdown_pct: r.simulated_drawdown_pct,
		recovery_days: r.recovery_days,
	};
}

function barFill(drawdownPct: number): string {
	return Math.abs(drawdownPct) > 15 ? "var(--red)" : "var(--bg-elevated)";
}

function CustomTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: Array<{ payload: ChartRow }>;
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
						Math.abs(item.drawdown_pct) > 15
							? "var(--red)"
							: "var(--text)",
				}}
			>
				Drawdown: {item.drawdown_pct.toFixed(1)}%
			</div>
			{item.recovery_days != null && (
				<div style={{ color: "var(--text-muted)" }}>
					Recovery: ~{item.recovery_days}d
				</div>
			)}
		</div>
	);
}

export function StressTestChart({ data }: StressTestChartProps) {
	if (!data.length) return null;

	const chartData = [...data]
		.map(toChartRow)
		.sort((a, b) => b.drawdown - a.drawdown);

	return (
		<div className="w-full" data-slot="stress-test-chart">
			<p className="text-[11px] text-text-dim font-sans mb-1">
				Historical disaster simulation: we replay past market crashes against your current portfolio to find hidden fragility.
			</p>
			<h3 className="text-[11px] font-mono text-text-muted mb-1 uppercase tracking-wider">
				Stress Test Results
			</h3>
			<p className="text-[11px] text-text-muted font-sans mb-2">
				Red bars = your portfolio would have lost more than 15%. Gray = manageable loss.
			</p>
			<ResponsiveContainer width="100%" height={chartData.length * 40 + 24}>
				<BarChart
					data={chartData}
					layout="vertical"
					margin={{ top: 8, right: 60, bottom: 8, left: 0 }}
				>
					<XAxis
						type="number"
						domain={[0, "auto"]}
						axisLine={false}
						tickLine={false}
						tick={false}
					/>
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
						dataKey="drawdown"
						radius={[0, 4, 4, 0]}
						barSize={20}
					>
						{chartData.map((entry, i) => (
							<Cell
								key={i}
								fill={barFill(entry.drawdown_pct)}
							/>
						))}
						<LabelList
							dataKey="drawdown"
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
            <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-text-muted">
                <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-1 rounded-sm bg-[var(--red)]" />
                    <span>drawdown {'>'} 15%</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="inline-block w-3 h-1 rounded-sm bg-[var(--bg-elevated)] border border-border" />
                    <span>manageable ({'<'} 15%)</span>
                </div>
            </div>
		</div>
	);
}
