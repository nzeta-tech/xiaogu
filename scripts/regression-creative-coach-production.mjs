#!/usr/bin/env node
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl });
const marker = `codex-coach-production-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let organizationId;
let userId;
let assertions = 0;

function check(value, message) {
  assert(value, message);
  assertions += 1;
}

try {
  const organization = await pool.query("insert into organizations(name) values ($1) returning id", [marker]);
  organizationId = organization.rows[0].id;
  const passwordHash = await bcrypt.hash(`Regression-${crypto.randomUUID()}-A1`, 4);
  const user = await pool.query(
    `insert into users(organization_id,name,email,password_hash,role,status,email_verified_at,terms_accepted_at)
     values($1,'教练生产回归管理员',$2,$3,'admin','active',now(),now()) returning id`,
    [organizationId, `${marker}@example.invalid`, passwordHash],
  );
  userId = user.rows[0].id;

  const skill = await pool.query(
    `insert into avatar_creator_skills(user_id,name,creator_name,skill_scope,training_purpose,status)
     values($1,$2,'回归作者','platform','content','archived') returning id`,
    [userId, `${marker}-source`],
  );
  const skillId = skill.rows[0].id;
  const coach = await pool.query(
    `insert into creative_coaches(user_id,name,creator_name,coach_scope,status)
     values($1,$2,'回归作者','platform','archived') returning id`,
    [userId, `${marker}-coach`],
  );
  const coachId = coach.rows[0].id;

  const sourceRuns = await pool.query(
    `insert into avatar_training_runs(user_id,creator_skill_id,training_type,status,phase,total_count,completed_count,successful_count)
     values($1,$2,'coach-source','succeeded','completed',12,12,12),
           ($1,$2,'coach-source','failed','failed',12,12,0)
     returning id,status`,
    [userId, skillId],
  );
  const succeededRunId = sourceRuns.rows.find((row) => row.status === "succeeded").id;
  const failedRunId = sourceRuns.rows.find((row) => row.status === "failed").id;

  const job = await pool.query(
    `insert into creative_coach_training_jobs(user_id,coach_id,source_skill_id,source_run_id,status,phase)
     values($1,$2,$3,$4,'waiting_source','waiting-source') returning id`,
    [userId, coachId, skillId, succeededRunId],
  );
  const jobId = job.rows[0].id;
  check(Boolean(jobId), "a durable coach training job must be created");

  await assert.rejects(
    pool.query(
      `insert into creative_coach_training_jobs(user_id,coach_id,source_skill_id,source_run_id,status,phase)
       values($1,$2,$3,$4,'queued','duplicate-active')`,
      [userId, coachId, skillId, failedRunId],
    ),
    /idx_creative_coach_training_jobs_one_active_per_coach|duplicate key/i,
  );
  assertions += 1;

  const claimed = await pool.query(
    `update creative_coach_training_jobs
        set status='training',phase='progressive-training',attempt_count=attempt_count+1,
            lease_until=now()+interval '10 minutes',details_json='{"checkpoint":1}'::jsonb,updated_at=now()
      where id=$1 and status='waiting_source' returning attempt_count,lease_until`,
    [jobId],
  );
  check(claimed.rows[0].attempt_count === 1, "claiming must increment the durable attempt count once");
  check(Boolean(claimed.rows[0].lease_until), "claiming must persist a lease");

  const version = await pool.query(
    `insert into creative_coach_versions(
       coach_id,user_id,version,status,source_skill_ids,source_run_ids,sample_count,
       persona_profile,skill_hierarchy,training_manifest,change_summary
     ) values($1,$2,1,'active',array[$3]::uuid[],array[$4]::uuid[],12,
       '{"identity":"fixture"}'::jsonb,'[{"id":"opening"}]'::jsonb,
       '{"qualityGate":"passed"}'::jsonb,'candidate regression') returning id`,
    [coachId, userId, skillId, succeededRunId],
  );
  const versionId = version.rows[0].id;
  await pool.query(
    `update creative_coach_training_jobs
        set status='succeeded',phase='active',lease_until=null,progressive_version_id=$2,updated_at=now()
      where id=$1`,
    [jobId, versionId],
  );
  const reloaded = await pool.query(
    `select jobs.status,jobs.phase,jobs.attempt_count,jobs.progressive_version_id,
            versions.status version_status,versions.skill_hierarchy,versions.training_manifest
       from creative_coach_training_jobs jobs
       join creative_coach_versions versions on versions.id=jobs.progressive_version_id
      where jobs.id=$1`,
    [jobId],
  );
  check(reloaded.rows[0].status === "succeeded" && reloaded.rows[0].phase === "active", "success must survive a fresh query");
  check(reloaded.rows[0].progressive_version_id === versionId && reloaded.rows[0].version_status === "active", "success must link the activated version");
  check(reloaded.rows[0].skill_hierarchy.length === 1, "progressive skills must round-trip");
  check(reloaded.rows[0].training_manifest.qualityGate === "passed", "quality-gate evidence must round-trip");

  const failedJob = await pool.query(
    `insert into creative_coach_training_jobs(user_id,coach_id,source_skill_id,source_run_id,status,phase,attempt_count,error_message)
     values($1,$2,$3,$4,'failed','source-failed',3,'controlled fixture failure')
     returning id,status,attempt_count,error_message`,
    [userId, coachId, skillId, failedRunId],
  );
  check(failedJob.rows[0].status === "failed" && failedJob.rows[0].attempt_count === 3, "terminal failure and retry count must persist");
  check(failedJob.rows[0].error_message === "controlled fixture failure", "failure reason must remain observable");

  console.log(JSON.stringify({ status: "passed", assertions, fixture: "creative-coach-durable-production" }));
} finally {
  if (userId) await pool.query("delete from users where id=$1", [userId]);
  if (organizationId) await pool.query("delete from organizations where id=$1", [organizationId]);
  await pool.end();
}
