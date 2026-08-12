import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
let assertions = 0;
function assert(value, message) {
  if (!value) throw new Error(message);
  assertions += 1;
}

await client.connect();
try {
  await client.query("begin");
  const sourceUrl = "https://www.douyin.com/video/7000000000000000000";
  const cacheKey = createHash("sha256").update(sourceUrl).digest("hex");
  const cachedResult = { status: "cached", finalUrl: sourceUrl, fields: { source_title: "缓存回归作品", source_transcript: "可跨用户复用的公开作品转写。" } };
  await client.query(
    `insert into link_remix_source_cache(cache_key,source_url,result,expires_at)
     values($1,$2,$3,now()+interval '72 hours')
     on conflict(cache_key) do update set result=excluded.result,expires_at=excluded.expires_at`,
    [cacheKey, sourceUrl, cachedResult],
  );
  const hit = await client.query(
    `select result,expires_at from link_remix_source_cache where cache_key=$1 and expires_at>now()`,
    [cacheKey],
  );
  assert(hit.rowCount === 1, "fresh cache should be readable");
  assert(hit.rows[0].result.fields.source_transcript === cachedResult.fields.source_transcript, "transcript should round-trip");
  assert(!("mediaDecryptKey" in hit.rows[0].result), "decrypt keys must not be cached");
  const columns = await client.query(
    `select column_name from information_schema.columns where table_name='link_remix_source_cache'`,
  );
  assert(!columns.rows.some((row) => row.column_name === "user_id"), "cache must be shared across users");
  await client.query(`update link_remix_source_cache set expires_at=now()-interval '1 second' where cache_key=$1`, [cacheKey]);
  const expired = await client.query(
    `select 1 from link_remix_source_cache where cache_key=$1 and expires_at>now()`,
    [cacheKey],
  );
  assert(expired.rowCount === 0, "expired cache must not be reused");
  await client.query("rollback");
  console.log(`link remix cache regression passed: ${assertions} assertions`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
