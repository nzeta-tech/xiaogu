import {
  hasMeteringConfig,
  hasModelConfig,
  hasStripeConfig,
  isDemoModeEnabled,
  isProductionRuntime,
} from "@/lib/config/runtime";
import { query } from "@/lib/db/client";

export async function GET() {
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
      key: "metering",
      label: "OpenMeter quota billing",
      ok: hasMeteringConfig(),
      required: true,
    },
    {
      key: "stripe",
      label: "Stripe payment",
      ok: hasStripeConfig(),
      required: true,
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
