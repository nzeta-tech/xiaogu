import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("begin");

  const drafts = await client.query(
    `select d.id, d.user_id, d.conversation_id, d.title, d.content, d.platform, d.status, d.compliance_risk, d.created_at, d.updated_at
     from drafts d
     where not exists (
       select 1
       from works w
       where w.conversation_id is not distinct from d.conversation_id
         and w.user_id = d.user_id
         and w.title = d.title
         and w.source_channel = d.platform
         and w.created_at >= d.created_at - interval '5 seconds'
         and w.created_at <= d.created_at + interval '5 seconds'
     )
     order by d.created_at asc`,
  );

  let migrated = 0;

  for (const draft of drafts.rows) {
    const work = await client.query(
      `insert into works(
         user_id, app_run_id, app_id, conversation_id, title, content_type, source_channel, status, is_favorite, is_used, note, compliance_risk, created_at, updated_at
       )
       values (
         $1,
         null,
         (select id from apps where slug = $2 or code = $2 limit 1),
         $3,
         $4,
         'text',
         $2,
         $5,
         case when $5 = 'favorite' then true else false end,
         case when $5 = 'used' then true else false end,
         '',
         $6,
         $7,
         $8
       )
       returning id`,
      [
        draft.user_id,
        draft.platform,
        draft.conversation_id,
        draft.title,
        normalizeStatus(draft.status),
        draft.compliance_risk,
        draft.created_at,
        draft.updated_at,
      ],
    );

    await client.query(
      `insert into work_versions(work_id, version_no, content, content_json, created_from, created_at)
       values ($1, 1, $2, '{}'::jsonb, 'draft_backfill', $3)`,
      [work.rows[0].id, draft.content, draft.created_at],
    );

    migrated += 1;
  }

  await client.query("commit");
  console.log(JSON.stringify({ scanned: drafts.rowCount ?? 0, migrated }));
} catch (error) {
  await client.query("rollback");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

function normalizeStatus(status) {
  if (status === "used") return "used";
  if (status === "favorite") return "favorite";
  if (status === "archived") return "archived";
  return "draft";
}
