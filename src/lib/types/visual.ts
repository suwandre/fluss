export type HealthState = "nominal" | "warning" | "critical";

export const ASSET_CLASSES = ["equity", "etf", "crypto", "bond", "fx"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export type AgentStatus = "done" | "running" | "queued" | "skipped" | "error";

export type VolatilityLabel = "Low" | "Med" | "High" | "V.High";
