import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { canonicalizeInspectableSourceUrl, enqueueSourceInspectionTask, enqueueWechatChannelMediaInspectionTask, SOURCE_INSPECTION_PRIORITIES, standardizeSourceInspection, type StandardizedSourceInspection } from "@/lib/creation/source-inspection";
import type { WechatChannelTrainingWork } from "@/lib/avatar/wechat-channel-tikhub";
import { getPool, query } from "@/lib/db/client";
import type { LocalAgentTaskStatus } from "@/lib/local-agent/contracts";
import { createCompletedSourceInspectionTask, getLinkRemixAvailability, isLocalAgentDelegationEnabled } from "@/lib/local-agent/repository";
import { getLinkRemixSourceCache } from "@/lib/creation/link-remix-cache";

type TrainingRunRow = {
  id: string;
  training_type: string;
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

const TRAINING_MODEL_INPUT_CHARS = 48_000;
const TRAINING_CONTENT_CHARS = 96_000;
const TRAINING_TRANSCRIPT_TOTAL_CHARS = 42_000;
const TRAINING_TRANSCRIPT_MAX_CHARS = 3_000;
const TRAINING_DIRECT_WORK_LIMIT = 30;
const TRAINING_BATCH_SIZE = 30;
const TRAINING_BATCH_SUMMARY_CHARS = 2_400;

export async function startAvatarVideoTraining(userId: string, rawLinks: string[], creatorSkillId?: string, mediaWorks: WechatChannelTrainingWork[] = [], trainingPurpose: "content" | "lead-coach" = "content") {
  const links = [...new Set(rawLinks.map(canonicalizeInspectableSourceUrl))];
  const uniqueMediaWorks = [...new Map(mediaWorks.map((work) => [work.id, work])).values()];
  if (links.length + uniqueMediaWorks.length < 3) throw new Error("去重后至少需要 3 条作品。");
  if (links.length + uniqueMediaWorks.length > 500) throw new Error("单次最多训练 500 条作品。");
  if (links.some((link) => !isTrainingSourceUrl(link))) throw new Error("训练支持抖音、视频号和公众号的单条作品链接。");

  const trainingSources = [...links, ...uniqueMediaWorks.map((work) => work.sourceUrl)];
  const cachedEntries = await Promise.all(trainingSources.map(async (link) => [link, await getLinkRemixSourceCache(link)] as const));
  const cachedByUrl = new Map(cachedEntries);
  if (cachedEntries.some(([, cached]) => !cached)) {
    if (process.env.LOCAL_AGENT_ENABLED !== "1") throw new Error("共享作品解析服务尚未启用，请联系管理员。");
    const [availability, delegationEnabled] = await Promise.all([getLinkRemixAvailability(), isLocalAgentDelegationEnabled()]);
    if (!delegationEnabled || !availability.available) throw new Error(availability.reason || "作品解析服务暂不可用，请稍后重试。");
  }
  const initialAttempts: VideoTrainingAttempt[] = trainingSources.map((link) => ({
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
     values ($1, $5, 'queued', $2, $3::jsonb, $4) returning id`,
    [userId, trainingSources.length, JSON.stringify({ sourceLinks: trainingSources, attempts: initialAttempts, trainingPurpose }), creatorSkillId ?? null, trainingPurpose === "lead-coach" ? "lead_coach" : "short_video"],
  );
  const runId = run.rows[0].id;
  try {
    const queued = [] as Array<{ taskId: string; url: string }>;
    for (const link of links) {
      const cached = cachedByUrl.get(link);
      if (cached) {
        const task = await createCompletedSourceInspectionTask({ ownerUserId: userId, url: link, purpose: "avatar_training", result: { ...cached.result } });
        queued.push({ taskId: task.id, url: link });
        continue;
      }
      const { task, canonicalUrl } = await enqueueSourceInspectionTask({
        userId,
        url: link,
        purpose: "avatar_training",
        priority: SOURCE_INSPECTION_PRIORITIES.AVATAR_TRAINING,
        maxAttempts: 3,
      });
      queued.push({ taskId: task.id, url: canonicalUrl });
    }
    for (const work of uniqueMediaWorks) {
      const cached = cachedByUrl.get(work.sourceUrl);
      if (cached) {
        const task = await createCompletedSourceInspectionTask({ ownerUserId: userId, url: work.sourceUrl, purpose: "avatar_training", result: { ...cached.result } });
        queued.push({ taskId: task.id, url: work.sourceUrl });
        continue;
      }
      const { task, canonicalUrl } = await enqueueWechatChannelMediaInspectionTask({
        userId, work, priority: SOURCE_INSPECTION_PRIORITIES.AVATAR_TRAINING, maxAttempts: 3,
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
      [runId, userId, JSON.stringify({ sourceLinks: trainingSources, attempts: initialAttempts.map((attempt, index) => ({ ...attempt, taskId: queued[index]?.taskId ?? "" })) })],
    );
    return { runId, taskIds: queued.map((item) => item.taskId), totalCount: trainingSources.length };
  } catch (error) {
    const message = errorMessage(error, "训练任务创建失败。");
    await query(`update avatar_training_runs set status='failed', phase='failed', error_message=$3, updated_at=now() where id=$1 and user_id=$2`, [runId, userId, message]);
    throw error;
  }
}

export async function reconcileAvatarTrainingRuns(userId: string) {
  const runs = await query<TrainingRunRow>(
    `select id, training_type, phase, status, total_count, updated_at from avatar_training_runs
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
    const failureMessage = "至少需要成功解析标题并转写 3 条作品。请检查每条作品的失败原因后重试。";
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update avatar_training_runs set status='failed', phase='failed', completed_count=$3, successful_count=$4,
         error_message=$5, details_json=$6::jsonb, updated_at=now()
         where id=$1 and user_id=$2 and status='running'`,
        [run.id, userId, terminalCount, normalized.length, failureMessage, JSON.stringify(details)],
      );
      await client.query(
        `update avatar_creator_skill_versions set status='failed', change_summary=$3
         where training_run_id=$1 and user_id=$2 and status='training'`,
        [run.id, userId, failureMessage],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  const claimed = await query<{ id: string }>(
    `update avatar_training_runs set phase='generating-report', completed_count=$3, successful_count=$4, error_message='', details_json=$5::jsonb, updated_at=now()
     where id=$1 and user_id=$2 and status='running'
       and (phase<>'generating-report' or updated_at<now()-interval '5 minutes') returning id`,
    [run.id, userId, terminalCount, normalized.length, JSON.stringify(details)],
  );
  if (!claimed.rows[0]) return;
  await finalizeTrainingRun(userId, run.id, normalized, details, run.training_type === "lead_coach" ? "lead-coach" : "content");
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

async function finalizeTrainingRun(userId: string, runId: string, works: StandardizedSourceInspection[], details: Record<string, unknown>, trainingPurpose: "content" | "lead-coach") {
  const content = buildTrainingContent(works);
  const analysis = await buildTrainingAnalysis(works, userId, async (completedBatches, batchCount) => {
    await query(
      `update avatar_training_runs set updated_at=now(),details_json=jsonb_set(details_json,'{analysisProgress}',$3::jsonb,true)
       where id=$1 and user_id=$2 and status='running'`,
      [runId, userId, JSON.stringify({ completedBatches, batchCount })],
    );
  });
  const candidates = await buildVideoMemoryCandidates(analysis.content, works.length, userId);
  const completedDetails = { ...details, analysis: analysis.metadata };
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
    const sourceType = platforms.length === 1 && platforms[0] === "douyin" ? "douyin" : platforms.length === 1 && platforms[0] === "wechat_article" ? "article" : platforms.length === 1 ? "video_channel" : "transcript";
    const sourceLabel = platforms.length === 1 ? `${platformLabel(platforms[0])}训练` : "多平台作品训练";
    const source = await client.query<{ id: string }>(
      `insert into avatar_memory_sources(user_id, source_type, title, content, status, sensitivity, metadata_json)
       values ($1, $2, $3, $4, 'disabled', 'normal', $5::jsonb) returning id`,
      [userId, sourceType, `${sourceLabel} · ${works.length} 条作品`, content, JSON.stringify({ sourceLabel, memoryScope: "short_video", sourceLinks: works.map((work) => work.sourceUrl), platforms, workCount: works.length, importedAt: new Date().toISOString() })],
    );
    const sourceId = source.rows[0].id;
    if (locked.rows[0].creator_skill_id) {
      const skillPrompt = await buildCreatorSkillPrompt(analysis.content, works.length, userId, trainingPurpose);
      const identityCard = await buildCreatorIdentityCard(skillPrompt, userId, trainingPurpose);
      await client.query(`update avatar_creator_skill_versions set status='superseded' where skill_id=$1 and status in ('active', 'restored')`, [locked.rows[0].creator_skill_id]);
      await client.query(
        `update avatar_creator_skill_versions set status='active', sample_count=$3, skill_prompt=$4, change_summary=$5
         where training_run_id=$1 and user_id=$2`,
        [runId, userId, works.length, skillPrompt, `基于 ${works.length} 条授权作品蒸馏${trainingPurpose === "lead-coach" ? "获客教练方法" : "创作方式"}`],
      );
      await client.query(`update avatar_creator_skills set latest_version = (select version from avatar_creator_skill_versions where training_run_id=$1), identity_card=case when identity_card='{}'::jsonb then $4::jsonb else identity_card end, identity_card_draft=$4::jsonb, updated_at=now() where id=$2 and user_id=$3`, [runId, locked.rows[0].creator_skill_id, userId, JSON.stringify(identityCard)]);
      if (trainingPurpose === "lead-coach") {
        const course = buildCoachCourse(identityCard, skillPrompt);
        await client.query(
          `insert into avatar_coach_courses(skill_id, title, summary, modules_json, status)
           values ($1,$2,$3,$4::jsonb,'active')
           on conflict (skill_id) do update set title=excluded.title, summary=excluded.summary, modules_json=excluded.modules_json, status='active', updated_at=now()`,
          [locked.rows[0].creator_skill_id, course.title, course.summary, JSON.stringify(course.modules)],
        );
      }
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
      [runId, userId, sourceId, works.length, JSON.stringify(completedDetails)],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function buildTrainingAnalysis(works: StandardizedSourceInspection[], userId: string, onBatchCompleted: (completedBatches: number, batchCount: number) => Promise<void>) {
  if (works.length <= TRAINING_DIRECT_WORK_LIMIT) {
    const material = buildBoundedTrainingMaterial(works);
    return { content: material.content, metadata: { mode: "direct", successfulWorkCount: works.length, analyzedWorkCount: material.analyzedWorkCount, batchCount: 1, inputChars: material.content.length, sourceChars: material.sourceChars, truncated: material.truncated } };
  }
  const batches = Array.from({ length: Math.ceil(works.length / TRAINING_BATCH_SIZE) }, (_, index) => works.slice(index * TRAINING_BATCH_SIZE, (index + 1) * TRAINING_BATCH_SIZE));
  const summaries: Array<{ summary: string; analyzedWorkCount: number; truncated: boolean }> = [];
  for (let index = 0; index < batches.length; index += 1) {
    summaries.push(await summarizeTrainingBatch(batches[index], index, batches.length, userId));
    await onBatchCompleted(index + 1, batches.length);
  }
  const merged = [`以下是 ${works.length} 条授权作品分成 ${batches.length} 批后得到的风格观察。合并时应优先采用跨批重复出现的稳定模式。`, ...summaries.map((item, index) => `【第 ${index + 1}/${batches.length} 批｜分析 ${item.analyzedWorkCount}/${batches[index].length} 条】\n${item.summary}`)].join("\n\n");
  const content = merged.slice(0, TRAINING_MODEL_INPUT_CHARS);
  return { content, metadata: { mode: "batched", successfulWorkCount: works.length, analyzedWorkCount: summaries.reduce((sum, item) => sum + item.analyzedWorkCount, 0), batchCount: batches.length, batchSize: TRAINING_BATCH_SIZE, inputChars: content.length, sourceChars: merged.length, truncated: merged.length > TRAINING_MODEL_INPUT_CHARS || summaries.some((item) => item.truncated) } };
}

async function summarizeTrainingBatch(works: StandardizedSourceInspection[], batchIndex: number, batchCount: number, userId: string) {
  const material = buildBoundedTrainingMaterial(works);
  const prompt = [`这是同一创作者训练材料的第 ${batchIndex + 1}/${batchCount} 批，共分析 ${material.analyzedWorkCount}/${works.length} 条。`, "仅提炼可观察且有重复证据的模式：选题切口、开头、叙事节奏、句式、观点组织、目标受众、承接方式、结尾互动和表达边界。", "不得复述具体作品，不得编造身份、经历、数据或营销目的。用紧凑的分点文本输出，并标注每个模式在本批出现的大致频次。", material.content].join("\n\n");
  try { return { summary: (await runInsuranceContentAgent([{ role: "user", content: prompt }], userId, "general")).trim().slice(0, TRAINING_BATCH_SUMMARY_CHARS), analyzedWorkCount: material.analyzedWorkCount, truncated: material.truncated }; }
  catch { return { summary: material.content.slice(0, TRAINING_BATCH_SUMMARY_CHARS), analyzedWorkCount: material.analyzedWorkCount, truncated: material.truncated }; }
}

function buildBoundedTrainingMaterial(works: StandardizedSourceInspection[]) {
  const transcriptBudget = Math.max(160, Math.min(TRAINING_TRANSCRIPT_MAX_CHARS, Math.floor(TRAINING_TRANSCRIPT_TOTAL_CHARS / Math.max(works.length, 1))));
  const header = `以下是创作者本人授权导入的 ${works.length} 条多平台作品。请学习选题、表达、结构、观点组织与用户承接方式。`;
  const blocks = works.map((work, index) => `【作品 ${index + 1}｜${platformLabel(work.platform)}】\n标题：${work.title}\n${work.platform === "wechat_article" ? "正文" : "口播转写"}：${work.transcript.slice(0, transcriptBudget)}`);
  const sourceChars = [header, ...blocks].join("\n\n").length;
  const accepted = [header];
  let analyzedWorkCount = 0;
  for (const block of blocks) {
    if ([...accepted, block].join("\n\n").length > TRAINING_MODEL_INPUT_CHARS) break;
    accepted.push(block); analyzedWorkCount += 1;
  }
  return { content: accepted.join("\n\n"), analyzedWorkCount, sourceChars, truncated: analyzedWorkCount < works.length };
}

async function buildCreatorSkillPrompt(content: string, workCount: number, userId: string, trainingPurpose: "content" | "lead-coach") {
  const request = [
    trainingPurpose === "lead-coach" ? "根据以下同一创作者的授权作品，蒸馏一份可直接用于获客辅导的教练 Skill。" : "根据以下同一创作者的授权作品，蒸馏一份可直接用于内容创作的创作 Skill。",
    trainingPurpose === "lead-coach" ? "重点提炼用户洞察、获客问题诊断、策略框架、提问方式、行动任务、复盘标准、转化路径和合规边界；不得照抄原文、冒充创作者或承诺效果。" : "只描述可观察的选题切口、开头、叙事节奏、句式、观点组织、结尾互动和边界；不要模仿或复述具体作品，不要冒充创作者，不要加入未经样本支持的个人经历或事实。",
    "用 6-10 条简洁规则输出，使用第二人称指令式表达。",
    `样本数：${workCount}`,
    content.slice(0, TRAINING_MODEL_INPUT_CHARS),
  ].join("\n\n");
  try { return (await runInsuranceContentAgent([{ role: "user", content: request }], userId, "general")).slice(0, 6000); } catch { return `基于 ${workCount} 条授权作品：优先保持样本中可观察到的选题切口、口语节奏、观点推进和结尾互动；不得复用原作品中的具体事实、案例或句子。`; }
}

async function buildCreatorIdentityCard(skillPrompt: string, userId: string, trainingPurpose: "content" | "lead-coach") {
  const fallback = {
    title: trainingPurpose === "lead-coach" ? "获客增长教练分身" : "个人创作风格分身",
    summary: trainingPurpose === "lead-coach" ? "根据授权内容提炼获客诊断、策略拆解、行动辅导和复盘方法。" : "根据授权作品提炼选题、叙事、句式和观点组织方式。",
    scenarios: trainingPurpose === "lead-coach" ? ["获客诊断", "行动计划", "转化复盘"] : ["短视频口播", "观点表达", "专业科普"],
    styleTags: trainingPurpose === "lead-coach" ? ["问题导向", "策略清晰", "行动陪跑"] : ["口语化", "逻辑清晰", "个人风格"],
    bestFor: trainingPurpose === "lead-coach" ? "需要诊断获客卡点并形成可执行增长计划的创作者" : "希望沿用已训练表达方式的创作者",
  };
  const request = [
    "请把下面的创作 Skill 归纳为一张供用户选择的分身身份卡。",
    "严格返回 JSON 对象，字段为 title、summary、scenarios、styleTags、bestFor。",
    "title 是 8-18 字的能力定位；summary 是 35-65 字；scenarios 和 styleTags 各 3 项，每项不超过 8 字；bestFor 是 25-45 字。",
    "只根据 Skill 中可观察的能力归纳，不得编造身份、经历、数据或效果；不要生成示例文案。",
    skillPrompt,
  ].join("\n\n");
  try {
    const output = await runInsuranceContentAgent([{ role: "user", content: request }], userId, "general");
    const value = JSON.parse(output.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
    const list = (input: unknown) => Array.isArray(input) ? input.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 16)).filter(Boolean).slice(0, 3) : [];
    return {
      title: text(value.title).slice(0, 36) || fallback.title,
      summary: text(value.summary).slice(0, 140) || fallback.summary,
      scenarios: list(value.scenarios).length ? list(value.scenarios) : fallback.scenarios,
      styleTags: list(value.styleTags).length ? list(value.styleTags) : fallback.styleTags,
      bestFor: text(value.bestFor).slice(0, 100) || fallback.bestFor,
    };
  } catch { return fallback; }
}

function buildCoachCourse(identity: { title: string; summary: string; scenarios: string[]; styleTags: string[]; bestFor: string }, skillPrompt: string) {
  const focus = identity.scenarios[0] || "获客增长";
  const rules = skillPrompt.split("\n").filter(Boolean).slice(0, 3).join("；").slice(0, 180);
  return {
    title: `${identity.title || "获客教练"} · 实战课程`,
    summary: `${identity.summary} 课程围绕诊断、内容承接、咨询转化和复盘四步展开。${rules ? `方法依据：${rules}` : ""}`,
    modules: [
      { key: "diagnose", title: "第 1 课：定位你的获客卡点", objective: `用 ${focus} 的视角识别渠道、信任与转化中的首要阻力。`, practice: "完成一次获客现状盘点：渠道、目标客户、咨询量与最大阻力。" },
      { key: "content", title: "第 2 课：建立内容信任", objective: "把用户问题转成可持续的内容主线，而不是只追热点。", practice: "写出 3 个针对目标客户真实顾虑的内容切口。" },
      { key: "conversion", title: "第 3 课：设计自然承接", objective: "将评论、私信和咨询路径拆成低压力、合规的下一步。", practice: "为一条内容设计一个评论互动与私信承接动作。" },
      { key: "review", title: "第 4 课：复盘并迭代", objective: "用有效咨询与行动完成度复盘，而非只看曝光数据。", practice: "完成本周一次复盘：保留一项有效动作，停止一项无效动作。" },
    ],
  };
}

function buildTrainingContent(works: StandardizedSourceInspection[]) {
  const transcriptBudget = Math.max(160, Math.min(TRAINING_TRANSCRIPT_MAX_CHARS, Math.floor(TRAINING_TRANSCRIPT_TOTAL_CHARS / Math.max(works.length, 1))));
  return [
    `以下是创作者本人授权导入的 ${works.length} 条多平台作品。请重点学习选题与切入、表达语气、内容结构、观点组织与用户承接；不要编造未出现的经历、数据或案例。`,
    ...works.map((work, index) => `【作品 ${index + 1}｜${platformLabel(work.platform)}】\n标题：${work.title}\n${work.platform === "wechat_article" ? "正文" : "口播转写"}：${work.transcript.slice(0, transcriptBudget)}\n链接：${work.sourceUrl}`),
  ].join("\n\n").slice(0, TRAINING_CONTENT_CHARS);
}

async function buildVideoMemoryCandidates(content: string, workCount: number, userId: string): Promise<VideoMemoryCandidate[]> {
  const prompt = [
    "以下是同一创作者的短视频标题与口播转写。只根据材料生成 4 条供创作者逐条确认的候选记忆：我怎么说、我为谁说、我如何承接、我坚持什么。",
    "‘我如何承接’只提取样本明确出现的评论关键词、私信咨询、资料领取或服务邀约，并写清适用主题/场景；不能根据保险身份臆测获客目的。‘我为谁说’只记录被反复明确点名的客群与痛点。",
    "严格返回 JSON 数组，每项包含 category(expression/audience/expertise/boundary)、title、content、evidence、memoryScope(global/short_video/marketing)。没有明确证据的维度也要返回，但 content 写‘样本不足，暂不建议采用’，不得编造。每项 content 50-100 字。",
    `作品数量：${workCount}`,
    "训练材料：",
    content.slice(0, TRAINING_MODEL_INPUT_CHARS),
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

function isTrainingSourceUrl(value: string) { return /(^|\.)(douyin\.com|weixin\.qq\.com|channels\.weixin\.qq\.com)$/i.test(new URL(value).hostname); }
function platformForUrl(value: string) { const hostname = new URL(value).hostname; return /douyin\.com$/i.test(hostname) ? "douyin" : /^mp\.weixin\.qq\.com$/i.test(hostname) ? "wechat_article" : "video_channel"; }
function platformLabel(value: string) { return value === "douyin" ? "抖音" : value === "video_channel" ? "视频号" : value === "wechat_article" ? "公众号" : "作品"; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function errorMessage(error: unknown, fallback: string) { return error instanceof Error && error.message ? error.message : fallback; }
