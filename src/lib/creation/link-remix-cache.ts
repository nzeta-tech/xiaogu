import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "@/lib/db/client";
import { isSourceInspectResult, type SourceInspectResult } from "@/lib/local-agent/contracts";

const CACHE_HOURS = 72;

function cacheIdentity(rawUrl: string) {
  const parsed = new URL(rawUrl.trim());
  parsed.hash = "";
  const sourceUrl = parsed.toString();
  return { sourceUrl, cacheKey: createHash("sha256").update(sourceUrl).digest("hex") };
}

export function normalizeLinkRemixCacheUrl(rawUrl: string) {
  return cacheIdentity(rawUrl).sourceUrl;
}

function reusableResult(value: unknown): SourceInspectResult | null {
  if (!isSourceInspectResult(value)) return null;
  const transcript = value.fields.source_transcript?.trim();
  if (!transcript) return null;
  return {
    status: "cached",
    finalUrl: value.finalUrl,
    thumbnailUrl: value.thumbnailUrl,
    fields: { ...value.fields, source_transcript: transcript },
    note: "已复用 72 小时内的作品解析和转写结果。",
  };
}

export async function getLinkRemixSourceCache(rawUrl: string) {
  const { cacheKey } = cacheIdentity(rawUrl);
  const result = await query<{ result: unknown; expires_at: string }>(
    `select result,expires_at from link_remix_source_cache where cache_key=$1 and expires_at>now() limit 1`,
    [cacheKey],
  ).catch(() => ({ rows: [] as Array<{ result: unknown; expires_at: string }> }));
  const cached = reusableResult(result.rows[0]?.result);
  return cached ? { result: cached, expiresAt: result.rows[0].expires_at } : null;
}

export async function getCachedLinkRemixSourceUrls(rawUrls: string[]) {
  const identities = rawUrls.flatMap((rawUrl) => {
    try { return [cacheIdentity(rawUrl)]; } catch { return []; }
  });
  if (!identities.length) return new Set<string>();
  const result = await query<{ cache_key: string; result: unknown }>(
    `select cache_key,result from link_remix_source_cache where cache_key=any($1::text[]) and expires_at>now()`,
    [identities.map((item) => item.cacheKey)],
  ).catch(() => ({ rows: [] as Array<{ cache_key: string; result: unknown }> }));
  const validKeys = new Set(result.rows.filter((row) => reusableResult(row.result)).map((row) => row.cache_key));
  return new Set(identities.filter((item) => validKeys.has(item.cacheKey)).map((item) => item.sourceUrl));
}

export async function saveLinkRemixSourceCache(client: PoolClient, rawUrl: string, value: unknown) {
  const result = reusableResult(value);
  if (!result) return false;
  const { sourceUrl, cacheKey } = cacheIdentity(rawUrl);
  await client.query(
    `insert into link_remix_source_cache(cache_key,source_url,result,expires_at)
     values($1,$2,$3,now()+($4||' hours')::interval)
     on conflict(cache_key) do update set source_url=excluded.source_url,result=excluded.result,
       updated_at=now(),expires_at=excluded.expires_at`,
    [cacheKey, sourceUrl, result, CACHE_HOURS],
  );
  return true;
}
