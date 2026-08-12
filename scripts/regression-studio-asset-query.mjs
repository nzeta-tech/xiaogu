import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  const index = await pool.query(
    `select indexdef
     from pg_indexes
     where schemaname = 'public' and indexname = 'idx_app_runs_studio_asset_lookup'`,
  );
  if (index.rowCount !== 1) throw new Error("Studio asset lookup index is missing");

  const validity = await pool.query(
    `select indisvalid, indisready
     from pg_index
     where indexrelid = 'idx_app_runs_studio_asset_lookup'::regclass`,
  );
  if (!validity.rows[0]?.indisvalid || !validity.rows[0]?.indisready) {
    throw new Error("Studio asset lookup index is not ready and valid");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local enable_seqscan = off");
    const plan = await client.query(
      `explain (format json)
       select distinct on (a.slug) ar.id, a.slug as app_slug, ar.status, ar.error_message, ar.created_at
       from app_runs ar
       join apps a on a.id = ar.app_id
       where ar.input_payload->>'studio_work_id' = $1
         and ar.input_payload->>'studio_parent' in ('wechat-studio', 'xiaohongshu-studio')
         and a.slug in ('wechat-images', 'wechat-cover')
       order by a.slug, ar.created_at desc`,
      ["00000000-0000-0000-0000-000000000000"],
    );
    const serializedPlan = JSON.stringify(plan.rows[0]);
    if (!serializedPlan.includes("idx_app_runs_studio_asset_lookup")) {
      throw new Error("Studio asset query plan does not use the lookup index");
    }
    await client.query("rollback");
  } finally {
    client.release();
  }

  console.log("studio asset query regression passed: 3 assertions");
} finally {
  await pool.end();
}
