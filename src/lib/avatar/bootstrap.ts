import { getPool } from "@/lib/db/client";
import type { ThinkingProfileSnapshot, ThinkingProfileSummary } from "@/lib/thinking/profile-snapshot";
import { formatThinkingProfileSnapshotForPrompt } from "@/lib/thinking/profile-snapshot";

const bootstrapKey = "questionnaire-submit-v1";

type BootstrapInput = {
  userId: string;
  questionnaireId: string;
  snapshot: ThinkingProfileSnapshot;
  summary: ThinkingProfileSummary;
};

export async function bootstrapAvatarFromThinkingSubmission(input: BootstrapInput) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(
      `insert into avatar_privacy_settings(user_id, learning_enabled, behavior_learning_enabled, customer_memory_enabled, auto_inference_enabled)
       values ($1, true, true, false, true)
       on conflict (user_id) do nothing`,
      [input.userId],
    );

    const existingSource = await client.query<{ id: string }>(
      `select id
       from avatar_memory_sources
       where user_id = $1 and metadata_json->>'bootstrapKey' = $2
       order by updated_at desc
       limit 1
       for update`,
      [input.userId, bootstrapKey],
    );

    const sourceTitle = "数字分身人设问卷建档";
    const sourceContent = formatThinkingProfileSnapshotForPrompt(input.snapshot, input.summary);

    let sourceId = existingSource.rows[0]?.id ?? null;
    if (sourceId) {
      await client.query(
        `update avatar_memory_sources
         set title = $3,
             content = $4,
             status = 'active',
             sensitivity = 'normal',
             metadata_json = jsonb_build_object('bootstrapKey', $2, 'questionnaireId', $5),
             updated_at = now()
         where id = $1`,
        [sourceId, bootstrapKey, sourceTitle, sourceContent, input.questionnaireId],
      );
    } else {
      const insertedSource = await client.query<{ id: string }>(
        `insert into avatar_memory_sources(user_id, source_type, title, content, sensitivity, metadata_json)
         values ($1, 'manual', $2, $3, 'normal', jsonb_build_object('bootstrapKey', $4, 'questionnaireId', $5))
         returning id`,
        [input.userId, sourceTitle, sourceContent, bootstrapKey, input.questionnaireId],
      );
      sourceId = insertedSource.rows[0].id;
    }

    await client.query(
      `update avatar_memory_items
       set status = 'archived', updated_at = now()
       where user_id = $1
         and metadata_json->>'bootstrapKey' = $2
         and status <> 'archived'`,
      [input.userId, bootstrapKey],
    );

    const memories = buildBootstrapMemories(input.snapshot);
    for (const memory of memories) {
      await client.query(
        `insert into avatar_memory_items(
           user_id, category, title, content, source_id, origin, status, confidence, sensitivity, usage_scope, metadata_json
         )
         values ($1, $2, $3, $4, $5, 'imported', 'active', $6, 'normal', $7, jsonb_build_object('bootstrapKey', $8, 'questionnaireId', $9))`,
        [input.userId, memory.category, memory.title, memory.content, sourceId, memory.confidence, memory.usageScope, bootstrapKey, input.questionnaireId],
      );
    }

    const activeMemories = await client.query<{
      id: string;
      category: string;
      title: string;
      content: string;
      confidence: number;
    }>(
      `select id, category, title, content, confidence
       from avatar_memory_items
       where user_id = $1 and status = 'active'
       order by updated_at desc`,
      [input.userId],
    );

    const nextVersion = await client.query<{ version: number }>(
      `select coalesce(max(version), 0) + 1 as version
       from avatar_versions
       where user_id = $1`,
      [input.userId],
    );

    await client.query(
      `update avatar_versions
       set status = 'superseded'
       where user_id = $1 and status = 'active'`,
      [input.userId],
    );

    const versionNo = nextVersion.rows[0]?.version ?? 1;
    await client.query(
      `insert into avatar_versions(user_id, version, label, snapshot_json, change_summary, source, status)
       values ($1, $2, $3, $4::jsonb, $5, 'questionnaire', 'active')`,
      [
        input.userId,
        versionNo,
        versionNo === 1 ? "V1 · 初始分身" : `V${versionNo} · 问卷重建`,
        JSON.stringify({
          profile: input.snapshot,
          summary: input.summary,
          memories: activeMemories.rows,
        }),
        versionNo === 1 ? "基于人设问卷自动生成初始数字分身" : "根据最新人设问卷自动重建数字分身",
      ],
    );

    await client.query("commit");
    return true;
  } catch {
    await client.query("rollback");
    return false;
  } finally {
    client.release();
  }
}

function buildBootstrapMemories(snapshot: ThinkingProfileSnapshot) {
  return [
    makeMemory("identity", "核心身份", snapshot.identity_profile.core_identity.join("；"), 95, "all"),
    makeMemory("identity", "职业路径", snapshot.identity_profile.career_path, 88, "all"),
    makeMemory("audience", "核心客群", joinParts([snapshot.audience_profile.primary_audience, snapshot.audience_profile.secondary_audience]), 94, "all"),
    makeMemory("audience", "客户痛点与问题", joinParts([snapshot.audience_profile.client_pains.join("；"), snapshot.audience_profile.common_questions.join("；")]), 90, "content"),
    makeMemory("expertise", "长期内容母题", snapshot.content_motifs.pillar_topics.join("；"), 90, "content"),
    makeMemory("expertise", "专业信念与判断", snapshot.belief_system.believes.join("；"), 86, "content"),
    makeMemory("expression", "表达风格", joinParts([snapshot.expression_style.tone.join("；"), snapshot.expression_style.style_summary]), 92, "content"),
    makeMemory("expression", "内容节奏与决策风格", joinParts([snapshot.expression_style.time_budget, snapshot.belief_system.decision_style]), 82, "content"),
    makeMemory("story", "个人故事锚点", snapshot.trust_signals.personal_story_anchor, 84, "content"),
    makeMemory("story", "信任证据与案例", joinParts([snapshot.trust_signals.trust_reasons.join("；"), snapshot.trust_signals.case_signals.join("；")]), 82, "content"),
    makeMemory("boundary", "表达边界", joinParts([snapshot.belief_system.disbelieves.join("；"), snapshot.content_motifs.taboo_angles.join("；")]), 96, "all"),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function makeMemory(
  category: string,
  title: string,
  content: string,
  confidence: number,
  usageScope: "all" | "content",
) {
  const normalized = content.trim();
  if (!normalized) return null;
  return { category, title, content: normalized.slice(0, 5000), confidence, usageScope };
}

function joinParts(parts: string[]) {
  return parts.map((item) => item.trim()).filter(Boolean).join("；");
}
