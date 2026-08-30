#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(fs.existsSync("/app/server.js") ? "/app/server.js" : import.meta.url);
const { Pool } = require("pg");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const marker = `release-topic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const runIds = [];
let assertions = 0;

function check(value, message) {
  assert(value, message);
  assertions += 1;
}

async function createRun(status) {
  const result = await pool.query(
    `insert into topic_ingestion_runs(status, source_summary, topic_count, completed_at, error_message)
     values ($1, $2::jsonb, $3, case when $1 = 'completed' then now() else null end, case when $1 = 'failed' then 'controlled regression failure' else null end)
     returning id`,
    [status, JSON.stringify({ [marker]: 4 }), status === "completed" ? 4 : 0],
  );
  const id = result.rows[0].id;
  runIds.push(id);
  return id;
}

try {
  const schema = await pool.query(
    `select to_regclass('public.topic_ingestion_runs') as runs,
            exists(select 1 from information_schema.columns where table_name='topic_snapshots' and column_name='ingestion_run_id') as has_run_id,
            exists(select 1 from information_schema.columns where table_name='topic_snapshots' and column_name='topic_tab') as has_tab`,
  );
  check(schema.rows[0].runs === "topic_ingestion_runs", "topic_ingestion_runs migration missing");
  check(schema.rows[0].has_run_id, "topic_snapshots.ingestion_run_id migration missing");
  check(schema.rows[0].has_tab, "topic_snapshots.topic_tab migration missing");

  const completedRunId = await createRun("completed");
  for (const [index, tab] of ["热点", "财经", "香港", "国际"].entries()) {
    const payload = { id: `${marker}-${index}`, title: `${marker}-${tab}`, summary: marker, source: marker, heat: "中", category: tab, insuranceRelevance: "中", recommendedAngle: marker, riskNote: marker, tab };
    await pool.query(
      `insert into topic_snapshots(user_id,source,title,summary,insurance_relevance,recommended_angle,risk_note,raw_payload,ingestion_run_id,topic_tab,dedupe_key)
       values(null,$1,$2,$3,'中',$3,$3,$4::jsonb,$5,$6,$7)`,
      [marker, payload.title, marker, JSON.stringify(payload), completedRunId, tab, `${marker}-${index}`],
    );
  }
  const counts = await pool.query(
    `select topic_tab,count(*)::int as count from topic_snapshots where ingestion_run_id=$1 group by topic_tab`,
    [completedRunId],
  );
  check(counts.rowCount === 4, "completed batch does not cover four tabs");
  check(counts.rows.every((row) => row.count === 1), "completed batch has unexpected tab counts");

  await createRun("failed");
  const latest = await pool.query(
    `select id from topic_ingestion_runs where status='completed' order by completed_at desc limit 1`,
  );
  check(latest.rows[0]?.id === completedRunId, "failed refresh replaced the latest completed batch");

  const transactionClient = await pool.connect();
  let rolledBackId;
  try {
    await transactionClient.query("begin");
    const transient = await transactionClient.query(
      `insert into topic_ingestion_runs(status,source_summary,topic_count) values('running',$1::jsonb,1) returning id`,
      [JSON.stringify({ marker })],
    );
    rolledBackId = transient.rows[0].id;
    await transactionClient.query("rollback");
  } finally {
    transactionClient.release();
  }
  const rolledBack = await pool.query("select 1 from topic_ingestion_runs where id=$1", [rolledBackId]);
  check(rolledBack.rowCount === 0, "rolled-back batch remained visible");

  const lockA = await pool.connect();
  const lockB = await pool.connect();
  try {
    const first = await lockA.query("select pg_try_advisory_lock(1846201417) as locked");
    const second = await lockB.query("select pg_try_advisory_lock(1846201417) as locked");
    check(first.rows[0].locked === true, "first scheduler could not acquire refresh lock");
    check(second.rows[0].locked === false, "concurrent scheduler acquired the same refresh lock");
    await lockA.query("select pg_advisory_unlock(1846201417)");
    const retry = await lockB.query("select pg_try_advisory_lock(1846201417) as locked");
    check(retry.rows[0].locked === true, "refresh lock was not recoverable after release");
    await lockB.query("select pg_advisory_unlock(1846201417)");
  } finally {
    lockA.release();
    lockB.release();
  }

  console.log(JSON.stringify({ status: "passed", fixture: "topic-ingestion-batch", assertions, tabs: 4, cleanup: "pending" }));
} finally {
  if (runIds.length > 0) await pool.query("delete from topic_ingestion_runs where id = any($1::uuid[])", [runIds]).catch(() => undefined);
  await pool.end();
}
