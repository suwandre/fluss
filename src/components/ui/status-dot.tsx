"use client";

import { cn } from "@/lib/utils";
import type { HealthState } from "@/lib/types/visual";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type StatusDotProps = {
	status: HealthState;
	size?: "sm" | "md";
	animate?: boolean;
	variant?: "filled" | "hollow";
	className?: string;
};

const sizeMap = { sm: "size-1.5", md: "size-2" } as const;

const colorMap: Record<HealthState, string> = {
	nominal: "bg-green shadow-[0_0_6px_var(--green-glow)]",
	warning: "bg-amber shadow-[0_0_6px_var(--amber-glow)]",
	critical: "bg-red shadow-[0_0_6px_var(--red-glow)]",
};

export function StatusDot({
	status,
	size = "md",
	animate = false,
	variant = "filled",
	className,
}: StatusDotProps) {
	const reducedMotion = useReducedMotion();
	const isHollow = variant === "hollow";
	const shouldAnimate = animate && !reducedMotion;

	return (
		<span
			data-slot="status-dot"
			role="status"
			aria-label={`${status} status`}
			className={cn(
				"shrink-0 rounded-full",
				sizeMap[size],
				isHollow ? "border-[1.5px] border-text-dim" : colorMap[status],
				shouldAnimate && "animate-dot-pulse",
				className,
			)}
		/>
	);
}
