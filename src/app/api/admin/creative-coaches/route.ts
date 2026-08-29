import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { reconcileAvatarTrainingRuns, startAvatarVideoTraining } from "@/lib/avatar/video-training";
import { decodeWechatChannelTrainingTokens } from "@/lib/avatar/wechat-channel-tikhub";
import { reconcileCreativeCoachTrainingJobs } from "@/lib/avatar/creative-coach-training-orchestrator";
import { query } from "@/lib/db/client";

const submitSchema = z.object({
  coachId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(60),
  creatorName: z.string().trim().max(80).default(""),
  links: z.array(z.string().trim().url().max(1000)).max(20).default([]),
  wechatWorkTokens: z.array(z.string().min(20).max(10000)).max(500).default([]),
  authorized: z.literal(true),
});

type CoachRow = {
  id: string;
  name: string;
  creator_name: string;
  coach_scope: "personal" | "platform";
  status: "active" | "archived";
  latest_version: number;
  identity_card: { title?: string; summary?: string; scenarios?: string[]; styleTags?: string[]; bestFor?: string };
  version_id: string | null;
  sample_count: number;
  capabilities: string[];
  source_count: number;
  change_summary: string;
  updated_at: string;
  ip_positioning_prompt: string;
  content_creation_prompt: string;
  growth_prompt: string;
  content_skill_id: string | null;
  growth_skill_id: string | null;
};

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问教练生产" }, { status: 403 });
  // The admin production page is also where long-running platform training is
  // monitored. Reconcile here so its progress is not dependent on somebody
  // visiting the personal avatar workspace route.
  await reconcileAvatarTrainingRuns(user.id);
  void reconcileCreativeCoachTrainingJobs();
  const result = await query<CoachRow>(
    `select coaches.id,coaches.name,coaches.creator_name,coaches.coach_scope,coaches.status,
            coaches.latest_version,coaches.identity_card,coaches.updated_at,versions.id version_id,
            coalesce(versions.sample_count,0) sample_count,coalesce(cardinality(versions.source_skill_ids),0) source_count,
            coalesce(versions.change_summary,'') change_summary,
            coalesce(versions.ip_positioning_prompt,'') ip_positioning_prompt,
            coalesce(versions.content_creation_prompt,'') content_creation_prompt,
            coalesce(versions.growth_prompt,'') growth_prompt,
            (select source.id from avatar_creator_skills source where source.id=any(coalesce(versions.source_skill_ids,'{}'::uuid[])) and source.training_purpose='content' limit 1) content_skill_id,
            (select source.id from avatar_creator_skills source where source.id=any(coalesce(versions.source_skill_ids,'{}'::uuid[])) and source.training_purpose='lead-coach' limit 1) growth_skill_id,
            array_remove(array[
              case when length(coalesce(versions.ip_positioning_prompt,''))>0 then 'IP定位' end,
              case when length(coalesce(versions.content_creation_prompt,''))>0 then '内容创作' end,
              case when length(coalesce(versions.growth_prompt,''))>0 then '获客增长' end
            ],null) capabilities
       from creative_coaches coaches
       left join lateral (
         select * from creative_coach_versions
          where coach_id=coaches.id and status in ('active','restored')
          order by version desc limit 1
       ) versions on true
      where coaches.coach_scope='platform' or coaches.user_id=$1
      order by case when coaches.status='active' then 0 else 1 end,coaches.updated_at desc`,
    [user.id],
  );
  const runs = await query<{
    id: string; skill_name: string; training_purpose: "content" | "lead-coach"; status: "running" | "succeeded" | "failed";
    phase: string; total_count: number; completed_count: number; successful_count: number; error_message: string; created_at: string; updated_at: string;
    queued_count: number; running_count: number; failed_count: number;
    attempts: Array<{ link?: string; title?: string; status?: string; stage?: string; message?: string }>;
  }>(
    `select r.id,coalesce(s.name,'未命名教练') skill_name,coalesce(s.training_purpose,'content') training_purpose,
            r.status,r.phase,r.total_count,r.completed_count,r.successful_count,r.error_message,r.created_at,r.updated_at,
            count(*) filter(where t.status='queued')::int queued_count,count(*) filter(where t.status='running')::int running_count,
            count(*) filter(where t.status='failed')::int failed_count,coalesce(r.details_json->'attempts','[]'::jsonb) attempts
       from avatar_training_runs r left join avatar_creator_skills s on s.id=r.creator_skill_id
       left join avatar_training_tasks t on t.training_run_id=r.id
      where r.status='running' or r.updated_at>now()-interval '3 days'
      group by r.id,s.name,s.training_purpose
      order by case when r.status='running' then 0 else 1 end,r.updated_at desc limit 20`,
  );
  const jobs = await query<{
    id: string; coach_name: string; status: string; phase: string; attempt_count: number;
    error_message: string; updated_at: string; source_run_id: string; source_status: string;
    source_total: number; source_completed: number; source_successful: number;
  }>(
    `select jobs.id,coaches.name coach_name,jobs.status,jobs.phase,jobs.attempt_count,jobs.error_message,
            jobs.updated_at,jobs.source_run_id,runs.status source_status,runs.total_count source_total,
            runs.completed_count source_completed,runs.successful_count source_successful
       from creative_coach_training_jobs jobs
       join creative_coaches coaches on coaches.id=jobs.coach_id
       join avatar_training_runs runs on runs.id=jobs.source_run_id
      order by case when jobs.status in ('waiting_source','queued','training') then 0 else 1 end,jobs.updated_at desc limit 20`,
  ).catch(() => ({ rows: [] }));
  return Response.json({ coaches: result.rows, runs: runs.rows, jobs: jobs.rows }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权提交教练训练" }, { status: 403 });
  const parsed = submitSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "训练任务内容不完整" }, { status: 400 });
  const input = parsed.data;
  const mediaWorks = decodeWechatChannelTrainingTokens(input.wechatWorkTokens);
  if (input.links.length + mediaWorks.length < 12) {
    return Response.json({ error: "最新版教练训练至少需要 12 条作品，才能完成覆盖性分析和质量门。" }, { status: 400 });
  }

  const coach = input.coachId
    ? await query<{ id: string; name: string; creator_name: string; owner_user_id: string; content_skill_id: string | null }>(
      `select coaches.id,coaches.name,coaches.creator_name,coaches.user_id owner_user_id,
              (select source.id from creative_coach_versions versions
                join lateral unnest(versions.source_skill_ids) source_id(id) on true
                join avatar_creator_skills source on source.id=source_id.id and source.training_purpose='content'
               where versions.coach_id=coaches.id and versions.status in ('active','restored') order by versions.version desc limit 1) content_skill_id
         from creative_coaches coaches where coaches.id=$1 and coaches.coach_scope='platform'`,
      [input.coachId],
    )
    : await query<{ id: string; name: string; creator_name: string; owner_user_id: string; content_skill_id: string | null }>(
      `insert into creative_coaches(user_id,name,creator_name,coach_scope,status)
       values($1,$2,$3,'platform','archived')
       on conflict(user_id,coach_scope,lower(name)) do update set creator_name=excluded.creator_name,updated_at=now()
       returning id,name,creator_name,user_id owner_user_id,null::uuid content_skill_id`,
      [user.id, input.name, input.creatorName],
    );
  const coachRow = coach.rows[0];
  if (!coachRow) return Response.json({ error: "选择的教练不存在" }, { status: 404 });
  const activeJob = await query<{ id: string }>(
    `select id from creative_coach_training_jobs where coach_id=$1 and status in ('waiting_source','queued','training') limit 1`,
    [coachRow.id],
  ).catch(() => ({ rows: [] }));
  if (activeJob.rows[0]) return Response.json({ error: "该教练已有训练任务进行中，请等待完成后再继续加训。" }, { status: 409 });

  const sourceSkill = coachRow.content_skill_id
    ? { id: coachRow.content_skill_id }
    : (await query<{ id: string }>(
      `insert into avatar_creator_skills(user_id,name,creator_name,skill_scope,training_purpose,status)
       values($1,$2,$3,'platform','content','archived')
       on conflict(user_id,skill_scope,training_purpose,lower(name))
       do update set creator_name=excluded.creator_name,updated_at=now() returning id`,
      [coachRow.owner_user_id, coachRow.name, coachRow.creator_name || input.creatorName],
    )).rows[0];
  if (!sourceSkill) return Response.json({ error: "无法创建教练素材库" }, { status: 500 });

  try {
    const training = await startAvatarVideoTraining(user.id, input.links, sourceSkill.id, mediaWorks, "coach-source");
    await query(
      `insert into avatar_creator_skill_versions(skill_id,user_id,version,training_run_id,source_links,change_summary)
       select $1,$2,coalesce(max(version),0)+1,$3,$4::jsonb,'正在解析最新版教练训练素材'
         from avatar_creator_skill_versions where skill_id=$1`,
      [sourceSkill.id, user.id, training.runId, JSON.stringify([...input.links, ...mediaWorks.map((work) => work.sourceUrl)])],
    );
    const job = await query<{ id: string }>(
      `insert into creative_coach_training_jobs(user_id,coach_id,source_skill_id,source_run_id,status,phase,details_json)
       values($1,$2,$3,$4,'waiting_source','waiting-source',$5::jsonb) returning id`,
      [user.id, coachRow.id, sourceSkill.id, training.runId, JSON.stringify({ trainer: "progressive-skills-v1", requestedWorks: input.links.length + mediaWorks.length })],
    );
    return Response.json({ ok: true, jobId: job.rows[0].id, runId: training.runId, totalCount: training.totalCount }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "训练任务提交失败" }, { status: 500 });
  }
}
