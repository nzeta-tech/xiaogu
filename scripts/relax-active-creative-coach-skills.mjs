#!/usr/bin/env node
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const restrictive = /(不得|禁止|严禁|不能|不允许|不可|不承诺|不保证|不补造|不编造|不夸大|避免绝对|事实.*边界|推断.*条件|风险边界|合规边界|适用条件|待核验|需核验|核验要求|证据不足|信息不足|可靠材料|专业复核|高风险专业|不假装全知|删除测试|停止规则|停止条件|完成既定停止点|只按|仅依据|只执行)/u;
const removedKeys = new Set([
  "avoid", "riskAttitude", "notFor", "requires", "conflictsWith", "stoppingRule",
  "stoppingRules", "counterExamples", "doNotAdd", "omittedMethods", "negativeEvidence",
  "contentGaps", "forbiddenMoves", "mustKeepEvidence", "mustKeepEvidenceIds",
  "uncertainClaims", "doNotClaim", "riskBoundary", "factBoundary", "complianceBoundary",
]);

function relaxText(value) {
  return String(value || "")
    .split(/\n+/u)
    .flatMap((line) => line.split(/(?<=[。！？!?])|[；;]/u))
    .flatMap((sentence) => sentence.split(/[，,](?=(?:但|也|并|同时|而|更|只|仅|不|未|若|如|涉及|信息|证据))/u))
    .map((item) => item.trim().replace(/^(?:但|也|并|同时|而|更)[，,]?/u, ""))
    .filter((item) => item && !restrictive.test(item))
    .join("\n");
}

function relaxValue(value) {
  if (typeof value === "string") return relaxText(value);
  if (Array.isArray(value)) return value.map(relaxValue).filter((item) => item !== "" && item != null);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !removedKeys.has(key))
    .map(([key, item]) => [key, relaxValue(item)]));
}

const client = await pool.connect();
try {
  await client.query("begin");
  await client.query(`create table if not exists creative_coach_relaxation_backups (
    coach_version_id uuid primary key references creative_coach_versions(id) on delete cascade,
    snapshot_json jsonb not null,
    created_at timestamptz not null default now()
  )`);
  const result = await client.query(`
    select versions.*, coaches.name coach_name, backups.snapshot_json backup_snapshot
      from creative_coach_versions versions
      join creative_coaches coaches on coaches.id=versions.coach_id
      left join creative_coach_relaxation_backups backups on backups.coach_version_id=versions.id
     where versions.status in ('active','restored') and coaches.status='active'
     order by coaches.name, versions.version desc
  `);
  for (const row of result.rows) {
    const original = row.backup_snapshot || {
      ipPositioningPrompt: row.ip_positioning_prompt,
      contentCreationPrompt: row.content_creation_prompt,
      growthPrompt: row.growth_prompt,
      personaProfile: row.persona_profile,
      skillHierarchy: row.skill_hierarchy,
      skillModules: row.skill_modules,
    };
    await client.query(
      `insert into creative_coach_relaxation_backups(coach_version_id,snapshot_json)
       values($1,$2::jsonb) on conflict(coach_version_id) do nothing`,
      [row.id, JSON.stringify({
        ipPositioningPrompt: row.ip_positioning_prompt,
        contentCreationPrompt: row.content_creation_prompt,
        growthPrompt: row.growth_prompt,
        personaProfile: row.persona_profile,
        skillHierarchy: row.skill_hierarchy,
        skillModules: row.skill_modules,
      })],
    );
    const skillModules = relaxValue(original.skillModules || {});
    skillModules.schemaVersion = Math.max(3, Number(skillModules.schemaVersion) || 0);
    skillModules.trainingCheckpoint = {
      ...(skillModules.trainingCheckpoint || {}),
      creativeFreedom: true,
      relaxedAt: new Date().toISOString(),
    };
    await client.query(`
      update creative_coach_versions
         set ip_positioning_prompt=$2,
             content_creation_prompt=$3,
             growth_prompt=$4,
             persona_profile=$5::jsonb,
             skill_hierarchy=$6::jsonb,
             skill_modules=$7::jsonb,
             training_manifest=coalesce(training_manifest,'{}'::jsonb)||$8::jsonb,
             change_summary=$9
       where id=$1
    `, [
      row.id,
      relaxText(original.ipPositioningPrompt),
      relaxText(original.contentCreationPrompt),
      relaxText(original.growthPrompt),
      JSON.stringify(relaxValue(original.personaProfile || {})),
      JSON.stringify(relaxValue(original.skillHierarchy || [])),
      JSON.stringify(skillModules),
      JSON.stringify({ creativeFreedom: true, relaxedAt: new Date().toISOString(), relaxationVersion: 2 }),
      "创作自由版：保留选题、洞察、结构与声纹，移除限制型训练规则",
    ]);
    console.log(JSON.stringify({ coach: row.coach_name, version: row.version, versionId: row.id, status: "relaxed" }));
  }
  await client.query("commit");
  console.log(JSON.stringify({ status: "complete", coaches: result.rowCount }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
