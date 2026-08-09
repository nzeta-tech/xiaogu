import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { canonicalizeInspectableSourceUrl, enqueueSourceInspectionTask, SOURCE_INSPECTION_PRIORITIES, standardizeSourceInspection, type StandardizedSourceInspection } from "@/lib/creation/source-inspection";
import { getPool, query } from "@/lib/db/client";
import type { LocalAgentTaskStatus } from "@/lib/local-agent/contracts";
import { getLinkRemixAvailability, isLocalAgentDelegationEnabled } from "@/lib/local-agent/repository";

type TrainingRunRow = {
  id: string;
  phase: string;
  status: "running" | "succeeded" | "failed";
  total_count: number;
  updated_at: string;
};

type TrainingTaskRow = {
  id: string;
  local_agent_task_id: string;
  source_url: string;
  local_status: LocalAgentTaskStatus;
  local_result: Record<string, unknown> | null;
  local_error: string | null;
  latest_event: Record<string, unknown> | null;
  created_at: string;
};

export type VideoTrainingAttempt = {
  taskId: string;
  link: string;
  platform: string;
  title: string;
  status: "queued" | "running" | "succeeded" | "failed";
  stage: "parsing" | "media" | "transcribing";
  message: string;
};

type VideoMemoryCandidate = {
  category: "expression" | "audience" | "expertise" | "boundary";
  title: string;
  content: string;
  evidence: string;
  memoryScope: "global" | "short_video" | "marketing";
};

export async function startAvatarVideoTraining(userId: string, rawLinks: string[], creatorSkillId?: string) {
  if (process.env.LOCAL_AGENT_ENABLED !== "1") throw new Error("共享作品解析服务尚未启用，请联系管理员。");
  const [availability, delegationEnabled] = await Promise.all([getLinkRemixAvailability(), isLocalAgentDelegationEnabled()]);
  if (!delegationEnabled || !availability.available) throw new Error(availability.reason || "作品解析服务暂不可用，请稍后重试。");

  const links = [...new Set(rawLinks.map(canonicalizeInspectableSourceUrl))];
  if (links.length < 3) throw new Error("去重后至少需要 3 条单条作品链接。");
  if (links.length > 10) throw new Error("每次最多训练 10 条作品。");
  if (links.some((link) => !isShortVideoUrl(link))) throw new Error("风格训练目前支持视频号和抖音的单条作品链接。");

  const initialAttempts: VideoTrainingAttempt[] = links.map((link) => ({
    taskId: "",
    link,
    platform: platformForUrl(link),
    title: "",
    status: "queued",
    stage: "parsing",
    message: "等待解析作品信息",
  }));
  const run = await query<{ id: string }>(
    `insert into avatar_training_runs(user_id, training_type, phase, total_count, details_json, creator_skill_id)
     values ($1, 'short_video', 'queued', $2, $3::jsonb, $4) returning id`,
    [userId, links.length, JSON.stringify({ sourceLinks: links, attempts: initialAttempts }), creatorSkillId ?? null],
  );
  const runId = run.rows[0].id;
  try {
    const queued = [] as Array<{ taskId: string; url: string }>;
    for (const link of links) {
      const { task, canonicalUrl } = await enqueueSourceInspectionTask({
        userId,
        url: link,
        purpose: "avatar_training",
        priority: SOURCE_INSPECTION_PRIORITIES.AVATAR_TRAINING,
        maxAttempts: 3,
      });
      queued.push({ taskId: task.id, url: canonicalUrl });
    }
    for (const item of queued) {
      await query(
        `insert into avatar_training_tasks(training_run_id, local_agent_task_id, source_url, platform)
         values ($1, $2, $3, $4) on conflict (training_run_id, local_agent_task_id) do nothing`,
        [runId, item.taskId, item.url, platformForUrl(item.url)],
      );
    }
    await query(
      `update avatar_training_runs set phase='parsing', details_json=$3::jsonb, updated_at=now() where id=$1 and user_id=$2`,
      [runId, userId, JSON.stringify({ sourceLinks: links, attempts: initialAttempts.map((attempt, index) => ({ ...attempt, taskId: queued[index]?.taskId ?? "" })) })],
    );
    return { runId, taskIds: queued.map((item) => item.taskId), totalCount: links.length };
  } catch (error) {
    const message = errorMessage(error, "训练任务创建失败。");
    await query(`update avatar_training_runs set status='failed', phase='failed', error_message=$3, updated_at=now() where id=$1 and user_id=$2`, [runId, userId, message]);
    throw error;
  }
}

export async function reconcileAvatarTrainingRuns(userId: string) {
  const runs = await query<TrainingRunRow>(
    `select id, phase, status, total_count, updated_at from avatar_training_runs
     where user_id=$1 and status='running' order by created_at asc limit 20`,
    [userId],
  );
  for (const run of runs.rows) {
    try {
      await reconcileRun(userId, run);
    } catch (error) {
      const message = errorMessage(error, "训练状态更新失败。");
      await query(
        `update avatar_training_runs set error_message=$3, phase=case when phase='generating-report' then 'transcribing' else phase end, updated_at=now()
         where id=$1 and user_id=$2 and status='running'`,
        [run.id, userId, message],
      ).catch(() => undefined);
    }
  }
}

async function reconcileRun(userId: string, run: TrainingRunRow) {
  const tasks = await query<TrainingTaskRow>(
    `select training.id, training.local_agent_task_id, training.source_url,
       task.status as local_status, task.result as local_result, task.error_message as local_error,
       event.payload as latest_event, training.created_at
     from avatar_training_tasks training
     join local_agent_tasks task on task.id=training.local_agent_task_id and task.owner_user_id=$2
     left join lateral (
       select payload from local_agent_task_events
       where task_id=task.id and event_type='status' order by id desc limit 1
     ) event on true
     where training.training_run_id=$1 order by training.created_at asc`,
    [run.id, userId],
  );
  if (tasks.rows.length === 0) {
    const stale = Date.now() - new Date(run.updated_at).getTime() > 10 * 60_000;
    if (stale) {
      await query(
        `update avatar_training_runs set status='failed', phase='failed', error_message='旧版训练在服务重启时中断，请重新提交作品链接。', updated_at=now()
         where id=$1 and user_id=$2 and status='running'`,
        [run.id, userId],
      );
    }
    return;
  }

  const normalized: StandardizedSourceInspection[] = [];
  const uniqueWorkFingerprints = new Set<string>();
  const attempts: VideoTrainingAttempt[] = [];
  let terminalCount = 0;
  for (const task of tasks.rows) {
    const isTerminal = ["succeeded", "failed", "cancelled"].includes(task.local_status);
    if (isTerminal) terminalCount += 1;
    let result = isTerminal
      ? standardizeSourceInspection({ sourceUrl: task.source_url, result: task.local_result, taskStatus: task.local_status, errorMessage: task.local_error })
      : null;
    if (result?.status === "succeeded") {
      const fingerprint = `${result.title}\n${result.transcript}`.replace(/\s+/g, "").toLowerCase();
      if (uniqueWorkFingerprints.has(fingerprint)) {
        result = { ...result, status: "failed", failureStage: "parsing", failureReason: "与本次训练中已完成的作品内容重复，不计入有效样本。" };
      } else {
        uniqueWorkFingerprints.add(fingerprint);
        normalized.push(result);
      }
    }
    const attempt = buildAttempt(task, result);
    attempts.push(attempt);
    await query(
      `update avatar_training_tasks set status=$2, platform=$3, title=$4, transcript=$5, error_message=$6, result_json=$7::jsonb, updated_at=now() where id=$1`,
      [task.id, attempt.status, attempt.platform, result?.title ?? "", result?.transcript ?? "", result?.failureReason ?? "", JSON.stringify(result ?? {})],
    );
  }

  const details = { sourceLinks: tasks.rows.map((task) => task.source_url), attempts };
  if (terminalCount < tasks.rows.length) {
    const hasRunning = attempts.some((attempt) => attempt.status === "running");
    await query(
      `update avatar_training_runs set phase=$3, completed_count=$4, successful_count=$5, error_message='', details_json=$6::jsonb, updated_at=now()
       where id=$1 and user_id=$2 and status='running'`,
      [run.id, userId, hasRunning ? "transcribing" : "queued", terminalCount, normalized.length, JSON.stringify(details)],
    );
    return;
  }

  if (normalized.length < 3) {
    await query(
      `update avatar_training_runs set status='failed', phase='failed', completed_count=$3, successful_count=$4,
       error_message='至少需要成功解析标题并转写 3 条作品。请检查每条作品的失败原因后重试。', details_json=$5::jsonb, updated_at=now()
       where id=$1 and user_id=$2 and status='running'`,
      [run.id, userId, terminalCount, normalized.length, JSON.stringify(details)],
    );
    return;
  }

  const claimed = await query<{ id: string }>(
    `update avatar_training_runs set phase='generating-report', completed_count=$3, successful_count=$4, error_message='', details_json=$5::jsonb, updated_at=now()
     where id=$1 and user_id=$2 and status='running'
       and (phase<>'generating-report' or updated_at<now()-interval '5 minutes') returning id`,
    [run.id, userId, terminalCount, normalized.length, JSON.stringify(details)],
  );
  if (!claimed.rows[0]) return;
  await finalizeTrainingRun(userId, run.id, normalized, details);
}

function buildAttempt(task: TrainingTaskRow, result: StandardizedSourceInspection | null): VideoTrainingAttempt {
  if (result) {
    return {
      taskId: task.local_agent_task_id,
      link: task.source_url,
      platform: result.platform,
      title: result.title,
      status: result.status,
      stage: result.failureStage || "transcribing",
      message: result.status === "succeeded" ? "标题与口播转写完成" : result.failureReason,
    };
  }
  const running = task.local_status === "leased";
  const eventMessage = typeof task.latest_event?.message === "string" ? task.latest_event.message : "";
  return {
    taskId: task.local_agent_task_id,
    link: task.source_url,
    platform: platformForUrl(task.source_url),
    title: "",
    status: running ? "running" : "queued",
    stage: eventMessage.includes("语音") ? "transcribing" : eventMessage.includes("音频") ? "media" : "parsing",
    message: eventMessage || (running ? "正在处理作品" : "等待后台任务处理"),
  };
}

async function finalizeTrainingRun(userId: string, runId: string, works: StandardizedSourceInspection[], details: Record<string, unknown>) {
  const content = buildTrainingContent(works);
  const candidates = await buildVideoMemoryCandidates(content, works.length, userId);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query<{ status: string; source_id: string | null; creator_skill_id: string | null }>(
      `select status, source_id, creator_skill_id from avatar_training_runs where id=$1 and user_id=$2 for update`,
      [runId, userId],
    );
    if (!locked.rows[0] || locked.rows[0].status !== "running" || locked.rows[0].source_id) {
      await client.query("commit");
      return;
    }
    const platforms = [...new Set(works.map((work) => work.platform))];
    const sourceType = platforms.length === 1 && platforms[0] === "douyin" ? "douyin" : platforms.length === 1 ? "video_channel" : "transcript";
    const sourceLabel = platforms.length === 1 && platforms[0] === "douyin" ? "抖音训练" : platforms.length === 1 ? "视频号训练" : "短视频作品训练";
    const source = await client.query<{ id: string }>(
      `insert into avatar_memory_sources(user_id, source_type, title, content, status, sensitivity, metadata_json)
       values ($1, $2, $3, $4, 'disabled', 'normal', $5::jsonb) returning id`,
      [userId, sourceType, `${sourceLabel} · ${works.length} 条作品`, content, JSON.stringify({ sourceLabel, memoryScope: "short_video", sourceLinks: works.map((work) => work.sourceUrl), platforms, workCount: works.length, importedAt: new Date().toISOString() })],
    );
    const sourceId = source.rows[0].id;
    if (locked.rows[0].creator_skill_id) {
      const skillPrompt = await buildCreatorSkillPrompt(content, works.length, userId);
      await client.query(`update avatar_creator_skill_versions set status='superseded' where skill_id=$1 and status in ('active', 'restored')`, [locked.rows[0].creator_skill_id]);
      await client.query(
        `update avatar_creator_skill_versions set status='active', sample_count=$3, skill_prompt=$4, change_summary=$5
         where training_run_id=$1 and user_id=$2`,
        [runId, userId, works.length, skillPrompt, `基于 ${works.length} 条授权作品蒸馏创作方式`],
      );
      await client.query(`update avatar_creator_skills set latest_version = (select version from avatar_creator_skill_versions where training_run_id=$1), updated_at=now() where id=$2 and user_id=$3`, [runId, locked.rows[0].creator_skill_id, userId]);
    }
    for (const candidate of candidates) {
      await client.query(
        `insert into avatar_evolution_proposals(user_id, category, title, description, confidence, evidence_json, patch_json)
         values ($1, $2, $3, $4, 82, $5::jsonb, $6::jsonb)`,
        [userId, candidate.category, candidate.title, candidate.content, JSON.stringify([`已成功解析并转写 ${works.length} 条本人授权作品`, candidate.evidence]), JSON.stringify({ ...candidate, sourceId, sourceLabel })],
      );
    }
    await client.query(
      `update avatar_training_runs set source_id=$3, status='succeeded', phase='completed', completed_count=total_count,
       successful_count=$4, error_message='', details_json=$5::jsonb, updated_at=now() where id=$1 and user_id=$2`,
      [runId, userId, sourceId, works.length, JSON.stringify(details)],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function buildCreatorSkillPrompt(content: string, workCount: number, userId: string) {
  const request = [
    "根据以下同一创作者的授权作品，蒸馏一份可直接用于内容创作的创作 Skill。",
    "只描述可观察的选题切口、开头、叙事节奏、句式、观点组织、结尾互动和边界；不要模仿或复述具体作品，不要冒充创作者，不要加入未经样本支持的个人经历或事实。",
    "用 6-10 条简洁规则输出，使用第二人称指令式表达。",
    `样本数：${workCount}`,
    content.slice(0, 24000),
  ].join("\n\n");
  try { return (await runInsuranceContentAgent([{ role: "user", content: request }], userId, "general")).slice(0, 6000); } catch { return `基于 ${workCount} 条授权作品：优先保持样本中可观察到的选题切口、口语节奏、观点推进和结尾互动；不得复用原作品中的具体事实、案例或句子。`; }
}

function buildTrainingContent(works: StandardizedSourceInspection[]) {
  return [
    `以下是创作者本人授权导入的 ${works.length} 条短视频作品。请重点学习标题的选题与切入，以及口播转写稿的语气、节奏、句式与观点组织；不要编造未出现的经历、数据或案例。`,
    ...works.map((work, index) => `【作品 ${index + 1}｜${platformLabel(work.platform)}】\n标题：${work.title}\n口播转写：${work.transcript}\n链接：${work.sourceUrl}`),
  ].join("\n\n").slice(0, 49_500);
}

async function buildVideoMemoryCandidates(content: string, workCount: number, userId: string): Promise<VideoMemoryCandidate[]> {
  const prompt = [
    "以下是同一创作者的短视频标题与口播转写。只根据材料生成 4 条供创作者逐条确认的候选记忆：我怎么说、我为谁说、我如何承接、我坚持什么。",
    "‘我如何承接’只提取样本明确出现的评论关键词、私信咨询、资料领取或服务邀约，并写清适用主题/场景；不能根据保险身份臆测获客目的。‘我为谁说’只记录被反复明确点名的客群与痛点。",
    "严格返回 JSON 数组，每项包含 category(expression/audience/expertise/boundary)、title、content、evidence、memoryScope(global/short_video/marketing)。没有明确证据的维度也要返回，但 content 写‘样本不足，暂不建议采用’，不得编造。每项 content 50-100 字。",
    `作品数量：${workCount}`,
    "训练材料：",
    content.slice(0, 24_000),
  ].join("\n\n");
  try {
    const output = await runInsuranceContentAgent([{ role: "user", content: prompt }], userId, "general");
    const parsed = JSON.parse(output.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as unknown[];
    if (parsed.length === 4) return parsed.map((item, index) => normalizeCandidate(item, index));
  } catch {}
  return fallbackVideoMemoryCandidates(workCount);
}

function normalizeCandidate(value: unknown, index: number): VideoMemoryCandidate {
  const item = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const categories: VideoMemoryCandidate["category"][] = ["expression", "audience", "expertise", "boundary"];
  const scopes: VideoMemoryCandidate["memoryScope"][] = ["global", "short_video", "marketing"];
  return {
    category: categories.includes(item.category as VideoMemoryCandidate["category"]) ? item.category as VideoMemoryCandidate["category"] : categories[index],
    title: text(item.title).slice(0, 120) || ["我怎么说", "我为谁说", "我如何承接", "我坚持什么"][index],
    content: (text(item.content) || "样本不足，暂不建议采用。").slice(0, 500),
    evidence: (text(item.evidence) || "来自训练样本的重复信号").slice(0, 500),
    memoryScope: scopes.includes(item.memoryScope as VideoMemoryCandidate["memoryScope"]) ? item.memoryScope as VideoMemoryCandidate["memoryScope"] : "short_video",
  };
}

function fallbackVideoMemoryCandidates(workCount: number): VideoMemoryCandidate[] {
  return [
    { category: "expression", title: "我怎么说", content: `已整理 ${workCount} 条作品的标题、开头、口播节奏、观点组织与结尾互动。确认后会作为短视频表达参考。`, evidence: "标题与口播转写样本", memoryScope: "short_video" },
    { category: "audience", title: "我为谁说", content: "样本不足，暂不建议采用。", evidence: "未识别到足够重复的明确客群信号", memoryScope: "short_video" },
    { category: "expertise", title: "我如何承接", content: "样本不足，暂不建议采用。", evidence: "未识别到重复且明确的评论、私信或咨询承接方式", memoryScope: "short_video" },
    { category: "boundary", title: "我坚持什么", content: "样本不足，暂不建议采用。", evidence: "未识别到可确认的稳定表达边界", memoryScope: "global" },
  ];
}

function isShortVideoUrl(value: string) { return /(^|\.)(douyin\.com|weixin\.qq\.com|channels\.weixin\.qq\.com)$/i.test(new URL(value).hostname) && !/^mp\.weixin\.qq\.com$/i.test(new URL(value).hostname); }
function platformForUrl(value: string) { return /douyin\.com$/i.test(new URL(value).hostname) ? "douyin" : "video_channel"; }
function platformLabel(value: string) { return value === "douyin" ? "抖音" : value === "video_channel" ? "视频号" : "短视频"; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function errorMessage(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
