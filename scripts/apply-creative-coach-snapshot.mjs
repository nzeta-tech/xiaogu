#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const snapshotPath = process.argv.find((argument) => argument.endsWith(".json"));
const dryRun = process.argv.includes("--dry-run");
if (!snapshotPath) throw new Error("Usage: node scripts/apply-creative-coach-snapshot.mjs <snapshot.json> [--dry-run]");

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.coaches) || snapshot.coaches.length === 0) throw new Error("Unsupported or empty creative-coach snapshot");
const computedHash = createHash("sha256").update(JSON.stringify(snapshot.coaches)).digest("hex");
if (computedHash !== snapshot.sha256) throw new Error("Creative-coach snapshot checksum mismatch");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  const ownerEmail = process.env.CREATIVE_COACH_SNAPSHOT_OWNER_EMAIL?.trim();
  const ownerResult = ownerEmail
    ? await client.query("select id from users where lower(email)=lower($1) limit 1", [ownerEmail])
    : await client.query(
        `select user_id as id,count(*)::int as matched
           from creative_coaches
          where coach_scope='platform' and name=any($1::text[])
          group by user_id order by matched desc limit 1`,
        [snapshot.coaches.map((coach) => coach.name)],
      );
  const ownerId = ownerResult.rows[0]?.id;
  if (!ownerId) throw new Error("Cannot resolve snapshot owner; set CREATIVE_COACH_SNAPSHOT_OWNER_EMAIL for a new environment");

  for (const coach of snapshot.coaches) {
    const existing = await client.query(
      "select id,user_id from creative_coaches where coach_scope=$1 and lower(name)=lower($2) order by updated_at desc",
      [coach.coachScope, coach.name],
    );
    if (existing.rows.length > 1) throw new Error(`Multiple platform coaches match ${coach.name}`);
    let coachId = existing.rows[0]?.id;
    const coachOwnerId = existing.rows[0]?.user_id ?? ownerId;
    if (coachId) {
      await client.query(
        `update creative_coaches
            set creator_name=$2,status=$3,latest_version=$4,identity_card=$5::jsonb,is_system=$6,updated_at=now()
          where id=$1`,
        [coachId, coach.creatorName, coach.status, coach.latestVersion, JSON.stringify(coach.identityCard), coach.isSystem],
      );
    } else {
      const inserted = await client.query(
        `insert into creative_coaches(user_id,name,creator_name,coach_scope,status,latest_version,identity_card,is_system)
         values($1,$2,$3,$4,$5,$6,$7::jsonb,$8) returning id`,
        [ownerId, coach.name, coach.creatorName, coach.coachScope, coach.status, coach.latestVersion, JSON.stringify(coach.identityCard), coach.isSystem],
      );
      coachId = inserted.rows[0].id;
    }

    const version = coach.activeVersion;
    await client.query(
      `insert into creative_coach_versions(
         coach_id,user_id,version,status,ip_positioning_prompt,content_creation_prompt,growth_prompt,
         sample_count,change_summary,skill_modules,persona_profile,skill_hierarchy,training_manifest
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb)
       on conflict(coach_id,version) do update set
         user_id=excluded.user_id,status=excluded.status,ip_positioning_prompt=excluded.ip_positioning_prompt,
         content_creation_prompt=excluded.content_creation_prompt,growth_prompt=excluded.growth_prompt,
         sample_count=excluded.sample_count,change_summary=excluded.change_summary,skill_modules=excluded.skill_modules,
         persona_profile=excluded.persona_profile,skill_hierarchy=excluded.skill_hierarchy,training_manifest=excluded.training_manifest`,
      [coachId, coachOwnerId, version.version, version.status, version.ipPositioningPrompt, version.contentCreationPrompt,
        version.growthPrompt, version.sampleCount, version.changeSummary, JSON.stringify(version.skillModules),
        JSON.stringify(version.personaProfile), JSON.stringify(version.skillHierarchy), JSON.stringify(version.trainingManifest)],
    );
    await client.query(
      "update creative_coach_versions set status='superseded' where coach_id=$1 and version<>$2 and status in ('active','restored')",
      [coachId, version.version],
    );
  }

  if (dryRun) await client.query("rollback");
  else await client.query("commit");
  process.stdout.write(`${JSON.stringify({ snapshotId: snapshot.snapshotId, sha256: snapshot.sha256, coachCount: snapshot.coaches.length, dryRun })}\n`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
