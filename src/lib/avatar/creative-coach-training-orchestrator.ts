import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { query } from "../db/client.ts";

type TrainingJob = {
  id: string;
  user_id: string;
  coach_id: string;
  coach_name: string;
  creator_name: string;
  source_skill_id: string;
  source_run_id: string;
  status: "waiting_source" | "queued" | "training";
  attempt_count: number;
  source_status: "running" | "succeeded" | "failed";
  source_error: string;
  lease_expired: boolean;
};

const activeJobKey = Symbol.for("xiaogu.creative-coach-training-jobs");
const schedulerKey = Symbol.for("xiaogu.creative-coach-training-scheduler");
const orchestratorGlobal = globalThis as typeof globalThis & {
  [activeJobKey]?: Set<string>;
  [schedulerKey]?: ReturnType<typeof setInterval>;
};
const activeJobs = orchestratorGlobal[activeJobKey] ?? (orchestratorGlobal[activeJobKey] = new Set<string>());
const LEASE_MINUTES = 10;
const MAX_ATTEMPTS = 3;

export function decideCreativeCoachTrainingAction(input: {
  sourceStatus: "running" | "succeeded" | "failed";
  jobStatus: "waiting_source" | "queued" | "training";
  leaseExpired: boolean;
}) {
  if (input.sourceStatus === "failed") return "fail" as const;
  if (input.sourceStatus !== "succeeded") return "wait" as const;
  if (input.jobStatus === "training" && !input.leaseExpired) return "wait" as const;
  return "start" as const;
}

export function buildProgressiveCoachTrainingArgs(input: {
  scriptPath: string;
  coachName: string;
  creatorName: string;
  sourceSkillId: string;
}) {
  return [
    input.scriptPath,
    "--coach-name", input.coachName,
    "--creator-name", input.creatorName || input.coachName.replace(/教练$/, ""),
    "--source-skill-ids", input.sourceSkillId,
    "--activate",
  ];
}

export async function reconcileCreativeCoachTrainingJobs() {
  let jobs: TrainingJob[] = [];
  try {
    const result = await query<TrainingJob>(
      `select jobs.id,jobs.user_id,jobs.coach_id,jobs.source_skill_id,jobs.source_run_id,
              jobs.status,jobs.attempt_count,coaches.name coach_name,coaches.creator_name,
              runs.status source_status,coalesce(runs.error_message,'') source_error,
              coalesce(jobs.lease_until,now())<=now() lease_expired
         from creative_coach_training_jobs jobs
         join creative_coaches coaches on coaches.id=jobs.coach_id
         join avatar_training_runs runs on runs.id=jobs.source_run_id
        where jobs.status in ('waiting_source','queued')
           or (jobs.status='training' and coalesce(jobs.lease_until,now())<=now())
        order by jobs.created_at asc limit 10`,
    );
    jobs = result.rows;
  } catch {
    // Migration may not have been applied yet during a rolling deployment.
    return;
  }

  for (const job of jobs) {
    if (activeJobs.has(job.id)) continue;
    const action = decideCreativeCoachTrainingAction({
      sourceStatus: job.source_status,
      jobStatus: job.status,
      leaseExpired: job.lease_expired,
    });
    if (action === "fail") {
      await query(
        `update creative_coach_training_jobs set status='failed',phase='source-failed',error_message=$2,updated_at=now()
          where id=$1 and status<>'succeeded'`,
        [job.id, job.source_error || "素材解析训练失败"],
      );
      continue;
    }
    if (action !== "start") continue;
    await claimAndStartProgressiveTraining(job);
  }
}

async function claimAndStartProgressiveTraining(job: TrainingJob) {
  const claimed = await query<{ id: string; attempt_count: number }>(
    `update creative_coach_training_jobs
        set status='training',phase='starting-progressive-training',attempt_count=attempt_count+1,
            lease_until=now()+($2::text||' minutes')::interval,error_message='',updated_at=now()
      where id=$1 and status in ('waiting_source','queued','training')
        and (status<>'training' or coalesce(lease_until,now())<=now())
      returning id,attempt_count`,
    [job.id, LEASE_MINUTES],
  );
  if (!claimed.rows[0]) return;

  const scriptPath = path.join(process.cwd(), "scripts", "retrain-creative-coach-progressive-skills.mjs");
  if (!existsSync(scriptPath)) {
    await failJob(job.id, claimed.rows[0].attempt_count, "线上镜像缺少渐进式教练训练程序");
    return;
  }

  activeJobs.add(job.id);
  const child = spawn(process.execPath, buildProgressiveCoachTrainingArgs({
    scriptPath,
    coachName: job.coach_name,
    creatorName: job.creator_name,
    sourceSkillId: job.source_skill_id,
  }), {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let outputBuffer = "";
  let errorBuffer = "";
  let progressiveVersionId = "";
  let settled = false;
  const heartbeat = setInterval(() => {
    void query(
      `update creative_coach_training_jobs set lease_until=now()+($2::text||' minutes')::interval,updated_at=now()
        where id=$1 and status='training'`,
      [job.id, LEASE_MINUTES],
    ).catch(() => undefined);
  }, 60_000);
  heartbeat.unref?.();

  const handleLine = async (line: string) => {
    if (!line.trim()) return;
    let phase = "progressive-training";
    try {
      const event = JSON.parse(line) as { phase?: string; versionId?: string; version?: number; completed?: number; total?: number; skills?: number };
      phase = event.phase || phase;
      progressiveVersionId = event.versionId || progressiveVersionId;
      await query(
        `update creative_coach_training_jobs
            set phase=$2,lease_until=now()+($3::text||' minutes')::interval,
                progressive_version_id=coalesce($4::uuid,progressive_version_id),
                details_json=details_json||$5::jsonb,updated_at=now()
          where id=$1 and status='training'`,
        [job.id, phase, LEASE_MINUTES, progressiveVersionId || null, JSON.stringify({ lastEvent: event })],
      );
    } catch {
      await query(
        `update creative_coach_training_jobs set lease_until=now()+($2::text||' minutes')::interval,updated_at=now()
          where id=$1 and status='training'`,
        [job.id, LEASE_MINUTES],
      ).catch(() => undefined);
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    outputBuffer += chunk.toString();
    const lines = outputBuffer.split("\n");
    outputBuffer = lines.pop() ?? "";
    for (const line of lines) void handleLine(line);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    errorBuffer = `${errorBuffer}${chunk.toString()}`.slice(-8_000);
  });
  child.once("error", (error) => {
    if (settled) return;
    settled = true;
    clearInterval(heartbeat);
    void failJob(job.id, claimed.rows[0].attempt_count, error.message).finally(() => activeJobs.delete(job.id));
  });
  child.once("exit", (code) => {
    if (settled) return;
    settled = true;
    clearInterval(heartbeat);
    void (async () => {
      if (outputBuffer.trim()) await handleLine(outputBuffer);
      if (code === 0) {
        await query(
          `update creative_coach_training_jobs set status='succeeded',phase='active',lease_until=null,
              error_message='',progressive_version_id=coalesce($2::uuid,progressive_version_id),updated_at=now()
            where id=$1`,
          [job.id, progressiveVersionId || null],
        );
      } else {
        await failJob(job.id, claimed.rows[0].attempt_count, errorBuffer.trim() || `渐进训练进程退出码 ${code ?? "unknown"}`);
      }
    })().finally(() => activeJobs.delete(job.id));
  });
}

async function failJob(jobId: string, attemptCount: number, error: string) {
  const terminal = attemptCount >= MAX_ATTEMPTS;
  await query(
    `update creative_coach_training_jobs set status=$2,phase=$3,lease_until=null,error_message=$4,updated_at=now()
      where id=$1`,
    [jobId, terminal ? "failed" : "queued", terminal ? "failed" : "waiting-retry", error.slice(0, 4_000)],
  );
}

export function startCreativeCoachTrainingScheduler() {
  if (orchestratorGlobal[schedulerKey]) return;
  const tick = () => void reconcileCreativeCoachTrainingJobs().catch((error) => {
    console.error("creative coach training reconciliation failed", error);
  });
  tick();
  const timer = setInterval(tick, 15_000);
  timer.unref?.();
  orchestratorGlobal[schedulerKey] = timer;
}
