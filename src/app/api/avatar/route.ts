import { z } from "zod";
import { avatarMemoryCategories } from "@/lib/avatar/types";
import { getAvatarWorkspace, resolveEvolutionProposal } from "@/lib/avatar/store";
import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";
import { tryGetLatestThinkingProfileSnapshot, tryGetLatestQuestionnaire } from "@/lib/db/repositories";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add-memory"),
    category: z.enum(avatarMemoryCategories),
    title: z.string().trim().max(120).default(""),
    content: z.string().trim().min(1).max(5000),
    sensitivity: z.enum(["normal", "sensitive", "restricted"]).default("normal"),
    usageScope: z.enum(["all", "content", "customer", "private"]).default("all"),
  }),
  z.object({ action: z.literal("set-memory-status"), memoryId: z.string().uuid(), status: z.enum(["candidate", "active", "archived"]) }),
  z.object({ action: z.literal("resolve-proposal"), proposalId: z.string().uuid(), decision: z.enum(["accepted", "rejected"]) }),
  z.object({
    action: z.literal("add-source"),
    sourceType: z.enum(["article", "moments", "transcript", "story", "manual"]).default("manual"),
    title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(20).max(50000),
    sensitivity: z.enum(["normal", "sensitive", "restricted"]).default("normal"),
  }),
  z.object({ action: z.literal("set-source-status"), sourceId: z.string().uuid(), status: z.enum(["active", "disabled", "archived"]) }),
  z.object({
    action: z.literal("privacy"),
    learningEnabled: z.boolean(),
    behaviorLearningEnabled: z.boolean(),
    customerMemoryEnabled: z.boolean(),
    autoInferenceEnabled: z.boolean(),
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
]);

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  try {
    const [workspace, snapshot, questionnaire] = await Promise.all([
      getAvatarWorkspace(user.id),
      tryGetLatestThinkingProfileSnapshot(user.id),
      tryGetLatestQuestionnaire(user.id),
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
        `insert into avatar_memory_items(user_id, category, title, content, origin, status, confidence, sensitivity, usage_scope)
         values ($1, $2, $3, $4, 'user', 'active', 100, $5, $6) returning id`,
        [user.id, input.category, input.title, input.content, input.sensitivity, input.usageScope],
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
        `insert into avatar_memory_sources(user_id, source_type, title, content, sensitivity)
         values ($1, $2, $3, $4, $5) returning id`,
        [user.id, input.sourceType, input.title, input.content, input.sensitivity],
      );
      return Response.json({ ok: true, id: result.rows[0].id });
    }

    if (input.action === "set-source-status") {
      await query(`update avatar_memory_sources set status = $3, updated_at = now() where id = $1 and user_id = $2`, [input.sourceId, user.id, input.status]);
      return Response.json({ ok: true });
    }

    if (input.action === "privacy") {
      await query(
        `insert into avatar_privacy_settings(user_id, learning_enabled, behavior_learning_enabled, customer_memory_enabled, auto_inference_enabled)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id) do update set learning_enabled = excluded.learning_enabled,
           behavior_learning_enabled = excluded.behavior_learning_enabled,
           customer_memory_enabled = excluded.customer_memory_enabled,
           auto_inference_enabled = excluded.auto_inference_enabled, updated_at = now()`,
        [user.id, input.learningEnabled, input.behaviorLearningEnabled, input.customerMemoryEnabled, input.autoInferenceEnabled],
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
