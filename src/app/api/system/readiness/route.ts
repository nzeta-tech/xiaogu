import {
  hasMeteringConfig,
  hasImageModelConfig,
  hasLiveStripeConfig,
  hasModelConfig,
  hasStripeConfig,
  isDemoModeEnabled,
  isProductionRuntime,
} from "@/lib/config/runtime";
import { checkLinkRemixDependencies } from "@/lib/creation/dependency-health";
import { query } from "@/lib/db/client";

export async function GET() {
  const remixDependencies = await checkLinkRemixDependencies();
  const checks = [
    {
      key: "database",
      label: "PostgreSQL",
      ok: await canQueryDatabase(),
      required: true,
    },
    {
      key: "auth_secret",
      label: "AUTH_SECRET",
      ok: Boolean(process.env.AUTH_SECRET && process.env.AUTH_SECRET !== "replace-with-a-long-random-secret"),
      required: true,
    },
    {
      key: "model",
      label: "OpenAI-compatible model",
      ok: hasModelConfig(),
      required: true,
    },
    {
      key: "image_model",
      label: "Image generation model",
      ok: hasImageModelConfig(),
      required: true,
    },
    {
      key: "metering",
      label: "OpenMeter telemetry",
      ok: hasMeteringConfig() && await canReachMetering(),
      required: false,
    },
    {
      key: "stripe",
      label: "Stripe payment",
      ok: hasStripeConfig(),
      required: true,
    },
    {
      key: "stripe_live",
      label: "Stripe live mode",
      ok: !isProductionRuntime() || hasLiveStripeConfig(),
      required: process.env.APP_ENV === "production",
    },
    {
      key: "topic_source",
      label: "Hot topic source",
      ok: Boolean(process.env.DAILY_HOT_API_BASE || process.env.SEARCH_API_BASE),
      required: true,
    },
    {
      key: "demo_mode",
      label: "Demo mode disabled",
      ok: !isDemoModeEnabled(),
      required: true,
    },
    ...remixDependencies.filter((check) => check.key === "transcriber" || check.key === "yt_dlp").map((check) => ({
      key: check.key,
      label: check.label,
      ok: check.ok,
      required: true,
      error: check.error,
    })),
  ];

  const ready = checks.every((check) => !check.required || check.ok);

  return Response.json(
    {
      ready,
      environment: process.env.APP_ENV ?? process.env.NODE_ENV,
      productionRuntime: isProductionRuntime(),
      checks,
    },
    { status: ready ? 200 : 503 },
  );
}

async function canQueryDatabase() {
  try {
    await query("select 1");
    return true;
  } catch {
    return false;
  }
}

async function canReachMetering() {
  const baseUrl = process.env.OPENMETER_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.OPENMETER_API_KEY;
  if (!baseUrl || !apiKey) return false;
  try {
    const response = await fetch(`${baseUrl}/customers?limit=1`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
