"use client";

import { useMemo } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { SectorExposureResult } from "@/hooks/use-sector-exposure";

interface SectorHeatmapModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	data: SectorExposureResult | null;
}

function SectorBlock({
	sector,
	weight,
}: {
	sector: string;
	weight: number;
}) {
	const opacity = Math.min(0.2 + (weight / 100) * 0.8, 1);
	return (
		<div
			className="relative w-full rounded border border-border/40 px-3 py-2 transition-all hover:border-teal/60 group"
			style={{ backgroundColor: `rgba(20, 184, 166, ${opacity})` }}
		>
			<div className="flex items-center justify-between">
				<span className="text-[11px] font-medium text-text truncate">{sector}</span>
				<span className="text-[11px] font-mono text-text-dim">{weight.toFixed(1)}%</span>
			</div>
			{/* Tooltip on hover */}
			<div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
				<div className="bg-bg-card border border-border rounded px-2 py-1 shadow-lg whitespace-nowrap">
					<span className="text-[11px] font-mono text-text">{sector}: {weight.toFixed(2)}%</span>
				</div>
			</div>
		</div>
	);
}

function SectorColumn({
	title,
	weights,
}: {
	title: string;
	weights: Record<string, number>;
}) {
	const sectors = useMemo(() => {
		const all = Object.keys(weights).sort();
		return all.map((s) => ({ sector: s, weight: weights[s] }));
	}, [weights]);

	const hasData = sectors.length > 0;

	return (
		<div className="flex flex-col gap-2 flex-1">
			<h3 className="text-[11px] font-mono text-text-dim uppercase tracking-wide mb-1">{title}</h3>
			{hasData ? (
				<div className="flex flex-col gap-1.5">
					{sectors.map((s) => (
						<SectorBlock key={s.sector} sector={s.sector} weight={s.weight} />
					))}
				</div>
			) : (
				<div className="rounded border border-border/30 bg-bg-elevated p-4 text-center">
					<p className="text-[11px] text-text-muted italic">
						Run agents to see proposed allocation
					</p>
				</div>
			)}
		</div>
	);
}

export function SectorHeatmapModal({
	open,
	onOpenChange,
	data,
}: SectorHeatmapModalProps) {
	// Build union of sectors so both columns show same set, with 0% for missing ones
	const { current, proposed } = useMemo(() => {
		const c = data?.current ?? {};
		const p = data?.proposed ?? {};
		const allSectors = Array.from(new Set([...Object.keys(c), ...Object.keys(p)])).sort();

		const currentMerged: Record<string, number> = {};
		const proposedMerged: Record<string, number> = {};

		for (const s of allSectors) {
			currentMerged[s] = c[s] ?? 0;
			proposedMerged[s] = p[s] ?? 0;
		}

		return { current: currentMerged, proposed: proposedMerged };
	}, [data]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Sector Exposure</DialogTitle>
				</DialogHeader>
				<div className="flex gap-4 overflow-y-auto max-h-[70vh] pr-1">
					<SectorColumn title="Current Portfolio" weights={current} />
					<SectorColumn title="Proposed Allocation" weights={proposed} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
