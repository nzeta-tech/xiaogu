import { query } from "@/lib/db/client";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { decryptSettingSecret } from "@/lib/security/secrets";
import { isCapacityLimitedModelError } from "@/lib/agent/model-runtime-policy";

const state = globalThis as typeof globalThis & { xiaoguModelCircuit?: { failures: number; openUntil: number } };

export async function getModelRuntime() {
  const settings = (await tryGetSystemSettings()).runtime;
  const inheritedFallback = settings.modelFallbackEnabled && Boolean(settings.fallbackModel) ? {
    baseUrl: settings.fallbackBaseUrl || process.env.MODEL_API_BASE || "https://api.openai.com/v1",
    model: settings.fallbackModel,
    apiKey: decryptSettingSecret(settings.fallbackApiKeyEncrypted) || process.env.MODEL_API_KEY,
  } : null;
  return {
    settings,
    fallback: inheritedFallback,
    circuitOpen: settings.circuitBreakerEnabled && (state.xiaoguModelCircuit?.openUntil ?? 0) > Date.now(),
  };
}

export async function recordModelRuntime(input: { provider: string; model: string; outcome: "success" | "error" | "timeout" | "fallback"; latencyMs: number; error?: unknown; settings: Awaited<ReturnType<typeof getModelRuntime>>["settings"] }) {
  const runtime = state.xiaoguModelCircuit ?? { failures: 0, openUntil: 0 };
  const errorMessage = input.error instanceof Error ? input.error.message : String(input.error ?? "");
  const capacityLimited = isCapacityLimitedModelError(input.error);
  if (input.outcome === "success") {
    runtime.failures = 0;
    runtime.openUntil = 0;
  } else if (capacityLimited) {
    if (input.settings.circuitBreakerEnabled) runtime.openUntil = Date.now() + Math.min(input.settings.circuitCooldownSeconds, 90) * 1000;
  } else {
    runtime.failures += 1;
    if (input.settings.circuitBreakerEnabled && runtime.failures >= input.settings.circuitFailureThreshold) runtime.openUntil = Date.now() + input.settings.circuitCooldownSeconds * 1000;
  }
  state.xiaoguModelCircuit = runtime;
  await query(
    `insert into model_runtime_events(provider,model,outcome,latency_ms,error_message,metadata)
     values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [input.provider, input.model, input.outcome, input.latencyMs, errorMessage.slice(0, 500), JSON.stringify({ circuitFailures: runtime.failures, circuitOpenUntil: runtime.openUntil || null, capacityLimited })],
  ).catch(() => undefined);
}

export async function listModelRuntimeEvents(limit = 30) {
  const result = await query<{ id: string; provider: string; model: string; outcome: string; latency_ms: number; error_message: string; created_at: string }>(
    "select id,provider,model,outcome,latency_ms,error_message,created_at from model_runtime_events order by created_at desc limit $1",
    [Math.min(Math.max(limit, 1), 100)],
  );
  return { events: result.rows, circuit: state.xiaoguModelCircuit ?? { failures: 0, openUntil: 0 } };
}

export function modelTimeoutSignal(seconds: number) {
  return AbortSignal.timeout(Math.max(5, seconds) * 1000);
}

export function isTimeoutError(error: unknown) {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}
