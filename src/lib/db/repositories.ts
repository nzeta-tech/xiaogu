import { getPool, query } from "./client";
import type { AgentMessage } from "@/lib/agent/insurance-agent";
import { creationApps, creationCategories, creationExamples, type CreationApp } from "@/lib/apps/catalog";
import type { BillingPlan } from "@/lib/billing/plans";
import type { ComplianceIssue } from "@/lib/compliance/check";
import {
  localQuestionnaireTemplate,
  type QuestionnaireAnswers,
  type QuestionnaireTemplate,
} from "@/lib/thinking/questionnaire-template";
import type { ThinkingProfileSnapshot, ThinkingProfileSummary } from "@/lib/thinking/profile-snapshot";
import type { HotTopic } from "@/lib/topics/types";
import { defaultSystemSettings, systemSettingKeys, type SystemSettings } from "@/lib/system/settings";

export async function tryCreateConversation(input: {
  userId: string | null;
  conversationId?: string;
  title?: string;
}) {
  if (!input.userId) return null;

  try {
    if (input.conversationId) {
      const existing = await query<{ id: string }>(
        "select id from conversations where id = $1 and user_id = $2",
        [input.conversationId, input.userId],
      );
      if (existing.rows[0]) return existing.rows[0].id;
    }

    const created = await query<{ id: string }>(
      "insert into conversations(user_id, title) values ($1, $2) returning id",
      [input.userId, input.title ?? "新的内容对话"],
    );
    return created.rows[0].id;
  } catch {
    return null;
  }
}

export async function trySaveMessages(input: {
  userId: string | null;
  conversationId: string | null;
  messages: AgentMessage[];
}) {
  if (!input.userId || !input.conversationId || input.messages.length === 0) return;

  try {
    for (const message of input.messages) {
      await query(
        `insert into messages(conversation_id, user_id, role, content)
         values ($1, $2, $3, $4)`,
        [input.conversationId, input.userId, message.role, message.content],
      );
    }

    await query("update conversations set updated_at = now() where id = $1", [input.conversationId]);
  } catch {
    // Message persistence errors are surfaced by callers that require a durable conversation.
  }
}

export async function tryListConversations(userId: string | null) {
  if (!userId) return [];

  try {
    const result = await query<{
      id: string;
      title: string;
      updated_at: string;
      message_count: string;
    }>(
      `select c.id, c.title, c.updated_at, count(m.id)::text as message_count
       from conversations c
       left join messages m on m.conversation_id = c.id
       where c.user_id = $1
       group by c.id
       order by c.updated_at desc
       limit 80`,
      [userId],
    );
    return result.rows.map((row) => ({ ...row, message_count: Number(row.message_count) }));
  } catch {
    return [];
  }
}

export async function tryGetConversationMessages(input: { userId: string | null; conversationId: string }) {
  if (!input.userId) return null;

  try {
    const conversation = await query<{ id: string; title: string; updated_at: string }>(
      "select id, title, updated_at from conversations where id = $1 and user_id = $2",
      [input.conversationId, input.userId],
    );
    if (!conversation.rows[0]) return null;

    const messages = await query<{
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
      created_at: string;
    }>(
      `select id, role, content, created_at
       from messages
       where conversation_id = $1
       order by created_at asc`,
      [input.conversationId],
    );

    return {
      ...conversation.rows[0],
      messages: messages.rows.filter((message) => message.role !== "system"),
    };
  } catch {
    return null;
  }
}

export async function tryDeleteConversation(input: { userId: string | null; conversationId: string }) {
  if (!input.userId) return false;

  try {
    const result = await query<{ id: string }>(
      `delete from conversations
       where id = $1 and user_id = $2
       returning id`,
      [input.conversationId, input.userId],
    );
    return Boolean(result.rows[0]);
  } catch {
    return false;
  }
}

export async function tryCreateWork(input: {
  userId: string | null;
  appRunId?: string | null;
  appCode?: string | null;
  conversationId?: string | null;
  title?: string;
  content: string;
  contentJson?: Record<string, unknown>;
  sourceChannel?: string;
  complianceRisk?: string;
}) {
  if (!input.userId) return null;

  try {
    const appRecord = input.appCode
      ? await query<{ id: string }>("select id from apps where code = $1 or slug = $1 limit 1", [input.appCode])
      : { rows: [] as Array<{ id: string }> };

    const result = await query<{
      id: string;
      title: string;
      status: string;
      compliance_risk: string;
      created_at: string;
      updated_at: string;
    }>(
      `insert into works(user_id, app_run_id, app_id, conversation_id, title, content_type, source_channel, status, compliance_risk)
       values ($1, $2, $3, $4, $5, 'text', $6, 'draft', $7)
       returning id, title, status, compliance_risk, created_at, updated_at`,
      [
        input.userId,
        input.appRunId ?? null,
        appRecord.rows[0]?.id ?? null,
        input.conversationId ?? null,
        input.title ?? inferTitle(input.content),
        input.sourceChannel ?? input.appCode ?? "",
        input.complianceRisk ?? "unchecked",
      ],
    );

    await query(
      `insert into work_versions(work_id, version_no, content, content_json, created_from)
       values ($1, 1, $2, '{}'::jsonb, 'generation')`,
      [result.rows[0].id, input.content],
    );

    if (input.contentJson) {
      await query(
        `update work_versions
         set content_json = $2::jsonb
         where work_id = $1 and version_no = 1`,
        [result.rows[0].id, JSON.stringify(input.contentJson)],
      );
    }

    return result.rows[0];
  } catch {
    return null;
  }
}

export async function tryUpdateWorkContent(input: {
  userId: string | null;
  workId: string;
  title?: string;
  status?: string;
  appRunId?: string | null;
  complianceRisk?: string;
  content: string;
  contentJson?: Record<string, unknown>;
}) {
  if (!input.userId) return null;

  try {
    const workRow = await query<{ id: string }>(
      `select id
       from works
       where id = $1 and user_id = $2`,
      [input.workId, input.userId],
    );
    if (!workRow.rows[0]) return null;

    if (input.title || input.appRunId || input.status || input.complianceRisk) {
      await query(
        `update works
         set title = coalesce($3, title),
             status = coalesce($4, status),
             app_run_id = coalesce($5, app_run_id),
             compliance_risk = coalesce($6, compliance_risk),
             updated_at = now()
         where id = $1 and user_id = $2`,
        [input.workId, input.userId, input.title ?? null, input.status ?? null, input.appRunId ?? null, input.complianceRisk ?? null],
      );
    } else {
      await query(
        `update works
         set updated_at = now()
         where id = $1 and user_id = $2`,
        [input.workId, input.userId],
      );
    }

    const latestVersion = await query<{ version_no: number }>(
      `select version_no
       from work_versions
       where work_id = $1
       order by version_no desc
       limit 1`,
      [input.workId],
    );

    if (latestVersion.rows[0]) {
      await query(
        `update work_versions
         set content = $2,
             content_json = $3::jsonb
         where work_id = $1 and version_no = $4`,
        [
          input.workId,
          input.content,
          JSON.stringify(input.contentJson ?? {}),
          latestVersion.rows[0].version_no,
        ],
      );
    } else {
      await query(
        `insert into work_versions(work_id, version_no, content, content_json, created_from)
         values ($1, 1, $2, $3::jsonb, 'generation')`,
        [input.workId, input.content, JSON.stringify(input.contentJson ?? {})],
      );
    }

    const result = await query<{
      id: string;
      title: string;
      status: string;
      compliance_risk: string;
      created_at: string;
      updated_at: string;
    }>(
      `select id, title, status, compliance_risk, created_at, updated_at
       from works
       where id = $1 and user_id = $2`,
      [input.workId, input.userId],
    );

    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryListWorks(userId: string | null) {
  if (!userId) return [];

  try {
    const worksResult = await query<{
      id: string;
      title: string;
      status: string;
      compliance_risk: string;
      updated_at: string;
      source_channel: string;
      content: string;
      note: string | null;
      is_favorite: boolean;
      is_used: boolean;
      quota_cost: number | null;
    }>(
      `select w.id, w.title, w.status, w.compliance_risk, w.updated_at, w.source_channel, w.note, w.is_favorite, w.is_used, ar.quota_cost,
              coalesce(
                (
                  select wv.content
                  from work_versions wv
                  where wv.work_id = w.id
                  order by wv.version_no desc
                  limit 1
                ),
                ''
              ) as content
       from works w
       left join app_runs ar on ar.id = w.app_run_id
       where w.user_id = $1 and w.status <> 'archived'
       order by w.updated_at desc
       limit 50`,
      [userId],
    );
    return worksResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      platform: row.source_channel,
      status: row.status,
      compliance_risk: row.compliance_risk,
      updated_at: row.updated_at,
      note: row.note,
      is_favorite: row.is_favorite,
      is_used: row.is_used,
      quota_cost: row.quota_cost,
    }));
  } catch {
    return [];
  }
}

export async function tryGetWorkDetail(input: { userId: string | null; workId: string }) {
  if (!input.userId) return null;

  try {
    const workResult = await query<{
      id: string;
      title: string;
      status: string;
      compliance_risk: string;
      created_at: string;
      updated_at: string;
      conversation_id: string | null;
      source_channel: string;
      content: string;
      note: string;
      is_favorite: boolean;
      is_used: boolean;
      app_run_id: string | null;
    }>(
      `select w.id, w.title, w.status, w.compliance_risk, w.created_at, w.updated_at, w.conversation_id, w.source_channel, w.note, w.is_favorite, w.is_used, w.app_run_id,
              coalesce(
                (
                  select wv.content
                  from work_versions wv
                  where wv.work_id = w.id
                  order by wv.version_no desc
                  limit 1
                ),
                ''
              ) as content
       from works w
       where w.id = $1 and w.user_id = $2`,
      [input.workId, input.userId],
    );
    if (!workResult.rows[0]) return null;

    const versions = await query<{
      id: string;
      version_no: number;
      content: string;
      content_json: Record<string, unknown>;
      created_from: string;
      created_at: string;
    }>(
      `select id, version_no, content, content_json, created_from, created_at
       from work_versions
       where work_id = $1
       order by version_no desc`,
      [workResult.rows[0].id],
    );
    const run = workResult.rows[0].app_run_id
      ? await query<{
          id: string;
          status: string;
          tone: string | null;
          target_channels: string[];
          model: string | null;
          quota_cost: number | null;
          input_payload: Record<string, unknown> | null;
          result_json: Record<string, unknown> | null;
          created_at: string;
          completed_at: string | null;
        }>(
          `select id, status, tone, target_channels, model, quota_cost, input_payload, result_json, created_at, completed_at
           from app_runs
           where id = $1`,
          [workResult.rows[0].app_run_id],
        )
      : { rows: [] as Array<{
          id: string;
          status: string;
          tone: string | null;
          target_channels: string[];
          model: string | null;
          quota_cost: number | null;
          input_payload: Record<string, unknown> | null;
          result_json: Record<string, unknown> | null;
          created_at: string;
          completed_at: string | null;
        }> };

    return {
      id: workResult.rows[0].id,
      title: workResult.rows[0].title,
      content: workResult.rows[0].content,
      platform: workResult.rows[0].source_channel,
      status: workResult.rows[0].status,
      compliance_risk: workResult.rows[0].compliance_risk,
      created_at: workResult.rows[0].created_at,
      updated_at: workResult.rows[0].updated_at,
      conversation_id: workResult.rows[0].conversation_id,
      note: workResult.rows[0].note,
      is_favorite: workResult.rows[0].is_favorite,
      is_used: workResult.rows[0].is_used,
      app_run: run.rows[0] ?? null,
      versions: versions.rows,
      content_json: versions.rows[0]?.content_json ?? null,
    };
  } catch {
    return null;
  }
}

export async function tryListRecoverableRunningWorks(limit = 20) {
  try {
    const result = await query<{
      work_id: string;
      app_run_id: string;
      user_id: string;
      source_channel: string;
      input_payload: Record<string, unknown> | null;
      quota_cost: number | null;
    }>(
      `select w.id as work_id,
              w.app_run_id,
              w.user_id,
              w.source_channel,
              ar.input_payload,
              ar.quota_cost
       from works w
       join app_runs ar on ar.id = w.app_run_id
       where ar.status = 'running'
         and ar.input_payload is not null
       order by ar.created_at asc
       limit $1`,
      [limit],
    );

    return result.rows;
  } catch {
    return [];
  }
}

export async function tryUpdateWorkStatus(input: {
  userId: string | null;
  workId: string;
  status: string;
}) {
  if (!input.userId) return null;

  try {
    const workResult = await query<{
      id: string;
      status: string;
      updated_at: string;
    }>(
      `update works
       set status = $3,
           is_used = case when $3 = 'used' then true else is_used end,
           updated_at = now()
       where id = $1 and user_id = $2
       returning id, status, updated_at`,
      [input.workId, input.userId, input.status],
    );
    return workResult.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryUpdateWorkMetadata(input: {
  userId: string | null;
  workId: string;
  status?: "draft" | "used" | "archived";
  note?: string;
  isFavorite?: boolean;
  isUsed?: boolean;
}) {
  if (!input.userId) return null;
  try {
    const result = await query<{ id: string; status: string; note: string; is_favorite: boolean; is_used: boolean; updated_at: string }>(
      `update works
       set status = coalesce($3, status),
           note = coalesce($4, note),
           is_favorite = coalesce($5, is_favorite),
           is_used = coalesce($6, is_used),
           updated_at = now()
       where id = $1 and user_id = $2
       returning id, status, note, is_favorite, is_used, updated_at`,
      [input.workId, input.userId, input.status ?? null, input.note ?? null, input.isFavorite ?? null, input.isUsed ?? null],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function trySaveComplianceReport(input: {
  userId: string | null;
  draftId?: string | null;
  riskLevel: string;
  issues: ComplianceIssue[];
  checkedText: string;
}) {
  if (!input.userId) return null;

  try {
    const result = await query<{ id: string }>(
      `insert into compliance_reports(user_id, draft_id, risk_level, issues, checked_text)
       values ($1, $2, $3, $4::jsonb, $5)
       returning id`,
      [
        input.userId,
        input.draftId ?? null,
        input.riskLevel,
        JSON.stringify(input.issues),
        input.checkedText,
      ],
    );
    return result.rows[0].id;
  } catch {
    return null;
  }
}

export async function trySaveUsageLog(input: {
  userId: string | null;
  actionType: string;
  quotaCost: number;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  metadata?: Record<string, unknown>;
}) {
  if (!input.userId) return null;

  try {
    const result = await query<{ id: string }>(
      `insert into usage_logs(user_id, action_type, quota_cost, model, input_tokens, output_tokens, metadata)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)
       returning id`,
      [
        input.userId,
        input.actionType,
        input.quotaCost,
        input.model ?? null,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    void import("@/lib/billing/notifications").then(({ maybeSendLowBalanceNotification }) => maybeSendLowBalanceNotification(input.userId!)).catch(() => undefined);
    return result.rows[0].id;
  } catch {
    return null;
  }
}

export async function trySaveTopicSnapshots(input: { userId: string | null; topics: HotTopic[] }) {
  if (input.topics.length === 0) return;

  try {
    for (const topic of input.topics.slice(0, 20)) {
      await query(
        `insert into topic_snapshots(
           user_id, source, title, summary, insurance_relevance, recommended_angle, risk_note, raw_payload
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          input.userId,
          topic.source,
          topic.title,
          topic.summary,
          topic.insuranceRelevance,
          topic.recommendedAngle,
          topic.riskNote,
          JSON.stringify(topic),
        ],
      );
    }
  } catch {
    // Topic snapshots are operational telemetry; avoid breaking discovery when persistence is down.
  }
}

export async function tryListLatestTopicSnapshots(input: { limit?: number; maxAgeMinutes?: number; allowStale?: boolean } = {}) {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 30);
  const maxAgeMinutes = Math.min(Math.max(input.maxAgeMinutes ?? 20, 1), 1440);

  try {
    const result = await query<{
      raw_payload: HotTopic;
      created_at: string;
    }>(
      `with latest as (
         select max(created_at) as created_at
         from topic_snapshots
         where $2::boolean or created_at >= now() - ($1::int * interval '1 minute')
       )
       select distinct on (title) raw_payload, topic_snapshots.created_at
       from topic_snapshots, latest
       where latest.created_at is not null
         and topic_snapshots.created_at >= latest.created_at - interval '30 seconds'
       order by title, topic_snapshots.created_at desc`,
      [maxAgeMinutes, input.allowStale ?? false],
    );

    const rows = result.rows
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, limit);
    return {
      topics: rows.map((row) => row.raw_payload),
      refreshedAt: rows[0]?.created_at ?? null,
      stale: rows[0] ? Date.now() - new Date(rows[0].created_at).getTime() > maxAgeMinutes * 60_000 : false,
    };
  } catch {
    return { topics: [], refreshedAt: null, stale: false };
  }
}

export async function tryCreateOrder(input: {
  userId: string | null;
  provider: string;
  plan: BillingPlan;
  status?: "pending" | "paid";
  baseAmountCents?: number;
  feeCents?: number;
  metadata?: Record<string, unknown>;
}) {
  if (!input.userId) return null;

  try {
    const result = await query<{
      id: string;
      provider: string;
      status: string;
      amount_cents: number;
      currency: string;
      quota_amount: number;
      created_at: string;
    }>(
      `insert into orders(user_id, provider, status, amount_cents, base_amount_cents, fee_cents, currency, quota_amount, metadata, paid_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, case when $3 = 'paid' then now() else null end)
       returning id, provider, status, amount_cents, currency, quota_amount, created_at`,
      [
        input.userId,
        input.provider,
        input.status ?? "pending",
        input.plan.amountCents,
        input.baseAmountCents ?? input.plan.amountCents,
        input.feeCents ?? 0,
        input.plan.currency,
        input.plan.quotaAmount,
        JSON.stringify({
          planCode: input.plan.code,
          planName: input.plan.name,
          ...input.metadata,
        }),
      ],
    );
    return result.rows[0];
  } catch {
    return null;
  }
}

export async function tryGetTodayPaidAmountCents(userId: string, timezone = "Asia/Shanghai") {
  try {
    const result = await query<{ total: string }>(
      `select coalesce(sum(amount_cents),0)::text as total
       from orders
       where user_id=$1 and status='paid' and paid_at is not null
         and (paid_at at time zone $2)::date = (now() at time zone $2)::date`,
      [userId, timezone],
    );
    return Number(result.rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

export async function tryListBillingPlans(options: { includeInactive?: boolean } = {}) {
  try {
    const result = await query<{
      code: string;
      name: string;
      quota_amount: number;
      amount_cents: number;
      currency: "CNY" | "USD";
      description: string;
      recommended: boolean;
      status: string;
      sort_order: number;
    }>(
      `select code, name, quota_amount, amount_cents, currency, description, recommended, status, sort_order
       from billing_plans
       where $1::boolean = true or status = 'active'
       order by sort_order asc, amount_cents asc`,
      [Boolean(options.includeInactive)],
    );
    return result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      quotaAmount: row.quota_amount,
      amountCents: row.amount_cents,
      currency: row.currency,
      description: row.description,
      recommended: row.recommended,
      status: row.status,
      sortOrder: row.sort_order,
    }));
  } catch {
    return [];
  }
}

export async function tryGetBillingPlan(code: string) {
  const plans = await tryListBillingPlans();
  return plans.find((plan) => plan.code === code) ?? null;
}

export async function tryUpsertBillingPlan(input: {
  code: string;
  name: string;
  quotaAmount: number;
  amountCents: number;
  currency: "CNY" | "USD";
  description: string;
  recommended?: boolean;
  status?: string;
  sortOrder?: number;
}) {
  try {
    const result = await query<{
      code: string;
      name: string;
      quota_amount: number;
      amount_cents: number;
      currency: "CNY" | "USD";
      description: string;
      recommended: boolean;
      status: string;
      sort_order: number;
    }>(
      `insert into billing_plans(code, name, quota_amount, amount_cents, currency, description, recommended, status, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (code) do update set
         name = excluded.name,
         quota_amount = excluded.quota_amount,
         amount_cents = excluded.amount_cents,
         currency = excluded.currency,
         description = excluded.description,
         recommended = excluded.recommended,
         status = excluded.status,
         sort_order = excluded.sort_order,
         updated_at = now()
       returning code, name, quota_amount, amount_cents, currency, description, recommended, status, sort_order`,
      [
        input.code,
        input.name,
        input.quotaAmount,
        input.amountCents,
        input.currency,
        input.description,
        Boolean(input.recommended),
        input.status ?? "active",
        input.sortOrder ?? 0,
      ],
    );
    const row = result.rows[0];
    return row
      ? {
          code: row.code,
          name: row.name,
          quotaAmount: row.quota_amount,
          amountCents: row.amount_cents,
          currency: row.currency,
          description: row.description,
          recommended: row.recommended,
          status: row.status,
          sortOrder: row.sort_order,
        }
      : null;
  } catch {
    return null;
  }
}

export async function tryUpdateOrderCheckout(input: {
  orderId: string | null;
  providerOrderId?: string | null;
  checkoutUrl?: string | null;
}) {
  if (!input.orderId) return null;

  try {
    const result = await query<{ id: string; checkout_url: string | null; provider_order_id: string | null }>(
      `update orders
       set provider_order_id = coalesce($2, provider_order_id),
           checkout_url = coalesce($3, checkout_url)
       where id = $1
       returning id, checkout_url, provider_order_id`,
      [input.orderId, input.providerOrderId ?? null, input.checkoutUrl ?? null],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryMarkOrderPaidByProvider(input: { provider: string; providerOrderId: string }) {
  try {
    const result = await query<{
      id: string;
      user_id: string;
      quota_amount: number;
      status: string;
    }>(
      `update orders
       set status = 'paid', paid_at = coalesce(paid_at, now())
       where provider = $1 and provider_order_id = $2 and status <> 'paid'
       returning id, user_id, quota_amount, status`,
      [input.provider, input.providerOrderId],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryGetOrderByProvider(input: { provider: string; providerOrderId: string }) {
  try {
    const result = await query<{ id: string; user_id: string; quota_amount: number; status: string }>(
      `select id, user_id, quota_amount, status
       from orders
       where provider = $1 and provider_order_id = $2
       limit 1`,
      [input.provider, input.providerOrderId],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryListOrders(userId: string | null) {
  if (!userId) return [];

  try {
    const result = await query<{
      id: string;
      provider: string;
      provider_order_id: string | null;
      checkout_url: string | null;
      status: string;
      amount_cents: number;
      currency: string;
      quota_amount: number;
      created_at: string;
      paid_at: string | null;
    }>(
      `select id, provider, provider_order_id, checkout_url, status, amount_cents, currency, quota_amount, created_at, paid_at
       from orders
       where user_id = $1
       order by created_at desc
       limit 50`,
      [userId],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryExpirePendingOrders(userId: string, timeoutMinutes: number) {
  try {
    const result = await query<{ id: string }>(
      `update orders set status='cancelled'
       where user_id=$1 and status='pending' and created_at < now()-($2||' minutes')::interval
       returning id`,
      [userId, timeoutMinutes],
    );
    return result.rows.map((row) => row.id);
  } catch {
    return [];
  }
}

export async function tryCountPendingOrders(userId: string) {
  try {
    const result = await query<{ count: string }>("select count(*)::text as count from orders where user_id=$1 and status='pending'", [userId]);
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function tryListAdminOrders(limit = 100) {
  try {
    const result = await query<{
      id: string;
      provider: string;
      provider_order_id: string | null;
      checkout_url: string | null;
      status: string;
      amount_cents: number;
      currency: string;
      quota_amount: number;
      metadata: Record<string, unknown>;
      created_at: string;
      paid_at: string | null;
      user_id: string;
      user_email: string;
      user_name: string;
    }>(
      `select o.id, o.provider, o.provider_order_id, o.checkout_url, o.status, o.amount_cents, o.currency,
              o.quota_amount, o.metadata, o.created_at, o.paid_at, u.id as user_id, u.email as user_email, u.name as user_name
       from orders o
       join users u on u.id = o.user_id
       order by o.created_at desc
       limit $1`,
      [Math.min(Math.max(limit, 1), 500)],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryUpdateAdminOrderStatus(input: { orderId: string; status: string; expectedStatus?: string }) {
  try {
    const result = await query<{
      id: string;
      status: string;
      paid_at: string | null;
    }>(
      `update orders
       set status = $2,
           paid_at = case when $2 = 'paid' then coalesce(paid_at, now()) else paid_at end,
           refunded_at = case when $2 = 'refunded' then now() else refunded_at end
       where id = $1
         and ($3::text is null or status = $3)
       returning id, status, paid_at`,
      [input.orderId, input.status, input.expectedStatus ?? null],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryGetLocalQuotaBalance(userId: string | null) {
  if (!userId) return 0;

  try {
    const result = await query<{ balance: string | null }>(
      `with grants as (
         select coalesce(sum(quota_amount), 0) as total
         from orders
         where user_id = $1
           and status = 'paid'
       ),
       gifts as (
         select coalesce(sum(quota_amount), 0) as total
         from gift_records
         where user_id = $1
           and status = 'granted'
       ),
       usage as (
         select coalesce(sum(quota_cost), 0) as total
         from usage_logs
         where user_id = $1
       )
       select greatest((select total from grants) + (select total from gifts) - (select total from usage), 0)::text as balance`,
      [userId],
    );
    return Number(result.rows[0]?.balance ?? 0);
  } catch {
    return 0;
  }
}

export async function tryListUsageLogs(userId: string | null) {
  if (!userId) return [];

  try {
    const result = await query<{
      id: string;
      action_type: string;
      quota_cost: number;
      model: string | null;
      metadata: Record<string, unknown>;
      created_at: string;
    }>(
      `select id, action_type, quota_cost, model, metadata, created_at
       from usage_logs
       where user_id = $1
       order by created_at desc
       limit 100`,
      [userId],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryGetBrokerProfile(userId: string | null) {
  if (!userId) return null;

  try {
    const result = await query<{
      compliance_level: string;
      display_name: string;
      ip_tagline: string;
      profile_summary: string;
      brand_keywords: string[];
      content_style_summary: string;
      source_questionnaire_id: string | null;
    }>(
      `select compliance_level, display_name, ip_tagline, profile_summary, brand_keywords, content_style_summary, source_questionnaire_id
       from broker_profiles
       where user_id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryUpdateBrokerProfile(input: {
  userId: string | null;
  displayName?: string;
  ipTagline?: string;
  profileSummary?: string;
  brandKeywords?: string[];
  contentStyleSummary?: string;
  sourceQuestionnaireId?: string | null;
}) {
  if (!input.userId) return null;

  try {
    const result = await query<{
      compliance_level: string;
      display_name: string;
      ip_tagline: string;
      profile_summary: string;
      brand_keywords: string[];
      content_style_summary: string;
      source_questionnaire_id: string | null;
    }>(
      `insert into broker_profiles(
         user_id, display_name, ip_tagline, profile_summary, brand_keywords, content_style_summary, source_questionnaire_id
       )
       values ($1, $2, $3, $4, $5::text[], $6, $7)
       on conflict (user_id) do update set
         display_name = excluded.display_name,
         ip_tagline = excluded.ip_tagline,
         profile_summary = excluded.profile_summary,
         brand_keywords = excluded.brand_keywords,
         content_style_summary = excluded.content_style_summary,
         source_questionnaire_id = excluded.source_questionnaire_id,
         updated_at = now()
       returning compliance_level, display_name, ip_tagline, profile_summary, brand_keywords, content_style_summary, source_questionnaire_id`,
      [
        input.userId,
        input.displayName ?? "",
        input.ipTagline ?? "",
        input.profileSummary ?? "",
        input.brandKeywords ?? [],
        input.contentStyleSummary ?? "",
        input.sourceQuestionnaireId ?? null,
      ],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryEnsureQuestionnaireTemplate(template: QuestionnaireTemplate = localQuestionnaireTemplate) {
  try {
    const inserted = await query<{ id: string }>(
      `insert into questionnaire_templates(code, name, version, description, status)
       values ('persona-questionnaire-v2', $1, 2, $2, 'active')
       on conflict (code) do update set
         name = excluded.name,
         description = excluded.description,
         updated_at = now()
       returning id`,
      [template.title, template.description ?? ""],
    );
    const templateId = inserted.rows[0].id;

    for (const [sectionIndex, section] of template.structure.sections.entries()) {
      const sectionRow = await query<{ id: string }>(
        `insert into questionnaire_template_sections(template_id, section_key, title, description, sort_order)
         values ($1, $2, $3, $4, $5)
         on conflict (template_id, section_key) do update set
           title = excluded.title,
           description = excluded.description,
           sort_order = excluded.sort_order
         returning id`,
        [templateId, section.section_id, section.section_title, section.section_description ?? "", sectionIndex],
      );

      for (const [questionIndex, question] of section.questions.entries()) {
        await query(
          `insert into questionnaire_template_questions(
             template_id, section_id, question_key, question_text, helper_text, placeholder, input_type, is_required, sort_order, config_json
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
           on conflict (template_id, question_key) do update set
             section_id = excluded.section_id,
             question_text = excluded.question_text,
             helper_text = excluded.helper_text,
             placeholder = excluded.placeholder,
             input_type = excluded.input_type,
             is_required = excluded.is_required,
             sort_order = excluded.sort_order,
             config_json = excluded.config_json`,
          [
            templateId,
            sectionRow.rows[0].id,
            question.question_id,
            question.question_text,
            question.helper_text,
            question.placeholder,
            question.input_type,
            question.is_required,
            questionIndex,
            JSON.stringify({
              minItems: question.min_items ?? null,
              maxTotalDuration: question.max_total_duration ?? null,
              options: question.options ?? null,
              choiceLabels: question.choice_labels ?? null,
            }),
          ],
        );
      }
    }

    return { id: templateId, code: "persona-questionnaire-v2" };
  } catch {
    return null;
  }
}

export async function tryGetLatestQuestionnaire(userId: string | null) {
  if (!userId) return null;

  try {
    const questionnaire = await query<{
      id: string;
      template_id: string;
      status: string;
      source: string;
      completion_percent: number;
      summary_text: string;
      created_at: string;
      updated_at: string;
      submitted_at: string | null;
    }>(
      `select id, template_id, status, source, completion_percent, summary_text, created_at, updated_at, submitted_at
       from profile_questionnaires
       where user_id = $1
       order by updated_at desc
       limit 1`,
      [userId],
    );

    const row = questionnaire.rows[0];
    if (!row) return null;

    const answers = await query<{
      section_key: string;
      question_key: string;
      answer_text: string;
      answer_json: Record<string, unknown>;
    }>(
      `select section_key, question_key, answer_text, answer_json
       from profile_questionnaire_answers
       where questionnaire_id = $1
       order by sort_order asc, created_at asc`,
      [row.id],
    );

    return {
      ...row,
      answers: answers.rows,
    };
  } catch {
    return null;
  }
}

export async function tryGetLatestThinkingProfileSnapshot(userId: string | null) {
  if (!userId) return null;

  try {
    const result = await query<{
      id: string;
      questionnaire_id: string;
      version: number;
      status: string;
      snapshot_json: ThinkingProfileSnapshot;
      summary_json: ThinkingProfileSummary;
      created_at: string;
      updated_at: string;
    }>(
      `select id, questionnaire_id, version, status, snapshot_json, summary_json, created_at, updated_at
       from thinking_profile_snapshots
       where user_id = $1
       order by updated_at desc
       limit 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function trySaveQuestionnaire(input: {
  userId: string | null;
  template?: QuestionnaireTemplate;
  answers: QuestionnaireAnswers;
  status?: "draft" | "completed";
  source?: string;
  summaryText?: string;
}) {
  if (!input.userId) return null;

  const template = input.template ?? localQuestionnaireTemplate;
  const ensured = await tryEnsureQuestionnaireTemplate(template);
  if (!ensured) return null;

  const questions = template.structure.sections.flatMap((section) => section.questions.map((question) => ({
    sectionId: section.section_id,
    questionId: question.question_id,
    required: question.is_required,
  })));
  const completedCount = questions.filter((item) => {
    const value = input.answers[item.sectionId]?.[item.questionId]?.items?.[0]?.content ?? "";
    return value.trim().length > 0;
  }).length;
  const completionPercent = questions.length === 0 ? 0 : Math.round((completedCount / questions.length) * 100);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const existing = await client.query<{ id: string }>(
      `select id
       from profile_questionnaires
       where user_id = $1 and template_id = $2 and status in ('draft', 'completed')
       order by updated_at desc
       limit 1`,
      [input.userId, ensured.id],
    );

    let questionnaireId = existing.rows[0]?.id ?? null;
    if (questionnaireId) {
      await client.query(
        `update profile_questionnaires
         set status = $2,
             source = $3,
             completion_percent = $4,
             summary_text = $5,
             updated_at = now(),
             submitted_at = case when $2 = 'completed' then now() else submitted_at end
         where id = $1`,
        [
          questionnaireId,
          input.status ?? "draft",
          input.source ?? "user_fill",
          completionPercent,
          input.summaryText ?? "",
        ],
      );
      await client.query(`delete from profile_questionnaire_answers where questionnaire_id = $1`, [questionnaireId]);
    } else {
      const inserted = await client.query<{ id: string }>(
        `insert into profile_questionnaires(user_id, template_id, status, source, completion_percent, summary_text, submitted_at)
         values ($1, $2, $3, $4, $5, $6, case when $3 = 'completed' then now() else null end)
         returning id`,
        [
          input.userId,
          ensured.id,
          input.status ?? "draft",
          input.source ?? "user_fill",
          completionPercent,
          input.summaryText ?? "",
        ],
      );
      questionnaireId = inserted.rows[0].id;
    }

    let sortOrder = 0;
    for (const section of template.structure.sections) {
      for (const question of section.questions) {
        const node = input.answers[section.section_id]?.[question.question_id];
        const answerText = node?.items?.map((item) => item.content).join("\n").trim() ?? "";
        await client.query(
          `insert into profile_questionnaire_answers(
             questionnaire_id, section_key, question_key, answer_text, answer_json, answer_source, sort_order
           )
           values ($1, $2, $3, $4, $5::jsonb, 'typed', $6)`,
          [
            questionnaireId,
            section.section_id,
            question.question_id,
            answerText,
            JSON.stringify(node ?? { items: [] }),
            sortOrder++,
          ],
        );
      }
    }

    await client.query("commit");
    return { id: questionnaireId, templateId: ensured.id, completionPercent };
  } catch {
    await client.query("rollback");
    return null;
  } finally {
    client.release();
  }
}

export async function trySaveThinkingProfileSnapshot(input: {
  userId: string | null;
  questionnaireId: string | null;
  snapshot: ThinkingProfileSnapshot;
  summary: ThinkingProfileSummary;
  version?: number;
}) {
  if (!input.userId || !input.questionnaireId) return null;

  try {
    const result = await query<{
      id: string;
      questionnaire_id: string;
      version: number;
      status: string;
      snapshot_json: ThinkingProfileSnapshot;
      summary_json: ThinkingProfileSummary;
      created_at: string;
      updated_at: string;
    }>(
      `insert into thinking_profile_snapshots(
         user_id, questionnaire_id, version, status, snapshot_json, summary_json
       )
       values ($1, $2, $3, 'active', $4::jsonb, $5::jsonb)
       on conflict (questionnaire_id, version) do update set
         status = excluded.status,
         snapshot_json = excluded.snapshot_json,
         summary_json = excluded.summary_json,
         updated_at = now()
       returning id, questionnaire_id, version, status, snapshot_json, summary_json, created_at, updated_at`,
      [
        input.userId,
        input.questionnaireId,
        input.version ?? 1,
        JSON.stringify(input.snapshot),
        JSON.stringify(input.summary),
      ],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryCreateAppRun(input: {
  userId: string | null;
  appCode: string;
  tone?: string;
  targetChannels?: string[];
  inputPayload?: Record<string, unknown>;
  resolvedPrompt?: string;
  quotaCost?: number;
  model?: string | null;
}) {
  if (!input.userId) return null;

  try {
    const app = await query<{ id: string }>(
      `select id from apps where code = $1 or slug = $1 limit 1`,
      [input.appCode],
    );
    const questionnaire = await query<{ id: string }>(
      `select id from profile_questionnaires
       where user_id = $1 and status = 'completed'
       order by updated_at desc
       limit 1`,
      [input.userId],
    );

    const result = await query<{ id: string; created_at: string }>(
      `insert into app_runs(
         user_id, app_id, questionnaire_id, status, tone, target_channels, input_payload, resolved_prompt, quota_cost, model
       )
       values ($1, $2, $3, 'running', $4, $5::text[], $6::jsonb, $7, $8, $9)
       returning id, created_at`,
      [
        input.userId,
        app.rows[0]?.id ?? null,
        questionnaire.rows[0]?.id ?? null,
        input.tone ?? null,
        input.targetChannels ?? [],
        JSON.stringify(input.inputPayload ?? {}),
        input.resolvedPrompt ?? "",
        input.quotaCost ?? 0,
        input.model ?? null,
      ],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryCompleteAppRun(input: {
  runId: string | null;
  status: "succeeded" | "failed";
  resultText?: string;
  resultJson?: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  if (!input.runId) return null;

  try {
    const result = await query<{ id: string; status: string; completed_at: string | null }>(
      `update app_runs
       set status = $2,
           result_text = $3,
           result_json = $4::jsonb,
           error_message = $5,
           completed_at = now()
       where id = $1
         and status <> 'succeeded'
       returning id, status, completed_at`,
      [
        input.runId,
        input.status,
        input.resultText ?? "",
        JSON.stringify(input.resultJson ?? {}),
        input.errorMessage ?? null,
      ],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function trySyncCreationCatalog() {
  try {
    const categoryMap = new Map<string, string>();
    for (const [index, category] of creationCategories.entries()) {
      const result = await query<{ id: string }>(
        `insert into app_categories(code, name, description, sort_order, status)
         values ($1, $2, $3, $4, 'active')
         on conflict (code) do update set
           name = excluded.name,
           description = excluded.description,
           sort_order = excluded.sort_order,
           updated_at = now()
         returning id`,
        [category.id, category.label, category.description, index],
      );
      categoryMap.set(category.id, result.rows[0].id);
    }

    for (const [index, app] of creationApps.entries()) {
      const appRow = await query<{ id: string }>(
        `insert into apps(
           category_id, code, slug, name, emoji, description, badge, points_cost, result_type, prompt_strategy, requires_thinking, featured, status, metadata, sort_order
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'default', $10, $11, 'active', $12::jsonb, $13)
         on conflict (slug) do update set
           category_id = excluded.category_id,
           code = excluded.code,
           name = excluded.name,
           emoji = excluded.emoji,
           description = excluded.description,
           result_type = excluded.result_type,
           requires_thinking = excluded.requires_thinking,
           metadata = excluded.metadata,
           updated_at = now()
         returning id`,
        [
          categoryMap.get(app.category) ?? null,
          app.id,
          app.slug,
          app.name,
          app.emoji,
          app.description,
          app.badge ?? null,
          app.points,
          app.resultType,
          app.requiresThinking ?? false,
          app.featured ?? false,
          JSON.stringify({
            promptHint: app.promptHint,
            exampleTitle: app.exampleTitle ?? "",
            exampleSummary: app.exampleSummary ?? "",
          }),
          index,
        ],
      );

      await query(
        `delete from app_input_fields
         where app_id = $1
           and not (field_key = any($2::text[]))`,
        [appRow.rows[0].id, app.fields.map((field) => field.id)],
      );

      for (const [fieldIndex, field] of app.fields.entries()) {
        await query(
          `insert into app_input_fields(
             app_id, field_key, label, field_type, is_required, placeholder, helper_text, options_json, config_json, sort_order
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
           on conflict (app_id, field_key) do update set
             label = excluded.label,
             field_type = excluded.field_type,
             is_required = excluded.is_required,
             placeholder = excluded.placeholder,
             helper_text = excluded.helper_text,
             options_json = excluded.options_json,
             config_json = excluded.config_json,
             sort_order = excluded.sort_order,
             updated_at = now()`,
          [
            appRow.rows[0].id,
            field.id,
            field.label,
            field.type,
            field.required ?? false,
            field.placeholder ?? "",
            field.helper ?? "",
            JSON.stringify(field.options ?? []),
            JSON.stringify({
              accept: field.accept ?? null,
              multiple: field.multiple ?? false,
              maxLength: field.maxLength ?? null,
            }),
            fieldIndex,
          ],
        );
      }
    }

    for (const [index, example] of creationExamples.entries()) {
      await query(
        `insert into app_examples(app_id, slug, title, summary, content_json, status, sort_order)
         values (
           (select id from apps where slug = $1 limit 1),
           $2, $3, $4, $5::jsonb, 'active', $6
         )
         on conflict (slug) do update set
           app_id = (select id from apps where slug = $1 limit 1),
           title = excluded.title,
           summary = excluded.summary,
           content_json = excluded.content_json,
           sort_order = excluded.sort_order,
           updated_at = now()`,
        [
          example.appSlug,
          example.slug,
          example.title,
          example.summary,
          JSON.stringify({
            appSlug: example.appSlug,
            intro: example.intro,
            highlight: example.highlight ?? "",
            ctaLabel: example.ctaLabel ?? "",
            tabs: example.tabs ?? [],
            linkedExamples: example.linkedExamples ?? [],
            exampleType: example.exampleType ?? "text",
            sections: example.sections,
            outputs: example.outputs ?? [],
            imageResults: example.imageResults ?? [],
          }),
          index,
        ],
      );
    }

    return true;
  } catch {
    return false;
  }
}

export async function tryListCreationCatalog() {
  try {
    const categoryRows = await query<{
      code: string;
      name: string;
      description: string;
    }>(
      `select code, name, description
       from app_categories
       where status = 'active'
       order by sort_order asc, created_at asc`,
    );

    const appRows = await query<{
      id: string;
      code: string;
      slug: string;
      name: string;
      emoji: string;
      description: string;
      badge: string | null;
      points_cost: number;
      result_type: "text" | "image-plan" | "image";
      requires_thinking: boolean;
      featured: boolean;
      metadata: Record<string, unknown>;
      category_code: string | null;
    }>(
      `select a.id, a.code, a.slug, a.name, a.emoji, a.description, a.badge, a.points_cost, a.result_type, a.requires_thinking, a.featured, a.metadata,
              c.code as category_code
       from apps a
       left join app_categories c on c.id = a.category_id
       where a.status = 'active'
       order by a.sort_order asc, a.created_at asc`,
    );

    const fieldRows = await query<{
      app_id: string;
      field_key: string;
      label: string;
      field_type: CreationApp["fields"][number]["type"];
      is_required: boolean;
      placeholder: string;
      helper_text: string;
      options_json: Array<{ label: string; value: string }>;
      config_json: Record<string, unknown>;
    }>(
      `select app_id, field_key, label, field_type, is_required, placeholder, helper_text, options_json, config_json
       from app_input_fields
       order by sort_order asc, created_at asc`,
    );

    if (appRows.rows.length === 0) return { categories: [], apps: [] };

    const fieldsByAppId = new Map<string, CreationApp["fields"]>();
    for (const row of fieldRows.rows) {
      const current = fieldsByAppId.get(row.app_id) ?? [];
      current.push({
        id: row.field_key,
        label: row.label,
        type: row.field_type,
        required: row.is_required,
        placeholder: row.placeholder || undefined,
        helper: row.helper_text || undefined,
        options: Array.isArray(row.options_json) ? row.options_json : [],
        accept: typeof row.config_json?.accept === "string" ? row.config_json.accept : undefined,
        multiple: Boolean(row.config_json?.multiple),
        maxLength: typeof row.config_json?.maxLength === "number" ? row.config_json.maxLength : undefined,
      });
      fieldsByAppId.set(row.app_id, current);
    }

    const apps = appRows.rows.map((row) => ({
      id: row.code,
      slug: row.slug,
      name: row.name,
      emoji: row.emoji,
      category: (row.category_code as CreationApp["category"]) ?? "content",
      points: row.points_cost,
      badge: row.badge ?? undefined,
      featured: row.featured,
      requiresThinking: row.requires_thinking,
      description: row.description,
      promptHint: typeof row.metadata?.promptHint === "string" ? row.metadata.promptHint : "",
      resultType: row.result_type,
      exampleTitle: typeof row.metadata?.exampleTitle === "string" ? row.metadata.exampleTitle : undefined,
      exampleSummary: typeof row.metadata?.exampleSummary === "string" ? row.metadata.exampleSummary : undefined,
      fields: fieldsByAppId.get(row.id) ?? [],
    }));

    const categories = categoryRows.rows.map((row) => ({
      id: row.code as CreationApp["category"],
      label: row.name,
      description: row.description,
      count: apps.filter((app) => app.category === row.code).length,
    }));

    return { categories, apps };
  } catch {
    return { categories: [], apps: [] };
  }
}

export async function tryListAdminCreationApps() {
  try {
    const result = await query<{
      id: string;
      code: string;
      slug: string;
      name: string;
      emoji: string;
      description: string;
      badge: string | null;
      points_cost: number;
      result_type: string;
      requires_thinking: boolean;
      featured: boolean;
      status: string;
      sort_order: number;
      category_name: string | null;
      run_count: string;
      updated_at: string;
    }>(
      `select a.id, a.code, a.slug, a.name, a.emoji, a.description, a.badge, a.points_cost, a.result_type,
              a.requires_thinking, a.featured, a.status, a.sort_order, a.updated_at, c.name as category_name,
              coalesce((select count(*) from app_runs ar where ar.app_id = a.id), 0)::text as run_count
       from apps a
       left join app_categories c on c.id = a.category_id
       order by a.sort_order asc, a.created_at asc`,
    );
    return result.rows.map((row) => ({ ...row, run_count: Number(row.run_count ?? 0) }));
  } catch {
    return [];
  }
}

export async function tryUpdateAdminCreationApp(input: {
  appId: string;
  status?: string;
  featured?: boolean;
  pointsCost?: number;
  badge?: string | null;
  sortOrder?: number;
}) {
  try {
    const result = await query<{
      id: string;
      slug: string;
      status: string;
      featured: boolean;
      points_cost: number;
      badge: string | null;
      sort_order: number;
      updated_at: string;
    }>(
      `update apps
       set status = coalesce($2, status),
           featured = coalesce($3, featured),
           points_cost = coalesce($4, points_cost),
           badge = coalesce($5, badge),
           sort_order = coalesce($6, sort_order),
           updated_at = now()
       where id = $1
       returning id, slug, status, featured, points_cost, badge, sort_order, updated_at`,
      [input.appId, input.status ?? null, input.featured ?? null, input.pointsCost ?? null, input.badge ?? null, input.sortOrder ?? null],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryGetCreationAppBySlug(slug: string) {
  const catalog = await tryListCreationCatalog();
  return catalog.apps.find((app) => app.slug === slug) ?? null;
}

export async function tryGetCreationExampleBySlug(slug: string) {
  try {
    const row = await query<{
      slug: string;
      title: string;
      summary: string;
      content_json: {
        appSlug?: string;
        intro?: string;
        highlight?: string;
        ctaLabel?: string;
        tabs?: string[];
        linkedExamples?: string[];
        exampleType?: "text" | "image";
        sections?: Array<{ id?: string; title: string; body: string; quote?: string }>;
        outputs?: Array<{
          id?: string;
          title: string;
          tag?: string;
          body: string;
          quote?: string;
          viewMode?: "plain" | "wechat";
          children?: Array<{ id?: string; title: string; body: string; quote?: string }>;
        }>;
        imageResults?: Array<{
          id?: string;
          title: string;
          imageUrl: string;
          badge?: string;
          ratio?: string;
          prompt?: string;
        }>;
      };
    }>(
      `select slug, title, summary, content_json
       from app_examples
       where slug = $1 and status = 'active'
       limit 1`,
      [slug],
    );

    if (row.rows[0]) {
      return {
        slug: row.rows[0].slug,
        appSlug: row.rows[0].content_json?.appSlug ?? "",
        title: row.rows[0].title,
        summary: row.rows[0].summary,
        intro: row.rows[0].content_json?.intro ?? "",
        highlight: row.rows[0].content_json?.highlight ?? "",
        ctaLabel: row.rows[0].content_json?.ctaLabel ?? "",
        tabs: Array.isArray(row.rows[0].content_json?.tabs) ? row.rows[0].content_json.tabs : [],
        linkedExamples: Array.isArray(row.rows[0].content_json?.linkedExamples) ? row.rows[0].content_json.linkedExamples : [],
        exampleType: (row.rows[0].content_json?.exampleType === "image" ? "image" : "text") as "image" | "text",
        sections: Array.isArray(row.rows[0].content_json?.sections) ? row.rows[0].content_json.sections : [],
        outputs: Array.isArray(row.rows[0].content_json?.outputs) ? row.rows[0].content_json.outputs : [],
        imageResults: Array.isArray(row.rows[0].content_json?.imageResults) ? row.rows[0].content_json.imageResults : [],
      };
    }
  } catch {
    // Fallback below.
  }

  const fallback = creationExamples.find((example) => example.slug === slug);
  return fallback ?? null;
}

export async function tryGetAdminSummary() {
  try {
    const [users, activeUsers, conversations, drafts, orders, paidOrders, paidUsers, usage, todayRevenue, yesterdayRevenue, newUsersToday, newUsersYesterday, openFeedback, failedRuns, compliance, recentUsers, recentOrders, recentUsage, announcements, promoCodes] =
      await Promise.all([
      query<{ count: string }>("select count(*) from users"),
      query<{ count: string }>("select count(*) from users where status = 'active'"),
      query<{ count: string }>("select count(*) from conversations"),
      query<{ count: string }>("select count(*) from works"),
      query<{ count: string }>("select count(*) from orders"),
      query<{ total: string | null }>("select coalesce(sum(amount_cents), 0)::text as total from orders where status = 'paid'"),
      query<{ count: string }>("select count(distinct user_id) from orders where status = 'paid'"),
      query<{ total: string | null }>("select coalesce(sum(quota_cost), 0)::text as total from usage_logs"),
      query<{ total: string | null }>("select coalesce(sum(amount_cents), 0)::text as total from orders where status = 'paid' and paid_at >= date_trunc('day', now())"),
      query<{ total: string | null }>("select coalesce(sum(amount_cents), 0)::text as total from orders where status = 'paid' and paid_at >= date_trunc('day', now()) - interval '1 day' and paid_at < date_trunc('day', now())"),
      query<{ count: string }>("select count(*) from users where created_at >= date_trunc('day', now())"),
      query<{ count: string }>("select count(*) from users where created_at >= date_trunc('day', now()) - interval '1 day' and created_at < date_trunc('day', now())"),
      query<{ count: string }>("select count(*) from feedback_tickets where status in ('open', 'in_progress')"),
      query<{ count: string }>("select count(*) from app_runs where status = 'failed' and created_at >= now() - interval '24 hours'"),
      query<{ risk_level: string; count: string }>(
        "select risk_level, count(*)::text from compliance_reports group by risk_level order by risk_level",
      ),
      query<{
        id: string;
        name: string;
        email: string;
        role: string;
        status: string;
        created_at: string;
      }>("select id, name, email, role, status, created_at from users order by created_at desc limit 8"),
      query<{
        id: string;
        provider: string;
        status: string;
        amount_cents: number;
        currency: string;
        quota_amount: number;
        created_at: string;
        user_email: string;
      }>(
        `select o.id, o.provider, o.status, o.amount_cents, o.currency, o.quota_amount, o.created_at, u.email as user_email
         from orders o
         join users u on u.id = o.user_id
         order by o.created_at desc
         limit 8`,
      ),
      query<{
        id: string;
        action_type: string;
        quota_cost: number;
        model: string | null;
        created_at: string;
        user_email: string | null;
      }>(
        `select l.id, l.action_type, l.quota_cost, l.model, l.created_at, u.email as user_email
         from usage_logs l
         left join users u on u.id = l.user_id
         order by l.created_at desc
         limit 12`,
      ),
      query<{ count: string }>("select count(*) from announcements where status = 'published'"),
      query<{ count: string }>("select count(*) from promo_codes where status = 'active'"),
    ]);

    return {
      users: Number(users.rows[0]?.count ?? 0),
      activeUsers: Number(activeUsers.rows[0]?.count ?? 0),
      conversations: Number(conversations.rows[0]?.count ?? 0),
      drafts: Number(drafts.rows[0]?.count ?? 0),
      orders: Number(orders.rows[0]?.count ?? 0),
      paidAmountCents: Number(paidOrders.rows[0]?.total ?? 0),
      paidUsers: Number(paidUsers.rows[0]?.count ?? 0),
      todayRevenueCents: Number(todayRevenue.rows[0]?.total ?? 0),
      yesterdayRevenueCents: Number(yesterdayRevenue.rows[0]?.total ?? 0),
      newUsersToday: Number(newUsersToday.rows[0]?.count ?? 0),
      newUsersYesterday: Number(newUsersYesterday.rows[0]?.count ?? 0),
      openFeedback: Number(openFeedback.rows[0]?.count ?? 0),
      failedRuns: Number(failedRuns.rows[0]?.count ?? 0),
      quotaConsumed: Number(usage.rows[0]?.total ?? 0),
      publishedAnnouncements: Number(announcements.rows[0]?.count ?? 0),
      activePromoCodes: Number(promoCodes.rows[0]?.count ?? 0),
      complianceRisk: compliance.rows,
      recentUsers: recentUsers.rows,
      recentOrders: recentOrders.rows,
      recentUsage: recentUsage.rows,
    };
  } catch {
    return null;
  }
}

export async function tryListAdminUsers() {
  try {
    const result = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      created_at: string;
      usage_total: string | null;
      order_total: string | null;
      gift_total: string | null;
      current_balance: string | null;
    }>(
      `select u.id, u.name, u.email, u.role, u.status, u.created_at,
              coalesce((select sum(ul.quota_cost) from usage_logs ul where ul.user_id = u.id), 0)::text as usage_total,
              coalesce((select sum(case when o.status = 'paid' then o.amount_cents else 0 end) from orders o where o.user_id = u.id), 0)::text as order_total,
              coalesce((select sum(g.quota_amount) from gift_records g where g.user_id = u.id and g.status = 'granted'), 0)::text as gift_total,
              greatest(
                coalesce((select sum(case when o.status = 'paid' then o.quota_amount else 0 end) from orders o where o.user_id = u.id), 0) +
                coalesce((select sum(g.quota_amount) from gift_records g where g.user_id = u.id and g.status = 'granted'), 0) -
                coalesce((select sum(ul.quota_cost) from usage_logs ul where ul.user_id = u.id), 0),
                0
              )::text as current_balance
       from users u
       group by u.id
       order by u.created_at desc
       limit 200`,
    );
    return result.rows.map((row) => ({
      ...row,
      usage_total: Number(row.usage_total ?? 0),
      order_total: Number(row.order_total ?? 0),
      gift_total: Number(row.gift_total ?? 0),
      current_balance: Number(row.current_balance ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function tryUpdateAdminUser(input: { userId: string; status?: string; role?: string }) {
  try {
    const result = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      updated_at: string;
    }>(
      `update users
       set status = coalesce($2, status),
           role = coalesce($3, role),
           updated_at = now()
       where id = $1
       returning id, name, email, role, status, updated_at`,
      [input.userId, input.status ?? null, input.role ?? null],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryCountActiveAdmins() {
  try {
    const result = await query<{ count: string }>("select count(*)::text as count from users where role = 'admin' and status = 'active'");
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return null;
  }
}

export async function tryCreateAdminAuditLog(input: {
  adminUserId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  detail?: Record<string, unknown>;
}) {
  try {
    const result = await query<{ id: string }>(
      `insert into admin_audit_logs(admin_user_id, action, target_type, target_id, detail)
       values ($1, $2, $3, $4, $5::jsonb)
       returning id`,
      [input.adminUserId, input.action, input.targetType, input.targetId ?? "", JSON.stringify(input.detail ?? {})],
    );
    return result.rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function tryListAdminAuditLogs(limit = 100) {
  try {
    const result = await query<{
      id: string;
      action: string;
      target_type: string;
      target_id: string;
      detail: Record<string, unknown>;
      created_at: string;
      admin_email: string | null;
      admin_name: string | null;
    }>(
      `select l.id, l.action, l.target_type, l.target_id, l.detail, l.created_at, u.email as admin_email, u.name as admin_name
       from admin_audit_logs l
       left join users u on u.id = l.admin_user_id
       order by l.created_at desc
       limit $1`,
      [Math.min(Math.max(limit, 1), 300)],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryCreateFeedbackTicket(input: {
  userId: string | null;
  title: string;
  content: string;
  category: string;
  priority?: string;
}) {
  try {
    const result = await query<{
      id: string;
      title: string;
      status: string;
      created_at: string;
    }>(
      `insert into feedback_tickets(user_id, title, content, category, priority)
       values ($1, $2, $3, $4, $5)
       returning id, title, status, created_at`,
      [input.userId, input.title, input.content, input.category, input.priority ?? "normal"],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryListUserFeedbackTickets(userId: string | null) {
  if (!userId) return [];
  try {
    const result = await query<{
      id: string;
      title: string;
      content: string;
      category: string;
      status: string;
      priority: string;
      admin_reply: string;
      created_at: string;
      updated_at: string;
    }>(
      `select id, title, content, category, status, priority, admin_reply, created_at, updated_at
       from feedback_tickets
       where user_id = $1
       order by updated_at desc
       limit 50`,
      [userId],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryListAdminFeedbackTickets(limit = 100) {
  try {
    const result = await query<{
      id: string;
      title: string;
      content: string;
      category: string;
      status: string;
      priority: string;
      admin_reply: string;
      created_at: string;
      updated_at: string;
      user_email: string | null;
      user_name: string | null;
      assigned_admin_email: string | null;
    }>(
      `select f.id, f.title, f.content, f.category, f.status, f.priority, f.admin_reply, f.created_at, f.updated_at,
              u.email as user_email, u.name as user_name, au.email as assigned_admin_email
       from feedback_tickets f
       left join users u on u.id = f.user_id
       left join users au on au.id = f.assigned_admin_id
       order by case f.status when 'open' then 0 when 'in_progress' then 1 when 'resolved' then 2 else 3 end,
                f.updated_at desc
       limit $1`,
      [Math.min(Math.max(limit, 1), 300)],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryUpdateAdminFeedbackTicket(input: {
  id: string;
  status?: string;
  priority?: string;
  adminReply?: string;
  assignedAdminId?: string | null;
}) {
  try {
    const result = await query<{
      id: string;
      status: string;
      priority: string;
      admin_reply: string;
      updated_at: string;
    }>(
      `update feedback_tickets
       set status = coalesce($2, status),
           priority = coalesce($3, priority),
           admin_reply = coalesce($4, admin_reply),
           assigned_admin_id = coalesce($5, assigned_admin_id),
           resolved_at = case when $2 = 'resolved' then coalesce(resolved_at, now()) else resolved_at end,
           updated_at = now()
       where id = $1
       returning id, status, priority, admin_reply, updated_at`,
      [input.id, input.status ?? null, input.priority ?? null, input.adminReply ?? null, input.assignedAdminId ?? null],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryGetAdminUserDetail(userId: string) {
  try {
    const [user, balance, orders, usage, gifts, works] = await Promise.all([
      query<{
        id: string;
        name: string;
        email: string;
        role: string;
        status: string;
        created_at: string;
      }>("select id, name, email, role, status, created_at from users where id = $1", [userId]),
      tryGetLocalQuotaBalance(userId),
      tryListOrders(userId),
      tryListUsageLogs(userId),
      tryListGiftRecords(userId),
      tryListWorks(userId),
    ]);
    const row = user.rows[0];
    if (!row) return null;
    return {
      user: row,
      balance,
      orders,
      usage: usage.slice(0, 20),
      gifts: gifts.slice(0, 20),
      works: works.slice(0, 20),
      totals: {
        orderAmountCents: orders.reduce((sum, order) => sum + (order.status === "paid" ? order.amount_cents : 0), 0),
        quotaPurchased: orders.reduce((sum, order) => sum + (order.status === "paid" ? order.quota_amount : 0), 0),
        quotaGifted: gifts.reduce((sum, gift) => sum + gift.quota_amount, 0),
        quotaConsumed: usage.reduce((sum, item) => sum + item.quota_cost, 0),
        worksTotal: works.length,
      },
    };
  } catch {
    return null;
  }
}

export async function tryGetAdminContentOverview() {
  try {
    const [totals, complianceRisk, recentWorks, recentComplianceReports, appUsage, questionnaireStats] = await Promise.all([
      query<{
        works_total: string;
        works_used: string;
        works_favorite: string;
        app_runs_total: string;
        app_runs_failed: string;
        compliance_reports_total: string;
      }>(
        `select
           (select count(*) from works)::text as works_total,
           (select count(*) from works where is_used = true)::text as works_used,
           (select count(*) from works where is_favorite = true)::text as works_favorite,
           (select count(*) from app_runs)::text as app_runs_total,
           (select count(*) from app_runs where status = 'failed')::text as app_runs_failed,
           (select count(*) from compliance_reports)::text as compliance_reports_total`,
      ),
      query<{ risk_level: string; count: string }>(
        `select risk_level, count(*)::text as count
         from compliance_reports
         group by risk_level
         order by count(*) desc, risk_level`,
      ),
      query<{
        id: string;
        title: string;
        status: string;
        compliance_risk: string;
        source_channel: string;
        updated_at: string;
        user_email: string | null;
        app_name: string | null;
        content_preview: string;
      }>(
        `select w.id,
                w.title,
                w.status,
                w.compliance_risk,
                w.source_channel,
                w.updated_at,
                u.email as user_email,
                a.name as app_name,
                left(coalesce((
                  select wv.content
                  from work_versions wv
                  where wv.work_id = w.id
                  order by wv.version_no desc
                  limit 1
                ), ''), 160) as content_preview
         from works w
         left join users u on u.id = w.user_id
         left join apps a on a.id = w.app_id
         order by w.updated_at desc
         limit 12`,
      ),
      query<{
        id: string;
        risk_level: string;
        checked_text: string;
        created_at: string;
        user_email: string | null;
        issue_count: string;
      }>(
        `select cr.id,
                cr.risk_level,
                left(cr.checked_text, 180) as checked_text,
                cr.created_at,
                u.email as user_email,
                jsonb_array_length(coalesce(cr.issues, '[]'::jsonb))::text as issue_count
         from compliance_reports cr
         left join users u on u.id = cr.user_id
         order by cr.created_at desc
         limit 10`,
      ),
      query<{
        app_code: string | null;
        app_name: string | null;
        run_count: string;
        success_count: string;
        failed_count: string;
        quota_total: string | null;
      }>(
        `select coalesce(a.slug, a.code, 'unknown') as app_code,
                coalesce(a.name, '未知应用') as app_name,
                count(ar.id)::text as run_count,
                count(ar.id) filter (where ar.status = 'succeeded')::text as success_count,
                count(ar.id) filter (where ar.status = 'failed')::text as failed_count,
                coalesce(sum(ar.quota_cost), 0)::text as quota_total
         from app_runs ar
         left join apps a on a.id = ar.app_id
         group by a.slug, a.code, a.name
         order by count(ar.id) desc
         limit 8`,
      ),
      query<{
        total: string;
        completed: string;
        avg_completion: string | null;
      }>(
        `select count(*)::text as total,
                count(*) filter (where status = 'completed')::text as completed,
                coalesce(avg(completion_percent), 0)::text as avg_completion
         from profile_questionnaires`,
      ),
    ]);

    const totalRow = totals.rows[0];
    const questionnaireRow = questionnaireStats.rows[0];
    return {
      totals: {
        worksTotal: Number(totalRow?.works_total ?? 0),
        worksUsed: Number(totalRow?.works_used ?? 0),
        worksFavorite: Number(totalRow?.works_favorite ?? 0),
        appRunsTotal: Number(totalRow?.app_runs_total ?? 0),
        appRunsFailed: Number(totalRow?.app_runs_failed ?? 0),
        complianceReportsTotal: Number(totalRow?.compliance_reports_total ?? 0),
        questionnairesTotal: Number(questionnaireRow?.total ?? 0),
        questionnairesCompleted: Number(questionnaireRow?.completed ?? 0),
        questionnaireAvgCompletion: Math.round(Number(questionnaireRow?.avg_completion ?? 0)),
      },
      complianceRisk: complianceRisk.rows.map((row) => ({
        riskLevel: row.risk_level,
        count: Number(row.count ?? 0),
      })),
      recentWorks: recentWorks.rows,
      recentComplianceReports: recentComplianceReports.rows.map((row) => ({
        ...row,
        issue_count: Number(row.issue_count ?? 0),
      })),
      appUsage: appUsage.rows.map((row) => ({
        ...row,
        run_count: Number(row.run_count ?? 0),
        success_count: Number(row.success_count ?? 0),
        failed_count: Number(row.failed_count ?? 0),
        quota_total: Number(row.quota_total ?? 0),
      })),
    };
  } catch {
    return null;
  }
}

export async function tryListAdminAppRuns(limit = 100) {
  try {
    const result = await query<{ id: string; status: string; error_message: string | null; quota_cost: number; model: string | null; created_at: string; completed_at: string | null; app_name: string | null; app_slug: string | null; user_email: string | null; work_id: string | null }>(
      `select ar.id, ar.status, ar.error_message, ar.quota_cost, ar.model, ar.created_at, ar.completed_at,
              a.name as app_name, a.slug as app_slug, u.email as user_email, w.id as work_id
       from app_runs ar
       left join apps a on a.id = ar.app_id
       left join users u on u.id = ar.user_id
       left join works w on w.app_run_id = ar.id
       where ar.status in ('running', 'failed')
       order by case when ar.status = 'running' then 0 else 1 end, ar.created_at desc
       limit $1`,
      [Math.min(Math.max(limit, 1), 300)],
    );
    return result.rows;
  } catch {
    return null;
  }
}

export async function tryTerminateAdminAppRun(runId: string) {
  try {
    const result = await query<{ id: string; status: string }>(
      `update app_runs set status = 'failed', error_message = '管理员终止悬挂任务', completed_at = now()
       where id = $1 and status = 'running' returning id, status`,
      [runId],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

type AnnouncementRecord = {
  id: string;
  title: string;
  content: string;
  kind: string;
  placement: string;
  status: string;
  link_url: string | null;
  is_pinned: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function tryListPublishedAnnouncements(limit = 6, placement?: "global" | "dashboard" | "billing" | "benefits") {
  try {
    const result = await query<AnnouncementRecord>(
      `select id, title, content, kind, placement, status, link_url, is_pinned, published_at, created_at, updated_at
       from announcements
       where status = 'published'
         and ($2::text is null or placement in ('global', $2))
       order by is_pinned desc, coalesce(published_at, created_at) desc
       limit $1`,
      [Math.min(Math.max(limit, 1), 20), placement ?? null],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryListAdminAnnouncements() {
  try {
    const result = await query<AnnouncementRecord>(
      `select id, title, content, kind, placement, status, link_url, is_pinned, published_at, created_at, updated_at
       from announcements
       order by is_pinned desc, created_at desc`,
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryUpsertAnnouncement(input: {
  id?: string;
  title: string;
  content: string;
  kind: string;
  placement: string;
  status: string;
  linkUrl?: string | null;
  isPinned?: boolean;
}) {
  try {
    const values = [
      input.title,
      input.content,
      input.kind,
      input.placement,
      input.status,
      input.linkUrl ?? null,
      input.isPinned ?? false,
    ];

    if (input.id) {
      const result = await query<AnnouncementRecord>(
        `update announcements
         set title = $2,
             content = $3,
             kind = $4,
             placement = $5,
             status = $6,
             link_url = $7,
             is_pinned = $8,
             published_at = case when $6 = 'published' then coalesce(published_at, now()) else published_at end,
             updated_at = now()
         where id = $1
         returning id, title, content, kind, placement, status, link_url, is_pinned, published_at, created_at, updated_at`,
        [input.id, ...values],
      );
      return result.rows[0] ?? null;
    }

    const result = await query<AnnouncementRecord>(
      `insert into announcements(title, content, kind, placement, status, link_url, is_pinned, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, case when $5 = 'published' then now() else null end)
       returning id, title, content, kind, placement, status, link_url, is_pinned, published_at, created_at, updated_at`,
      values,
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryUpdateAnnouncementStatus(input: { id: string; status: string }) {
  try {
    const result = await query<AnnouncementRecord>(
      `update announcements
       set status = $2,
           published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end,
           updated_at = now()
       where id = $1
       returning id, title, content, kind, placement, status, link_url, is_pinned, published_at, created_at, updated_at`,
      [input.id, input.status],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryDeleteAnnouncement(id: string) {
  try {
    const result = await query<{ id: string }>("delete from announcements where id = $1 returning id", [id]);
    return Boolean(result.rows[0]);
  } catch {
    return false;
  }
}

type PromoCodeRecord = {
  id: string;
  code: string;
  reward_type: string;
  credit_amount: number;
  discount_percent: number;
  status: string;
  max_redemptions: number;
  redeemed_count: number;
  starts_at: string | null;
  expires_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

export async function tryListPromoCodes() {
  try {
    const result = await query<PromoCodeRecord>(
      `select id, code, reward_type, credit_amount, discount_percent, status, max_redemptions, redeemed_count, starts_at, expires_at, notes, created_at, updated_at
       from promo_codes
       order by created_at desc`,
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryUpsertPromoCode(input: {
  id?: string;
  code: string;
  rewardType: string;
  creditAmount: number;
  discountPercent: number;
  status: string;
  maxRedemptions: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  notes?: string;
}) {
  try {
    const values = [
      input.code.trim().toUpperCase(),
      input.rewardType,
      input.creditAmount,
      input.discountPercent,
      input.status,
      input.maxRedemptions,
      input.startsAt ?? null,
      input.expiresAt ?? null,
      input.notes ?? "",
    ];

    if (input.id) {
      const result = await query<PromoCodeRecord>(
        `update promo_codes
         set code = $2,
             reward_type = $3,
             credit_amount = $4,
             discount_percent = $5,
             status = $6,
             max_redemptions = $7,
             starts_at = $8,
             expires_at = $9,
             notes = $10,
             updated_at = now()
         where id = $1
         returning id, code, reward_type, credit_amount, discount_percent, status, max_redemptions, redeemed_count, starts_at, expires_at, notes, created_at, updated_at`,
        [input.id, ...values],
      );
      return result.rows[0] ?? null;
    }

    const result = await query<PromoCodeRecord>(
      `insert into promo_codes(code, reward_type, credit_amount, discount_percent, status, max_redemptions, starts_at, expires_at, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id, code, reward_type, credit_amount, discount_percent, status, max_redemptions, redeemed_count, starts_at, expires_at, notes, created_at, updated_at`,
      values,
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryUpdatePromoCodeStatus(input: { id: string; status: string }) {
  try {
    const result = await query<PromoCodeRecord>(
      `update promo_codes
       set status = $2,
           updated_at = now()
       where id = $1
       returning id, code, reward_type, credit_amount, discount_percent, status, max_redemptions, redeemed_count, starts_at, expires_at, notes, created_at, updated_at`,
      [input.id, input.status],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryDeletePromoCode(id: string) {
  try {
    const result = await query<{ id: string }>(
      `delete from promo_codes
       where id = $1 and redeemed_count = 0
       returning id`,
      [id],
    );
    return Boolean(result.rows[0]);
  } catch {
    return false;
  }
}

export async function tryGetAvailableDiscountRedemption(userId: string) {
  try {
    const result = await query<{ id: string; code: string; discount_percent: number }>(
      `select pr.id, pc.code, pr.discount_percent
       from promo_redemptions pr
       join promo_codes pc on pc.id = pr.promo_code_id
       where pr.user_id = $1
         and pr.discount_percent > 0
         and pr.used_at is null
       order by pr.created_at asc
       limit 1`,
      [userId],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryConsumeDiscountRedemption(input: { redemptionId: string; userId: string; orderId: string }) {
  try {
    const result = await query<{ id: string }>(
      `update promo_redemptions
       set used_at = now(), order_id = $3
       where id = $1 and user_id = $2 and used_at is null
       returning id`,
      [input.redemptionId, input.userId, input.orderId],
    );
    return Boolean(result.rows[0]);
  } catch {
    return false;
  }
}

export async function tryReleaseDiscountRedemption(orderId: string) {
  try {
    await query("update promo_redemptions set used_at = null, order_id = null where order_id = $1", [orderId]);
    return true;
  } catch {
    return false;
  }
}

export async function tryRedeemPromoCode(input: { userId: string | null; code: string }) {
  if (!input.userId) return { ok: false as const, error: "请先登录" };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const promo = await client.query<PromoCodeRecord>(
      `select id, code, reward_type, credit_amount, discount_percent, status, max_redemptions, redeemed_count, starts_at, expires_at, notes, created_at, updated_at
       from promo_codes
       where code = upper($1)
       limit 1
       for update`,
      [input.code.trim()],
    );
    const row = promo.rows[0];
    if (!row) {
      await client.query("rollback");
      return { ok: false as const, error: "优惠码不存在" };
    }
    if (row.status !== "active") {
      await client.query("rollback");
      return { ok: false as const, error: "优惠码暂不可用" };
    }
    if (row.starts_at && new Date(row.starts_at).getTime() > Date.now()) {
      await client.query("rollback");
      return { ok: false as const, error: "优惠码尚未生效" };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      await client.query("rollback");
      return { ok: false as const, error: "优惠码已过期" };
    }
    if (row.redeemed_count >= row.max_redemptions) {
      await client.query("rollback");
      return { ok: false as const, error: "优惠码已被领完" };
    }

    const existing = await client.query<{ id: string }>(
      `select id from promo_redemptions
       where promo_code_id = $1 and user_id = $2`,
      [row.id, input.userId],
    );
    if (existing.rows[0]) {
      await client.query("rollback");
      return { ok: false as const, error: "你已经兑换过这个优惠码" };
    }

    await client.query(
      `insert into promo_redemptions(promo_code_id, user_id, credit_amount, discount_percent)
       values ($1, $2, $3, $4)`,
      [row.id, input.userId, row.credit_amount, row.discount_percent],
    );

    if (row.credit_amount > 0) {
      await client.query(
        `insert into gift_records(user_id, source_type, source_label, quota_amount, status, metadata)
         values ($1, 'promo_code', $2, $3, 'granted', $4::jsonb)`,
        [input.userId, row.code, row.credit_amount, JSON.stringify({ promoCodeId: row.id })],
      );
    }

    await client.query(
      `update promo_codes
       set redeemed_count = redeemed_count + 1,
           updated_at = now()
       where id = $1`,
      [row.id],
    );

    await client.query("commit");
    return {
      ok: true as const,
      rewardType: row.reward_type,
      creditAmount: row.credit_amount,
      discountPercent: row.discount_percent,
      code: row.code,
    };
  } catch {
    await client.query("rollback");
    return { ok: false as const, error: "兑换失败，请稍后重试" };
  } finally {
    client.release();
  }
}

export async function tryListGiftRecords(userId: string | null) {
  if (!userId) return [];

  try {
    const result = await query<{
      id: string;
      source_type: string;
      source_label: string;
      quota_amount: number;
      status: string;
      metadata: Record<string, unknown>;
      created_at: string;
    }>(
      `select id, source_type, source_label, quota_amount, status, metadata, created_at
       from gift_records
       where user_id = $1
       order by created_at desc
       limit 100`,
      [userId],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function tryGrantGiftCredits(input: {
  userId: string;
  quotaAmount: number;
  sourceType: string;
  sourceLabel: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const result = await query<{
      id: string;
      source_type: string;
      source_label: string;
      quota_amount: number;
      status: string;
      created_at: string;
    }>(
      `insert into gift_records(user_id, source_type, source_label, quota_amount, status, metadata)
       values ($1, $2, $3, $4, 'granted', $5::jsonb)
       returning id, source_type, source_label, quota_amount, status, created_at`,
      [
        input.userId,
        input.sourceType,
        input.sourceLabel,
        input.quotaAmount,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function tryGetSystemSettings(): Promise<SystemSettings> {
  try {
    const result = await query<{ setting_key: string; setting_value: Record<string, unknown> }>(
      `select setting_key, setting_value
       from system_settings
       where setting_key = any($1::text[])`,
      [systemSettingKeys],
    );

    const output = structuredClone(defaultSystemSettings);
    for (const row of result.rows) {
      const key = row.setting_key as keyof SystemSettings;
      if (key in output) Object.assign(output[key], row.setting_value);
    }
    return output;
  } catch {
    return structuredClone(defaultSystemSettings);
  }
}

export async function tryUpdateSystemSettings(input: Partial<{ [K in keyof SystemSettings]: Partial<SystemSettings[K]> }>) {
  try {
    for (const [key, value] of Object.entries(input)) {
      if (!value) continue;
      await query(
        `insert into system_settings(setting_key, setting_value, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (setting_key) do update set
           setting_value = excluded.setting_value,
           updated_at = now()`,
        [key, JSON.stringify(value)],
      );
    }
    return await tryGetSystemSettings();
  } catch {
    return null;
  }
}

export async function tryGetWorkbenchOverview(userId: string | null) {
  if (!userId) return null;

  try {
    const [balance, works, usage, orders, announcements, gifts, topicSnapshot] = await Promise.all([
      tryGetLocalQuotaBalance(userId),
      tryListWorks(userId),
      tryListUsageLogs(userId),
      tryListOrders(userId),
      tryListPublishedAnnouncements(5, "dashboard"),
      tryListGiftRecords(userId),
      tryListLatestTopicSnapshots({ limit: 10, maxAgeMinutes: 1440, allowStale: true }),
    ]);

    const weekStart = startOfCurrentWeek();
    const weeklyWorks = works.filter((work) => new Date(work.updated_at).getTime() >= weekStart);
    const weeklyUsage = usage.filter((item) => new Date(item.created_at).getTime() >= weekStart);

    return {
      balance,
      draftCount: works.length,
      weeklyDraftCount: weeklyWorks.length,
      weeklyUsed: weeklyUsage.reduce((sum, item) => sum + item.quota_cost, 0),
      paidOrders: orders.filter((order) => order.status === "paid").length,
      pendingOrders: orders.filter((order) => order.status !== "paid").length,
      totalUsed: usage.reduce((sum, item) => sum + item.quota_cost, 0),
      recentDrafts: works.slice(0, 4),
      recentUsage: usage.slice(0, 6),
      recentOrders: orders.slice(0, 6),
      announcements,
      recentGifts: gifts.slice(0, 4),
      topics: topicSnapshot.topics,
      topicsRefreshedAt: topicSnapshot.refreshedAt,
      topicsStale: topicSnapshot.stale,
    };
  } catch {
    return null;
  }
}

function startOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
  return start.getTime();
}

export async function tryGetCreationHubData(userId: string | null) {
  if (!userId) return null;

  try {
    const [balance, works, announcements, usage] = await Promise.all([
      tryGetLocalQuotaBalance(userId),
      tryListWorks(userId),
      tryListPublishedAnnouncements(3, "dashboard"),
      tryListUsageLogs(userId),
    ]);

    const appUsage = new Map<string, number>();
    for (const item of usage) {
      const appId = typeof item.metadata?.appId === "string" ? item.metadata.appId : "";
      if (!appId) continue;
      appUsage.set(appId, (appUsage.get(appId) ?? 0) + 1);
    }

    return {
      balance,
      announcements,
      worksView: {
        draftCount: works.length,
        recentDrafts: works.slice(0, 8),
      },
      appUsage: creationApps.map((app) => ({
        appId: app.id,
        usedCount: appUsage.get(app.id) ?? 0,
      })),
    };
  } catch {
    return null;
  }
}

export type CreationWorksQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  platform?: string;
  state?: "all" | "favorite" | "published" | "unpublished" | "noted" | "avatar";
  from?: string;
  to?: string;
  sort?: "updated-desc" | "updated-asc" | "created-desc";
};

export async function tryGetCreationWorksView(userId: string | null, input: CreationWorksQuery = {}) {
  if (!userId) return null;

  try {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize ?? 20)));
    const offset = (page - 1) * pageSize;
    const values: unknown[] = [userId];
    const filters = ["w.user_id = $1", "w.status <> 'archived'"];

    if (input.search?.trim()) {
      values.push(`%${input.search.trim()}%`);
      const parameter = `$${values.length}`;
      filters.push(`(w.title ilike ${parameter} or w.note ilike ${parameter} or w.source_channel ilike ${parameter} or exists (
        select 1 from work_versions search_wv where search_wv.work_id = w.id and search_wv.content ilike ${parameter}
      ))`);
    }
    if (input.platform?.trim() && input.platform !== "all") {
      values.push(input.platform.trim());
      filters.push(`w.source_channel = $${values.length}`);
    }
    if (input.state === "favorite") filters.push("w.is_favorite = true");
    if (input.state === "published") filters.push("w.is_used = true");
    if (input.state === "unpublished") filters.push("w.is_used = false");
    if (input.state === "noted") filters.push("length(trim(coalesce(w.note, ''))) > 0");
    if (input.state === "avatar") filters.push("jsonb_array_length(coalesce(ar.result_json->'avatarVisualAssetIds', '[]'::jsonb)) > 0");
    if (input.from) {
      values.push(input.from);
      filters.push(`w.updated_at >= $${values.length}::date`);
    }
    if (input.to) {
      values.push(input.to);
      filters.push(`w.updated_at < ($${values.length}::date + interval '1 day')`);
    }

    const orderBy = input.sort === "updated-asc"
      ? "w.updated_at asc"
      : input.sort === "created-desc"
        ? "w.created_at desc"
        : "w.updated_at desc";
    values.push(pageSize, offset);
    const limitParameter = `$${values.length - 1}`;
    const offsetParameter = `$${values.length}`;

    const worksResult = await query<{
      id: string;
      title: string;
      status: string;
      compliance_risk: string;
      created_at: string;
      updated_at: string;
      source_channel: string;
      content: string;
      note: string | null;
      is_favorite: boolean;
      is_used: boolean;
      quota_cost: number | null;
      result_json: Record<string, unknown> | null;
      filtered_count: string;
    }>(
      `select w.id, w.title, w.status, w.compliance_risk, w.created_at, w.updated_at,
              w.source_channel, w.note, w.is_favorite, w.is_used, ar.quota_cost, ar.result_json,
              count(*) over() as filtered_count,
              coalesce(
                (select wv.content from work_versions wv where wv.work_id = w.id order by wv.version_no desc limit 1),
                ''
              ) as content
       from works w
       left join app_runs ar on ar.id = w.app_run_id
       where ${filters.join(" and ")}
       order by ${orderBy}
       limit ${limitParameter} offset ${offsetParameter}`,
      values,
    );

    const [totalsResult, platformsResult, activityResult] = await Promise.all([
      query<{ all_count: string; favorite_count: string; published_count: string; unpublished_count: string; noted_count: string; avatar_count: string }>(
        `select count(*) as all_count,
                count(*) filter (where is_favorite) as favorite_count,
                count(*) filter (where is_used) as published_count,
                count(*) filter (where not is_used) as unpublished_count,
                count(*) filter (where length(trim(coalesce(w.note, ''))) > 0) as noted_count,
                count(*) filter (where jsonb_array_length(coalesce(ar.result_json->'avatarVisualAssetIds', '[]'::jsonb)) > 0) as avatar_count
         from works w left join app_runs ar on ar.id = w.app_run_id where w.user_id = $1 and w.status <> 'archived'`,
        [userId],
      ),
      query<{ platform: string; count: string }>(
        `select source_channel as platform, count(*) as count
         from works where user_id = $1 and status <> 'archived'
         group by source_channel order by count(*) desc, source_channel asc`,
        [userId],
      ),
      query<{ date: string; count: string }>(
        `select to_char((updated_at at time zone 'Asia/Shanghai')::date, 'YYYY-MM-DD') as date, count(*) as count
         from works
         where user_id = $1 and status <> 'archived' and updated_at >= now() - interval '100 days'
         group by (updated_at at time zone 'Asia/Shanghai')::date
         order by (updated_at at time zone 'Asia/Shanghai')::date asc`,
        [userId],
      ),
    ]);

    const works = worksResult.rows;
    const totalsRow = totalsResult.rows[0];
    const totals = {
      all: Number(totalsRow?.all_count ?? 0),
      favorite: Number(totalsRow?.favorite_count ?? 0),
      used: Number(totalsRow?.published_count ?? 0),
      unused: Number(totalsRow?.unpublished_count ?? 0),
      noted: Number(totalsRow?.noted_count ?? 0),
      avatar: Number(totalsRow?.avatar_count ?? 0),
    };
    const filteredTotal = Number(works[0]?.filtered_count ?? 0);

    return {
      totals,
      pagination: {
        page,
        pageSize,
        total: filteredTotal,
        hasMore: offset + works.length < filteredTotal,
      },
      platforms: platformsResult.rows.map((row) => ({ platform: row.platform, count: Number(row.count) })),
      activity: activityResult.rows.map((row) => ({ date: row.date, count: Number(row.count) })),
      items: works.map((work) => ({
        id: work.id,
        title: work.title,
        content: work.content,
        platform: work.source_channel,
        status: work.status,
        complianceRisk: work.compliance_risk,
        createdAt: work.created_at,
        updatedAt: work.updated_at,
        note: work.note ?? "",
        isFavorite: Boolean(work.is_favorite),
        isUsed: Boolean(work.is_used),
        quotaCost: Number(work.quota_cost ?? 0),
        imageUrl: firstGeneratedImageUrl(work.result_json),
        usesAvatarVisual: Array.isArray(work.result_json?.avatarVisualAssetIds) && work.result_json.avatarVisualAssetIds.length > 0,
      })),
    };
  } catch {
    return null;
  }
}

function firstGeneratedImageUrl(result: Record<string, unknown> | null) {
  if (!Array.isArray(result?.images)) return "";
  for (const item of result.images) {
    if (!item || typeof item !== "object") continue;
    const url = (item as { url?: unknown }).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  return "";
}

function inferTitle(content: string) {
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine?.slice(0, 80) || "未命名草稿";
}
