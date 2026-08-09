import { z } from "zod";
import { avatarMemoryCategories } from "@/lib/avatar/types";
import { getAvatarWorkspace, resolveEvolutionProposal } from "@/lib/avatar/store";
import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";
import { tryGetLatestThinkingProfileSnapshot, tryGetLatestQuestionnaire } from "@/lib/db/repositories";
import { tryGetAvatarContactCard } from "@/lib/avatar/contact-card";
import { reconcileAvatarTrainingRuns, startAvatarVideoTraining } from "@/lib/avatar/video-training";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add-memory"),
    category: z.enum(avatarMemoryCategories),
    title: z.string().trim().max(120).default(""),
    content: z.string().trim().min(1).max(5000),
    sourceLabel: z.string().trim().min(1).max(40).default("手动录入"),
    memoryScope: z.enum(["global", "short_video", "marketing", "customer"]).default("global"),
    sensitivity: z.enum(["normal", "sensitive", "restricted"]).default("normal"),
    usageScope: z.enum(["all", "content", "customer", "private"]).default("all"),
  }),
  z.object({ action: z.literal("set-memory-status"), memoryId: z.string().uuid(), status: z.enum(["candidate", "active", "archived"]) }),
  z.object({ action: z.literal("resolve-proposal"), proposalId: z.string().uuid(), decision: z.enum(["accepted", "rejected"]) }),
  z.object({
    action: z.literal("add-source"),
    sourceType: z.enum(["article", "moments", "transcript", "story", "manual", "video_channel", "douyin"]).default("manual"),
    title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(20).max(50000),
    sensitivity: z.enum(["normal", "sensitive", "restricted"]).default("normal"),
    sourceLabel: z.string().trim().min(1).max(40).default("手动录入"),
    memoryScope: z.enum(["global", "short_video", "marketing", "customer"]).default("global"),
  }),
  z.object({
    action: z.literal("train-video-channel-links"),
    links: z.array(z.string().trim().url().max(1000)).min(3).max(10),
    authorized: z.literal(true),
  }),
  z.object({ action: z.literal("set-source-status"), sourceId: z.string().uuid(), status: z.enum(["active", "disabled", "archived"]) }),
  z.object({
    action: z.literal("privacy"),
    learningEnabled: z.boolean(),
    behaviorLearningEnabled: z.boolean(),
    customerMemoryEnabled: z.boolean(),
    autoInferenceEnabled: z.boolean(),
    visualCreationEnabled: z.boolean(),
  }),
  z.object({
    action: z.literal("feedback"),
    eventType: z.enum(["more-like-me", "not-like-me", "too-salesy", "too-formal", "remember-style", "never-use"]),
    beforeText: z.string().max(20000).default(""),
    afterText: z.string().max(20000).default(""),
    feedbackText: z.string().max(1000).default(""),
    workId: z.string().max(120).optional(),
  }),
  z.object({ action: z.literal("restore-version"), versionId: z.string().uuid() }),
  z.object({ action: z.literal("create-creator-skill"), skillId: z.string().uuid().optional(), name: z.string().trim().max(60).default(""), creatorName: z.string().trim().max(80).default(""), links: z.array(z.string().trim().url().max(1000)).min(3).max(10), authorized: z.literal(true) }),
  z.object({ action: z.literal("restore-creator-skill-version"), skillId: z.string().uuid(), versionId: z.string().uuid() }),
]);

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  try {
    await reconcileAvatarTrainingRuns(user.id);
    const [workspace, snapshot, questionnaire, contactCard] = await Promise.all([
      getAvatarWorkspace(user.id),
      tryGetLatestThinkingProfileSnapshot(user.id),
      tryGetLatestQuestionnaire(user.id),
      tryGetAvatarContactCard(user.id),
    ]);
    return Response.json({
      avatar: {
        ...workspace,
        profile: snapshot
          ? {
              version: snapshot.version,
              snapshot: snapshot.snapshot_json,
              summary: snapshot.summary_json,
              updatedAt: snapshot.updated_at,
            }
          : null,
        questionnaire: questionnaire
          ? { completionPercent: questionnaire.completion_percent, updatedAt: questionnaire.updated_at }
          : null,
        contactCard,
      },
    });
  } catch {
    return Response.json({ error: "数字分身数据层尚未就绪，请先执行数据库迁移。" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "请求内容不完整" }, { status: 400 });
  const input = parsed.data;

  try {
    if (input.action === "add-memory") {
      const result = await query<{ id: string }>(
        `insert into avatar_memory_items(user_id, category, title, content, origin, status, confidence, sensitivity, usage_scope, metadata_json)
         values ($1, $2, $3, $4, 'user', 'active', 100, $5, $6, $7::jsonb) returning id`,
        [user.id, input.category, input.title, input.content, input.sensitivity, input.usageScope, JSON.stringify({ sourceLabel: input.sourceLabel, memoryScope: input.memoryScope })],
      );
      return Response.json({ ok: true, id: result.rows[0].id });
    }

    if (input.action === "set-memory-status") {
      await query(`update avatar_memory_items set status = $3, updated_at = now() where id = $1 and user_id = $2`, [input.memoryId, user.id, input.status]);
      return Response.json({ ok: true });
    }

    if (input.action === "resolve-proposal") {
      await resolveEvolutionProposal(user.id, input.proposalId, input.decision);
      return Response.json({ ok: true });
    }

    if (input.action === "add-source") {
      const result = await query<{ id: string }>(
        `insert into avatar_memory_sources(user_id, source_type, title, content, sensitivity, metadata_json)
         values ($1, $2, $3, $4, $5, $6::jsonb) returning id`,
        [user.id, input.sourceType, input.title, input.content, input.sensitivity, JSON.stringify({ sourceLabel: input.sourceLabel, memoryScope: input.memoryScope })],
      );
      return Response.json({ ok: true, id: result.rows[0].id });
    }

    if (input.action === "train-video-channel-links") {
      const training = await startAvatarVideoTraining(user.id, input.links);
      return Response.json({ ok: true, status: "queued", ...training }, { status: 202, headers: { "cache-control": "no-store" } });
    }

    if (input.action === "create-creator-skill") {
      if (!input.skillId && !input.name) return Response.json({ error: "请选择已有分身，或填写新分身名称" }, { status: 400 });
      const skill = input.skillId
        ? await query<{ id: string; latest_version: number }>(`select id, latest_version from avatar_creator_skills where id=$1 and user_id=$2 and status='active'`, [input.skillId, user.id])
        : await query<{ id: string; latest_version: number }>(`insert into avatar_creator_skills(user_id, name, creator_name) values ($1, $2, $3) on conflict (user_id, lower(name)) do update set creator_name=excluded.creator_name, updated_at=now() returning id, latest_version`, [user.id, input.name, input.creatorName]);
      const item = skill.rows[0];
      if (!item) return Response.json({ error: "选择的分身不存在或已归档" }, { status: 404 });
      const training = await startAvatarVideoTraining(user.id, input.links, item.id);
      await query(`insert into avatar_creator_skill_versions(skill_id, user_id, version, training_run_id, source_links, change_summary) values ($1, $2, $3, $4, $5::jsonb, '正在通过授权作品训练')`, [item.id, user.id, item.latest_version + 1, training.runId, JSON.stringify(input.links)]);
      return Response.json({ ok: true, skillId: item.id, runId: training.runId }, { status: 202 });
    }

    if (input.action === "restore-creator-skill-version") {
      const version = await query<{ version: number }>(`select version from avatar_creator_skill_versions where id=$1 and skill_id=$2 and user_id=$3`, [input.versionId, input.skillId, user.id]);
      if (!version.rows[0]) return Response.json({ error: "Skill 版本不存在" }, { status: 404 });
      await query(`update avatar_creator_skill_versions set status=case when id=$2 then 'restored' else 'superseded' end where skill_id=$1 and user_id=$3 and status in ('active','restored')`, [input.skillId, input.versionId, user.id]);
      await query(`update avatar_creator_skills set latest_version=$2, updated_at=now() where id=$1 and user_id=$3`, [input.skillId, version.rows[0].version, user.id]);
      return Response.json({ ok: true });
    }

    if (input.action === "set-source-status") {
      await query(`update avatar_memory_sources set status = $3, updated_at = now() where id = $1 and user_id = $2`, [input.sourceId, user.id, input.status]);
      return Response.json({ ok: true });
    }

    if (input.action === "privacy") {
      await query(
        `insert into avatar_privacy_settings(user_id, learning_enabled, behavior_learning_enabled, customer_memory_enabled, auto_inference_enabled, visual_creation_enabled)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id) do update set learning_enabled = excluded.learning_enabled,
           behavior_learning_enabled = excluded.behavior_learning_enabled,
           customer_memory_enabled = excluded.customer_memory_enabled,
           auto_inference_enabled = excluded.auto_inference_enabled,
           visual_creation_enabled = excluded.visual_creation_enabled, updated_at = now()`,
        [user.id, input.learningEnabled, input.behaviorLearningEnabled, input.customerMemoryEnabled, input.autoInferenceEnabled, input.visualCreationEnabled],
      );
      return Response.json({ ok: true });
    }

    if (input.action === "feedback") {
      await query(
        `insert into avatar_feedback_events(user_id, work_id, event_type, before_text, after_text, feedback_text)
         values ($1, $2, $3, $4, $5, $6)`,
        [user.id, input.workId ?? null, input.eventType, input.beforeText, input.afterText, input.feedbackText],
      );
      await maybeCreateEvolutionProposal(user.id, input.eventType);
      return Response.json({ ok: true });
    }

    if (input.action === "restore-version") {
      const version = await query<{ version: number; snapshot_json: { memories?: Array<{ category: string; title: string; content: string; confidence?: number }> } }>(
        `select version, snapshot_json from avatar_versions where id = $1 and user_id = $2`,
        [input.versionId, user.id],
      );
      if (!version.rows[0]) return Response.json({ error: "版本不存在" }, { status: 404 });
      const memories = version.rows[0].snapshot_json.memories ?? [];
      await query(`update avatar_memory_items set status = 'archived', updated_at = now() where user_id = $1 and status = 'active'`, [user.id]);
      for (const memory of memories) {
        if (!avatarMemoryCategories.includes(memory.category as typeof avatarMemoryCategories[number]) || !memory.content) continue;
        await query(
          `insert into avatar_memory_items(user_id, category, title, content, origin, status, confidence, metadata_json)
           values ($1, $2, $3, $4, 'system', 'active', $5, jsonb_build_object('restoredFromVersion', $6))`,
          [user.id, memory.category, memory.title ?? "", memory.content, memory.confidence ?? 80, version.rows[0].version],
        );
      }
      await query(`update avatar_versions set status = case when id = $2 then 'restored' else 'superseded' end where user_id = $1`, [user.id, input.versionId]);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "不支持的操作" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "操作失败" }, { status: 500 });
  }
}

async function maybeCreateEvolutionProposal(userId: string, eventType: string) {
  const repeated = await query<{ count: string }>(
    `select count(*)::text as count from avatar_feedback_events where user_id = $1 and event_type = $2 and created_at > now() - interval '90 days'`,
    [userId, eventType],
  );
  const count = Number(repeated.rows[0]?.count ?? 0);
  if (count < 3) return;
  const existing = await query<{ id: string }>(
    `select id from avatar_evolution_proposals where user_id = $1 and status = 'pending' and patch_json->>'eventType' = $2 limit 1`,
    [userId, eventType],
  );
  if (existing.rows[0]) return;
  const suggestions: Record<string, { title: string; content: string }> = {
    "too-salesy": { title: "降低直接销售感", content: "默认减少直接成交催促，优先使用自然邀请交流和提供帮助的行动引导。" },
    "too-formal": { title: "增强生活化表达", content: "减少书面术语和长句，优先使用客户听得懂的日常语言与具体场景。" },
    "more-like-me": { title: "强化当前表达方式", content: "近期多次被标记为更像本人，建议提高当前语气与结构的使用权重。" },
    "not-like-me": { title: "降低当前表达权重", content: "近期多次被标记为不像本人，建议减少相似语气与结构。" },
    "remember-style": { title: "记住认可的表达风格", content: "将近期被明确认可的表达方式加入长期表达记忆。" },
    "never-use": { title: "新增表达边界", content: "将近期被明确排除的表达方式加入长期禁用边界。" },
  };
  const suggestion = suggestions[eventType];
  if (!suggestion) return;
  await query(
    `insert into avatar_evolution_proposals(user_id, category, title, description, confidence, evidence_json, patch_json)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      userId,
      eventType === "never-use" ? "boundary" : "expression",
      suggestion.title,
      suggestion.content,
      Math.min(92, 55 + count * 7),
      JSON.stringify([`近 90 天累计出现 ${count} 次同类反馈`]),
      JSON.stringify({ title: suggestion.title, content: suggestion.content, eventType }),
    ],
  );
}
