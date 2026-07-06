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

    if (input.title || input.appRunId || input.status) {
      await query(
        `update works
         set title = coalesce($3, title),
             status = coalesce($4, status),
             app_run_id = coalesce($5, app_run_id),
             updated_at = now()
         where id = $1 and user_id = $2`,
        [input.workId, input.userId, input.title ?? null, input.status ?? null, input.appRunId ?? null],
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
    }>(
      `select w.id, w.title, w.status, w.compliance_risk, w.updated_at, w.source_channel, w.note, w.is_favorite, w.is_used,
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
       where w.user_id = $1
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

export async function tryListLatestTopicSnapshots(input: { limit?: number; maxAgeMinutes?: number } = {}) {
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
         where created_at >= now() - ($1::int * interval '1 minute')
       )
       select distinct on (title) raw_payload, topic_snapshots.created_at
       from topic_snapshots, latest
       where latest.created_at is not null
         and topic_snapshots.created_at >= latest.created_at - interval '30 seconds'
       order by title, topic_snapshots.created_at desc`,
      [maxAgeMinutes],
    );

    const rows = result.rows
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, limit);
    return {
      topics: rows.map((row) => row.raw_payload),
      refreshedAt: rows[0]?.created_at ?? null,
    };
  } catch {
    return { topics: [], refreshedAt: null };
  }
}

export async function tryCreateOrder(input: {
  userId: string | null;
  provider: string;
  plan: BillingPlan;
  status?: "pending" | "paid";
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
      `insert into orders(user_id, provider, status, amount_cents, currency, quota_amount, metadata, paid_at)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, case when $3 = 'paid' then now() else null end)
       returning id, provider, status, amount_cents, currency, quota_amount, created_at`,
      [
        input.userId,
        input.provider,
        input.status ?? "pending",
        input.plan.amountCents,
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
       where provider = $1 and provider_order_id = $2
       returning id, user_id, quota_amount, status`,
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
       values ('default-thinking-questionnaire', $1, 1, $2, 'active')
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
            }),
          ],
        );
      }
    }

    return { id: templateId, code: "default-thinking-questionnaire" };
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
           badge = excluded.badge,
           points_cost = excluded.points_cost,
           result_type = excluded.result_type,
           requires_thinking = excluded.requires_thinking,
           featured = excluded.featured,
           metadata = excluded.metadata,
           sort_order = excluded.sort_order,
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

    if (appRows.rows.length === 0) {
      return {
        categories: creationCategories.map((category) => ({
          ...category,
          count: creationApps.filter((app) => app.category === category.id).length,
        })),
        apps: creationApps,
      };
    }

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
    return {
      categories: creationCategories.map((category) => ({
        ...category,
        count: creationApps.filter((app) => app.category === category.id).length,
      })),
      apps: creationApps,
    };
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
    const [users, activeUsers, conversations, drafts, orders, paidOrders, paidUsers, usage, todayRevenue, compliance, recentUsers, recentOrders, recentUsage, announcements, promoCodes] =
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

export async function tryListPublishedAnnouncements(limit = 6) {
  try {
    const result = await query<AnnouncementRecord>(
      `select id, title, content, kind, placement, status, link_url, is_pinned, published_at, created_at, updated_at
       from announcements
       where status = 'published'
       order by is_pinned desc, coalesce(published_at, created_at) desc
       limit $1`,
      [Math.min(Math.max(limit, 1), 20)],
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
       limit 1`,
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

const defaultSettings = {
  site: {
    siteName: "小谷",
    siteSubtitle: "保险内容增长助手",
    supportContact: "support@xiaogu.ai",
    footerNote: "让保险内容生产更稳定、更易运营。",
  },
  auth: {
    allowRegistration: true,
    requireInviteCode: false,
    passwordHint: "至少 8 位密码",
  },
  payment: {
    enableStripe: true,
    enableManualTransfer: false,
    displaySubscriptions: true,
    purchaseNotice: "充值成功后额度会自动到账，可在账单页查看明细。",
  },
};

export async function tryGetSystemSettings() {
  try {
    const result = await query<{ setting_key: string; setting_value: Record<string, unknown> }>(
      `select setting_key, setting_value
       from system_settings
       where setting_key = any($1::text[])`,
      [["site", "auth", "payment"]],
    );

    const output = { ...defaultSettings };
    for (const row of result.rows) {
      if (row.setting_key === "site") output.site = { ...output.site, ...row.setting_value };
      if (row.setting_key === "auth") output.auth = { ...output.auth, ...row.setting_value };
      if (row.setting_key === "payment") output.payment = { ...output.payment, ...row.setting_value };
    }
    return output;
  } catch {
    return defaultSettings;
  }
}

export async function tryUpdateSystemSettings(input: {
  site?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  payment?: Record<string, unknown>;
}) {
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
    const [balance, works, usage, orders, announcements, gifts] = await Promise.all([
      tryGetLocalQuotaBalance(userId),
      tryListWorks(userId),
      tryListUsageLogs(userId),
      tryListOrders(userId),
      tryListPublishedAnnouncements(5),
      tryListGiftRecords(userId),
    ]);

    return {
      balance,
      draftCount: works.length,
      paidOrders: orders.filter((order) => order.status === "paid").length,
      pendingOrders: orders.filter((order) => order.status !== "paid").length,
      totalUsed: usage.reduce((sum, item) => sum + item.quota_cost, 0),
      recentDrafts: works.slice(0, 4),
      recentUsage: usage.slice(0, 6),
      recentOrders: orders.slice(0, 6),
      announcements,
      recentGifts: gifts.slice(0, 4),
    };
  } catch {
    return null;
  }
}

export async function tryGetCreationHubData(userId: string | null) {
  if (!userId) return null;

  try {
    const [balance, works, announcements, usage] = await Promise.all([
      tryGetLocalQuotaBalance(userId),
      tryListWorks(userId),
      tryListPublishedAnnouncements(3),
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

export async function tryGetCreationWorksView(userId: string | null) {
  if (!userId) return null;

  try {
    const works = await tryListWorks(userId);
    const totals = {
      all: works.length,
      favorite: works.filter((work) => Boolean(work.is_favorite)).length,
      used: works.filter((work) => Boolean(work.is_used)).length,
      unused: works.filter((work) => !work.is_used).length,
      noted: works.filter((work) => Boolean(work.note?.trim())).length,
    };

    return {
      totals,
      items: works.map((work) => ({
        id: work.id,
        title: work.title,
        content: work.content,
        platform: work.platform,
        status: work.status,
        updatedAt: work.updated_at,
        note: work.note ?? "",
        isFavorite: Boolean(work.is_favorite),
        isUsed: Boolean(work.is_used),
      })),
    };
  } catch {
    return null;
  }
}

function inferTitle(content: string) {
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine?.slice(0, 80) || "未命名草稿";
}
