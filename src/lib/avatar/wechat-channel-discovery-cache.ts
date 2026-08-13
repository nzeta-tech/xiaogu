import { createHash } from "node:crypto";
import { isDatabaseConfigured, query } from "../db/client.ts";

type CacheScope = "account" | "page";

const inFlight = new Map<string, Promise<unknown>>();
const REFRESH_LEASE_SECONDS = 45;
const REFRESH_WAIT_MS = 45_000;

function cacheKey(scope: CacheScope, identity: string) {
  return createHash("sha256").update(`${scope}:${identity}`).digest("hex");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function readCache(key: string) {
  if (!isDatabaseConfigured()) return null;
  const result = await query<{ payload: unknown }>(
    `select payload from wechat_channel_discovery_cache
     where cache_key=$1 and payload is not null and (expires_at is null or expires_at>now()) limit 1`,
    [key],
  ).catch(() => ({ rows: [] as Array<{ payload: unknown }> }));
  return objectValue(result.rows[0]?.payload);
}

async function acquireRefreshLease(key: string, scope: CacheScope) {
  if (!isDatabaseConfigured()) return true;
  const result = await query<{ cache_key: string }>(
    `insert into wechat_channel_discovery_cache(cache_key,cache_scope,payload,refresh_until,expires_at)
     values($1,$2,null,now()+($3||' seconds')::interval,now())
     on conflict(cache_key) do update set refresh_until=excluded.refresh_until,updated_at=now()
     where wechat_channel_discovery_cache.refresh_until is null
        or wechat_channel_discovery_cache.refresh_until<=now()
     returning cache_key`,
    [key, scope, REFRESH_LEASE_SECONDS],
  ).catch(() => ({ rows: [{ cache_key: key }] }));
  return Boolean(result.rows[0]);
}

async function waitForRefresh(key: string) {
  const deadline = Date.now() + REFRESH_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const cached = await readCache(key);
    if (cached) return cached;
  }
  return null;
}

async function saveCache(key: string, scope: CacheScope, payload: Record<string, unknown>, ttlSeconds: number | null) {
  if (!isDatabaseConfigured()) return;
  await query(
    `insert into wechat_channel_discovery_cache(cache_key,cache_scope,payload,refresh_until,expires_at)
     values($1,$2,$3,null,case when $4::integer is null then null else now()+($4||' seconds')::interval end)
     on conflict(cache_key) do update set cache_scope=excluded.cache_scope,payload=excluded.payload,
       refresh_until=null,updated_at=now(),expires_at=excluded.expires_at`,
    [key, scope, payload, ttlSeconds],
  ).catch(() => undefined);
}

export async function updateWechatChannelDiscoveryCache(input: { scope: CacheScope; identity: string; payload: Record<string, unknown>; ttlSeconds: number | null }) {
  await saveCache(cacheKey(input.scope, input.identity), input.scope, input.payload, input.ttlSeconds);
}

async function releaseRefreshLease(key: string) {
  if (!isDatabaseConfigured()) return;
  await query(
    `update wechat_channel_discovery_cache set refresh_until=null,updated_at=now()
     where cache_key=$1`,
    [key],
  ).catch(() => undefined);
}

export async function getOrLoadWechatChannelCache<T extends Record<string, unknown>>(input: {
  scope: CacheScope;
  identity: string;
  ttlSeconds: number | null;
  forceRefresh?: boolean;
  load: () => Promise<T>;
}): Promise<{ value: T; cacheHit: boolean }> {
  const key = cacheKey(input.scope, input.identity);
  const current = inFlight.get(key);
  if (current) return { value: await current as T, cacheHit: true };

  let loadedFromCache = false;
  const promise = (async () => {
    const cached = input.forceRefresh ? null : await readCache(key);
    if (cached) {
      loadedFromCache = true;
      return cached as T;
    }
    const acquired = await acquireRefreshLease(key, input.scope);
    if (!acquired) {
      const refreshed = await waitForRefresh(key);
      if (refreshed) return refreshed as T;
    }
    try {
      const value = await input.load();
      await saveCache(key, input.scope, value, input.ttlSeconds);
      return value;
    } finally {
      await releaseRefreshLease(key);
    }
  })();
  inFlight.set(key, promise);
  try {
    return { value: await promise, cacheHit: loadedFromCache };
  } finally {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  }
}
