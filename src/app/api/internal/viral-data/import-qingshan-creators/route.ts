import { importQingshanCreators } from "@/lib/viral-creator-import";

export const maxDuration = 60;

export async function POST(request: Request) {
  const expectedSecret = process.env.VIRAL_PREPARATION_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret) return Response.json({ error: "viral_preparation_secret_not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${expectedSecret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  if (!payload) return Response.json({ error: "invalid_json" }, { status: 400 });
  const result = await importQingshanCreators(payload);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
