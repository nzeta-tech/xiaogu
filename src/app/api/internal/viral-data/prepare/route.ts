import { runViralDataPreparation } from "@/lib/viral-data-task";

export const maxDuration = 300;

export async function POST(request: Request) {
  const expectedSecret = process.env.VIRAL_PREPARATION_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret) return Response.json({ error: "viral_preparation_secret_not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${expectedSecret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({})) as { force?: boolean; trigger?: string };
  const result = await runViralDataPreparation({ force: Boolean(payload.force), trigger: payload.trigger ?? "worker" });
  const status = result.started && "succeeded" in result && result.succeeded === false ? 502 : 200;
  return Response.json(result, { status, headers: { "cache-control": "no-store" } });
}
