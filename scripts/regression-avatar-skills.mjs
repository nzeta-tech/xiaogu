#!/usr/bin/env node
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl });
const marker = `codex-avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let organizationId;
let ownerId;
let peerId;
let assertions = 0;

function check(value, message) {
  assert(value, message);
  assertions += 1;
}

async function visibleSkills(userId) {
  const result = await pool.query(
    `select versions.id, skills.name, versions.version, skills.skill_scope
       from avatar_creator_skill_versions versions
       join avatar_creator_skills skills on skills.id = versions.skill_id
      where skills.status = 'active'
        and versions.status in ('active', 'restored')
        and (skills.skill_scope = 'platform' or (skills.skill_scope = 'personal' and skills.user_id = $1))
      order by case when skills.skill_scope = 'personal' then 0 else 1 end, skills.updated_at desc, versions.version desc`,
    [userId],
  );
  return result.rows.filter((row) => row.name.startsWith(marker));
}

async function managedPlatformSkills(userId) {
  const result = await pool.query(
    `select id, name, identity_card, identity_card_draft from avatar_creator_skills
      where skill_scope='platform' and ('platform'='platform' or user_id=$1)
      order by updated_at desc`,
    [userId],
  );
  return result.rows.filter((row) => row.name.startsWith(marker));
}

try {
  const organization = await pool.query("insert into organizations(name) values ($1) returning id", [marker]);
  organizationId = organization.rows[0].id;
  const passwordHash = await bcrypt.hash(`Regression-${crypto.randomUUID()}-A1`, 4);
  const users = await pool.query(
    `insert into users(organization_id, name, email, password_hash, role, status, email_verified_at, terms_accepted_at)
     values ($1, '分身回归创建者', $2, $4, 'admin', 'active', now(), now()),
            ($1, '分身回归管理员同伴', $3, $4, 'admin', 'active', now(), now())
     returning id, email`,
    [organizationId, `${marker}-owner@example.invalid`, `${marker}-peer@example.invalid`, passwordHash],
  );
  [ownerId, peerId] = users.rows.map((row) => row.id);

  const personal = await pool.query(
    `insert into avatar_creator_skills(user_id, name, creator_name, skill_scope, status)
     values ($1, $2, '回归作者', 'personal', 'archived') returning id`,
    [ownerId, `${marker}-personal`],
  );
  const platform = await pool.query(
    `insert into avatar_creator_skills(user_id, name, creator_name, skill_scope, status)
     values ($1, $2, '平台回归作者', 'platform', 'archived') returning id`,
    [ownerId, `${marker}-platform`],
  );
  const personalSkillId = personal.rows[0].id;
  const platformSkillId = platform.rows[0].id;

  const versions = await pool.query(
    `insert into avatar_creator_skill_versions(skill_id, user_id, version, status, source_links, sample_count, skill_prompt, change_summary)
     values ($1, $3, 1, 'active', '["https://example.invalid/personal"]'::jsonb, 1, 'personal fixture', 'initial'),
            ($2, $3, 1, 'active', '["https://example.invalid/platform"]'::jsonb, 1, 'platform fixture', 'initial')
     returning id, skill_id`,
    [personalSkillId, platformSkillId, ownerId],
  );
  await pool.query("update avatar_creator_skills set latest_version=1 where id in ($1, $2)", [personalSkillId, platformSkillId]);

  check((await visibleSkills(ownerId)).length === 0, "newly trained skills must remain down by default");
  await pool.query("update avatar_creator_skills set status='active' where id=$1", [personalSkillId]);
  check((await visibleSkills(ownerId)).length === 1, "owner must see an active personal skill");
  check((await visibleSkills(peerId)).length === 0, "another user must not see a personal skill");

  await pool.query("update avatar_creator_skills set status='active' where id=$1", [platformSkillId]);
  const ownerVisible = await visibleSkills(ownerId);
  const peerVisible = await visibleSkills(peerId);
  check(ownerVisible.length === 2, "owner must see personal and platform skills");
  check(peerVisible.length === 1, "another user must see the active platform skill");
  check(peerVisible[0].skill_scope === "platform", "shared skill must retain platform scope");
  check((await managedPlatformSkills(peerId)).length === 1, "platform production library must be shared across administrators");

  const identityCard = {
    title: "回归身份定位",
    summary: "用于验证平台分身身份卡可以稳定保存并跨管理员读取。",
    scenarios: ["场景一", "场景二"],
    styleTags: ["清晰", "克制"],
    bestFor: "发布回归测试",
  };
  await pool.query(
    `update avatar_creator_skills
        set identity_card=$2::jsonb, identity_card_draft='{}'::jsonb, updated_at=now()
      where id=$1`,
    [platformSkillId, JSON.stringify(identityCard)],
  );
  const peerManagedIdentity = (await managedPlatformSkills(peerId))[0];
  check(peerManagedIdentity.identity_card.title === identityCard.title, "another administrator must read the latest platform identity card");
  check(peerManagedIdentity.identity_card.scenarios.length === 2, "platform identity card arrays must round-trip");
  check(Object.keys(peerManagedIdentity.identity_card_draft).length === 0, "publishing an identity card must clear its draft");
  const peerPersonalIdentity = await pool.query(
    `select id from avatar_creator_skills where id=$1 and user_id=$2`,
    [personalSkillId, peerId],
  );
  check(peerPersonalIdentity.rowCount === 0, "another administrator must not acquire ownership of a personal identity card");

  const secondVersion = await pool.query(
    `insert into avatar_creator_skill_versions(skill_id, user_id, version, status, source_links, sample_count, skill_prompt, change_summary)
     values ($1, $2, 2, 'active', '["https://example.invalid/platform-v2"]'::jsonb, 1, 'platform fixture v2', 'continued') returning id`,
    [platformSkillId, ownerId],
  );
  await pool.query("update avatar_creator_skill_versions set status='superseded' where skill_id=$1 and version=1", [platformSkillId]);
  await pool.query("update avatar_creator_skills set latest_version=2 where id=$1", [platformSkillId]);
  check((await visibleSkills(peerId))[0].version === 2, "continued training must expose only the latest active version");

  const firstVersionId = versions.rows.find((row) => row.skill_id === platformSkillId).id;
  await pool.query(
    `update avatar_creator_skill_versions
        set status=case when id=$2 then 'restored' else 'superseded' end
      where skill_id=$1 and (id=$2 or status in ('active','restored'))`,
    [platformSkillId, firstVersionId],
  );
  await pool.query("update avatar_creator_skills set latest_version=1 where id=$1", [platformSkillId]);
  const rolledBack = await visibleSkills(peerId);
  check(rolledBack[0].version === 1, "rollback must restore the selected version");
  check(!rolledBack.some((row) => row.id === secondVersion.rows[0].id), "rollback must supersede the newer version");
  const crossAdminVersion = await pool.query(
    `select v.version from avatar_creator_skill_versions v
      join avatar_creator_skills s on s.id=v.skill_id
      where v.id=$1 and v.skill_id=$2 and (s.user_id=$3 or (s.skill_scope='platform' and $4::boolean))`,
    [firstVersionId, platformSkillId, peerId, true],
  );
  check(crossAdminVersion.rowCount === 1, "another administrator must be authorized to manage a platform version");

  console.log(JSON.stringify({ status: "passed", assertions, fixture: "avatar-skill-scope-lifecycle" }));
} finally {
  if (ownerId || peerId) await pool.query("delete from users where id = any($1::uuid[])", [[ownerId, peerId].filter(Boolean)]);
  if (organizationId) await pool.query("delete from organizations where id=$1", [organizationId]);
  await pool.end();
}
