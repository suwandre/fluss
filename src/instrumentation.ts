export async function register() {
	// Only run in Node.js runtime (not Edge). Start the cron scheduler
	// in production only — dev hot-reload would spawn duplicate schedulers.
	if (
		process.env.NEXT_RUNTIME === "nodejs" &&
		process.env.NODE_ENV === "production"
	) {
		// Dynamic import avoids Edge Runtime analysis of node-cron / crypto.
		const { startScheduler } = await import("@/lib/orchestrator/scheduler");
		// Defer to next tick so the server is fully initialized before the
		// first cron tick can fire.
		setTimeout(() => {
			startScheduler();
		}, 1000);
	}
}
