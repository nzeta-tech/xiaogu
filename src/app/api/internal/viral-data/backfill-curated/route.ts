import { backfillCuratedViralContents } from "@/lib/curated-viral-backfill";

export const maxDuration = 300;

export async function POST(request: Request) {
  const expectedSecret = process.env.VIRAL_PREPARATION_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret) return Response.json({ error: "viral_preparation_secret_not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${expectedSecret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await backfillCuratedViralContents(), { headers: { "cache-control": "no-store" } });
}
