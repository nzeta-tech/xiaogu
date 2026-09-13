export type ModelWritingStyleMode = "general" | "traffic" | "marketing";

export function resolveModelRequestTimeout(configuredSeconds: number, styleMode: ModelWritingStyleMode, overrideSeconds?: number) {
  return overrideSeconds ?? (styleMode === "traffic" ? Math.max(configuredSeconds, 180) : configuredSeconds);
}

export function isCapacityLimitedModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /(?:429|rate.?limit|concurrency limit)/i.test(message);
}
