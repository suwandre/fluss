"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the user has enabled "prefers-reduced-motion" in their OS.
 * Use this hook to conditionally skip JS-driven animations or apply
 * alternative static rendering.
 *
 * CSS animations/transitions are already suppressed by the
 * `@media (prefers-reduced-motion: reduce)` rule in animations.css.
 * This hook covers cases where React state drives animation behaviour
 * (e.g. conditional rendering of animated elements).
 */
export function useReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(mql.matches);

		const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, []);

	return reduced;
}
