#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { getOrLoadWechatChannelCache } from "../src/lib/avatar/wechat-channel-discovery-cache.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
const identity = `sph-regression-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = createHash("sha256").update(`account:${identity}`).digest("hex");
let assertions = 0;
let loads = 0;
function check(value, message) { assert(value, message); assertions += 1; }

try {
  const [first, concurrent] = await Promise.all([
    getOrLoadWechatChannelCache({ scope: "account", identity, ttlSeconds: 60, load: async () => { loads += 1; await new Promise((resolve) => setTimeout(resolve, 40)); return { channelId: identity, works: [1, 2] }; } }),
    getOrLoadWechatChannelCache({ scope: "account", identity, ttlSeconds: 60, load: async () => { loads += 1; return { channelId: "wrong" }; } }),
  ]);
  check(loads === 1, "concurrent cache misses must coalesce to one provider call");
  check(first.value.channelId === identity && concurrent.value.channelId === identity, "coalesced callers must receive the same payload");
  const cached = await getOrLoadWechatChannelCache({ scope: "account", identity, ttlSeconds: 60, load: async () => { loads += 1; return { channelId: "wrong" }; } });
  check(cached.cacheHit && loads === 1, "fresh database cache must avoid another provider call");
  const row = (await pool.query("select cache_scope,payload,refresh_until,expires_at>now() as fresh from wechat_channel_discovery_cache where cache_key=$1", [key])).rows[0];
  check(row.cache_scope === "account" && row.payload.works.length === 2 && row.fresh, "cache payload and expiry must persist");
  check(row.refresh_until === null, "successful refresh must release its lease");

  await pool.query("update wechat_channel_discovery_cache set expires_at=now()-interval '1 second' where cache_key=$1", [key]);
  let failed = false;
  try {
    await getOrLoadWechatChannelCache({ scope: "account", identity, ttlSeconds: 60, load: async () => { throw new Error("controlled provider failure"); } });
  } catch { failed = true; }
  check(failed, "provider failures must remain observable");
  const released = (await pool.query("select refresh_until from wechat_channel_discovery_cache where cache_key=$1", [key])).rows[0];
  check(released.refresh_until === null, "failed refresh must release its lease for retry");
  console.log(JSON.stringify({ status: "passed", fixture: "wechat-channel-discovery-cache", assertions }));
} finally {
  await pool.query("delete from wechat_channel_discovery_cache where cache_key=$1", [key]).catch(() => undefined);
  await pool.end();
}
