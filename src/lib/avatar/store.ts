import { getPool, query } from "@/lib/db/client";
import type {
  AvatarEvolutionProposal,
  AvatarMemoryItem,
  AvatarMemorySource,
  AvatarPrivacySettings,
  AvatarVersion,
} from "@/lib/avatar/types";
import { listAvatarVisualAssets } from "@/lib/avatar/visual-assets";

export async function getAvatarWorkspace(userId: string) {
  const [memories, sources, proposals, versions, privacy, usage, photos] = await Promise.all([
    query<AvatarMemoryItem>(
      `select id, category, title, content, source_id, origin, status, confidence, sensitivity, usage_scope, created_at, updated_at
       from avatar_memory_items where user_id = $1 and status <> 'archived' order by status desc, updated_at desc limit 200`,
      [userId],
    ),
    query<AvatarMemorySource>(
      `select id, source_type, title, content, status, sensitivity, created_at, updated_at
       from avatar_memory_sources where user_id = $1 and status <> 'archived' order by updated_at desc limit 100`,
      [userId],
    ),
    query<AvatarEvolutionProposal>(
      `select id, category, title, description, confidence, evidence_json, patch_json, status, created_at, resolved_at
       from avatar_evolution_proposals where user_id = $1 order by created_at desc limit 100`,
      [userId],
    ),
    query<AvatarVersion>(
      `select id, version, label, snapshot_json, change_summary, source, status, created_at
       from avatar_versions where user_id = $1 order by version desc limit 30`,
      [userId],
    ),
    query<AvatarPrivacySettings>(
      `select learning_enabled, behavior_learning_enabled, customer_memory_enabled, auto_inference_enabled, visual_creation_enabled
       from avatar_privacy_settings where user_id = $1`,
      [userId],
    ),
    query<{ usage_count: string; last_used_at: string | null }>(
      `select count(*)::text as usage_count, max(created_at)::text as last_used_at from avatar_usage_logs where user_id = $1`,
      [userId],
    ),
    listAvatarVisualAssets(userId),
  ]);

  return {
    memories: memories.rows,
    sources: sources.rows,
    proposals: proposals.rows,
    versions: versions.rows,
    privacy: privacy.rows[0] ?? {
      learning_enabled: true,
      behavior_learning_enabled: true,
      customer_memory_enabled: false,
      auto_inference_enabled: true,
      visual_creation_enabled: true,
    },
    photos,
    usage: {
      count: Number(usage.rows[0]?.usage_count ?? 0),
      lastUsedAt: usage.rows[0]?.last_used_at ?? null,
    },
  };
}

export async function tryListActiveAvatarMemories(userId: string | null, limit = 40) {
  if (!userId) return [];
  try {
    const result = await query<AvatarMemoryItem>(
      `select * from (
         select id, category, title, content, source_id, origin, status, confidence, sensitivity, usage_scope, created_at, updated_at
         from avatar_memory_items
         where user_id = $1 and status = 'active' and usage_scope <> 'private'
           and (expires_at is null or expires_at > now())
         union all
         select id, 'expression'::text as category, title, left(content, 1400) as content, id as source_id,
           'imported'::text as origin, 'active'::text as status, 70 as confidence, sensitivity,
           'content'::text as usage_scope, created_at, updated_at
         from avatar_memory_sources
         where user_id = $1 and status = 'active'
       ) active_context
       order by confidence desc, updated_at desc limit $2`,
      [userId, limit],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryLogAvatarUsage(input: {
  userId: string | null;
  memoryIds: string[];
  contextType: string;
  workId?: string | null;
}) {
  if (!input.userId) return;
  try {
    const version = await query<{ version: number }>(
      `select version from avatar_versions where user_id = $1 and status in ('active', 'restored') order by version desc limit 1`,
      [input.userId],
    );
    await query(
      `insert into avatar_usage_logs(user_id, work_id, avatar_version, memory_ids, context_type)
       values ($1, $2, $3, $4::uuid[], $5)`,
      [input.userId, input.workId ?? null, version.rows[0]?.version ?? null, input.memoryIds, input.contextType],
    );
  } catch {
    // Avatar usage telemetry must not block content generation.
  }
}

export function formatAvatarMemoriesForPrompt(memories: AvatarMemoryItem[]) {
  if (memories.length === 0) return "";
  const labels: Record<string, string> = {
    identity: "身份", audience: "客户", expertise: "专业", expression: "表达", story: "案例", boundary: "边界", temporary: "临时",
  };
  return [
    "【数字分身长期记忆】",
    ...memories.map((item) => `- [${labels[item.category] ?? item.category}｜${item.origin}｜可信度${item.confidence}%] ${item.title ? `${item.title}：` : ""}${item.content}`),
    "以上记忆只用于辅助表达。推断记忆不得当作事实扩写；涉及客户、案例、数字和资质时必须以用户本次输入或可核验资料为准。",
  ].join("\n");
}

export async function resolveEvolutionProposal(userId: string, proposalId: string, decision: "accepted" | "rejected") {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const proposal = await client.query<AvatarEvolutionProposal>(
      `select id, category, title, description, confidence, evidence_json, patch_json, status, created_at, resolved_at
       from avatar_evolution_proposals where id = $1 and user_id = $2 for update`,
      [proposalId, userId],
    );
    const row = proposal.rows[0];
    if (!row || row.status !== "pending") throw new Error("进化建议不存在或已处理");
    await client.query(
      `update avatar_evolution_proposals set status = $3, resolved_at = now(), updated_at = now() where id = $1 and user_id = $2`,
      [proposalId, userId, decision],
    );
    if (decision === "accepted") {
      const patch = row.patch_json ?? {};
      const content = typeof patch.content === "string" ? patch.content : row.description;
      const title = typeof patch.title === "string" ? patch.title : row.title;
      const category = ["identity", "audience", "expertise", "expression", "story", "boundary", "temporary"].includes(row.category) ? row.category : "expression";
      await client.query(
        `insert into avatar_memory_items(user_id, category, title, content, origin, status, confidence, metadata_json)
         values ($1, $2, $3, $4, 'behavior', 'active', $5, jsonb_build_object('proposalId', $6))`,
        [userId, category, title, content, row.confidence, proposalId],
      );
      const nextVersion = await client.query<{ version: number }>(
        `select coalesce(max(version), 0) + 1 as version from avatar_versions where user_id = $1`,
        [userId],
      );
      const memorySnapshot = await client.query<{ id: string; category: string; title: string; content: string; confidence: number }>(
        `select id, category, title, content, confidence from avatar_memory_items where user_id = $1 and status = 'active' order by updated_at desc`,
        [userId],
      );
      await client.query(`update avatar_versions set status = 'superseded' where user_id = $1 and status = 'active'`, [userId]);
      await client.query(
        `insert into avatar_versions(user_id, version, label, snapshot_json, change_summary, source, status)
         values ($1, $2, $3, $4::jsonb, $5, 'evolution', 'active')`,
        [userId, nextVersion.rows[0].version, `V${nextVersion.rows[0].version}`, JSON.stringify({ memories: memorySnapshot.rows }), row.title],
      );
    }
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
