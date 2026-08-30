#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";
const names = process.env.CREATIVE_COACH_SNAPSHOT_NAMES?.split("|").map((name) => name.trim()).filter(Boolean) ?? [];
const client = new Client({ connectionString: process.env.DATABASE_URL });

function canonicalPayload(coaches) {
  return JSON.stringify(coaches);
}

await client.connect();
try {
  const result = await client.query(
    `select c.name,c.creator_name,c.coach_scope,c.status,c.latest_version,c.identity_card,c.is_system,
            v.version,v.status as version_status,v.ip_positioning_prompt,v.content_creation_prompt,v.growth_prompt,
            v.sample_count,v.change_summary,v.skill_modules,v.persona_profile,v.skill_hierarchy,v.training_manifest
       from creative_coaches c
       join creative_coach_versions v on v.coach_id=c.id and v.version=c.latest_version
      where c.status='active' and c.coach_scope='platform'
        and (cardinality($1::text[])=0 or c.name=any($1::text[]))
      order by c.name`,
    [names],
  );
  if (result.rows.length === 0) throw new Error("No active platform creative coaches found");
  if (names.length > 0 && result.rows.length !== names.length) throw new Error(`Expected ${names.length} coaches, found ${result.rows.length}`);

  const coaches = result.rows.map((row) => ({
    name: row.name,
    creatorName: row.creator_name,
    coachScope: row.coach_scope,
    status: row.status,
    latestVersion: row.latest_version,
    identityCard: row.identity_card ?? {},
    isSystem: row.is_system,
    activeVersion: {
      version: row.version,
      status: row.version_status,
      ipPositioningPrompt: row.ip_positioning_prompt,
      contentCreationPrompt: row.content_creation_prompt,
      growthPrompt: row.growth_prompt,
      sampleCount: row.sample_count,
      changeSummary: row.change_summary,
      skillModules: row.skill_modules ?? {},
      personaProfile: row.persona_profile ?? {},
      skillHierarchy: row.skill_hierarchy ?? [],
      trainingManifest: row.training_manifest ?? {},
    },
  }));
  const snapshot = {
    schemaVersion: 1,
    snapshotId: `platform-active-${new Date().toISOString().slice(0, 10)}`,
    source: "production-active-platform-coaches",
    coachCount: coaches.length,
    sha256: createHash("sha256").update(canonicalPayload(coaches)).digest("hex"),
    coaches,
  };
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, serialized, "utf8");
  else process.stdout.write(serialized);
} finally {
  await client.end();
}
