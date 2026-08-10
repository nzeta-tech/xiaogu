#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { Pool } = require("pg");

const mode = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["export", "import", "verify", "rollback"].includes(mode)) {
  throw new Error("Usage: DATABASE_URL=... migrate-platform-creator-skills.cjs <export|import|verify|rollback>");
}

const pool = new Pool({ connectionString: databaseUrl });
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function readInput() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input);
}

async function exportSkills() {
  const skills = await pool.query(
    `select s.id, s.name, s.creator_name, s.status, s.latest_version, s.created_at, s.updated_at,
            u.email as owner_email
       from avatar_creator_skills s
       join users u on u.id=s.user_id
      where s.skill_scope='platform'
      order by s.name`,
  );
  const versions = await pool.query(
    `select v.id, v.skill_id, v.version, v.status, v.source_links, v.sample_count,
            v.skill_prompt, v.change_summary, v.created_at
       from avatar_creator_skill_versions v
       join avatar_creator_skills s on s.id=v.skill_id
      where s.skill_scope='platform'
      order by v.skill_id, v.version`,
  );
  const payload = { schema: 1, skills: skills.rows, versions: versions.rows };
  process.stdout.write(JSON.stringify({ ...payload, digest: digest(payload) }));
}

async function importSkills(payload) {
  const expectedDigest = payload.digest;
  const unsigned = { schema: payload.schema, skills: payload.skills, versions: payload.versions };
  if (payload.schema !== 1 || digest(unsigned) !== expectedDigest) throw new Error("migration payload digest mismatch");
  if (!Array.isArray(payload.skills) || payload.skills.length === 0) throw new Error("no platform skills in migration payload");

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('platform-creator-skill-migration'))");
    for (const skill of payload.skills) {
      const owner = await client.query(
        "select id from users where lower(email)=lower($1) and role='admin' and status='active' limit 1",
        [skill.owner_email],
      );
      if (owner.rowCount !== 1) throw new Error(`active production admin owner not found for ${skill.name}`);
      const collision = await client.query(
        "select 1 from avatar_creator_skills where id=$1 or (skill_scope='platform' and lower(name)=lower($2))",
        [skill.id, skill.name],
      );
      if (collision.rowCount) throw new Error(`platform skill collision: ${skill.name}`);
      await client.query(
        `insert into avatar_creator_skills
           (id,user_id,name,creator_name,status,latest_version,skill_scope,created_at,updated_at)
         values ($1,$2,$3,$4,$5,$6,'platform',$7,$8)`,
        [skill.id, owner.rows[0].id, skill.name, skill.creator_name, skill.status, skill.latest_version, skill.created_at, skill.updated_at],
      );
      for (const version of payload.versions.filter((item) => item.skill_id === skill.id)) {
        await client.query(
          `insert into avatar_creator_skill_versions
             (id,skill_id,user_id,version,training_run_id,status,source_links,sample_count,skill_prompt,change_summary,created_at)
           values ($1,$2,$3,$4,null,$5,$6::jsonb,$7,$8,$9,$10)`,
          [version.id, skill.id, owner.rows[0].id, version.version, version.status, JSON.stringify(version.source_links), version.sample_count, version.skill_prompt, version.change_summary, version.created_at],
        );
      }
    }
    await client.query("commit");
    console.log(JSON.stringify({ status: "imported", skills: payload.skills.length, versions: payload.versions.length, digest: expectedDigest }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function verifySkills(payload) {
  const rows = await pool.query(
    `select s.id, s.name, s.status, s.latest_version, v.id as version_id, v.version, v.status as version_status,
            v.source_links, v.sample_count, v.skill_prompt, v.change_summary
       from avatar_creator_skills s
       join avatar_creator_skill_versions v on v.skill_id=s.id
      where s.skill_scope='platform' and s.id=any($1::uuid[])
      order by s.id,v.version`,
    [payload.skills.map((skill) => skill.id)],
  );
  const expected = payload.skills.flatMap((skill) => payload.versions
    .filter((version) => version.skill_id === skill.id)
    .map((version) => ({
      id: skill.id, name: skill.name, status: skill.status, latest_version: skill.latest_version,
      version_id: version.id, version: version.version, version_status: version.status,
      source_links: version.source_links, sample_count: version.sample_count,
      skill_prompt: version.skill_prompt, change_summary: version.change_summary,
    }))).sort((a, b) => a.id.localeCompare(b.id) || a.version - b.version);
  if (digest(rows.rows) !== digest(expected)) throw new Error("production platform-skill verification mismatch");
  console.log(JSON.stringify({ status: "verified", skills: payload.skills.length, versions: rows.rowCount, digest: payload.digest }));
}

async function rollbackSkills(payload) {
  const result = await pool.query(
    "delete from avatar_creator_skills where skill_scope='platform' and id=any($1::uuid[]) returning id",
    [payload.skills.map((skill) => skill.id)],
  );
  console.log(JSON.stringify({ status: "rolled_back", skills: result.rowCount }));
}

(async () => {
  try {
    if (mode === "export") await exportSkills();
    else {
      const payload = await readInput();
      if (mode === "import") await importSkills(payload);
      if (mode === "verify") await verifySkills(payload);
      if (mode === "rollback") await rollbackSkills(payload);
    }
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
