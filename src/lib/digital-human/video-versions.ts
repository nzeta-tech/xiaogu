import { randomUUID } from "node:crypto";
import { getPool, query } from "@/lib/db/client";
import type { DigitalHumanVideoJob } from "./types";

export class VideoVersionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function createVideoVersion(userId: string, baseId: string, instructions: string, requestId: string, productionMode?: "basic" | "smart") {
  const db = await getPool().connect();
  try {
    await db.query("begin");
    const base = (await db.query<DigitalHumanVideoJob>("select * from digital_human_video_jobs where id=$1 and user_id=$2", [baseId, userId])).rows[0];
    if (!base || base.request_json?.workflow !== "spoken_video_v1") throw new VideoVersionError("作品不存在", 404);
    const rootId = String(base.request_json?.root_job_id || base.id);
    const root = (await db.query<DigitalHumanVideoJob>("select * from digital_human_video_jobs where id=$1 and user_id=$2 for update", [rootId, userId])).rows[0];
    if (!root) throw new VideoVersionError("原作品不存在", 404);
    const duplicate = (await db.query<DigitalHumanVideoJob>("select * from digital_human_video_jobs where user_id=$1 and request_json->>'root_job_id'=$2 and request_json->>'revision_request_id'=$3", [userId, rootId, requestId])).rows[0];
    if (duplicate) { await db.query("commit"); return duplicate; }
    if (base.status !== "failed" && (base.status !== "completed" || !base.video_url)) throw new VideoVersionError("请选择已完成的版本，或已有母片的失败任务作为修改起点");
    const active = await db.query("select id from digital_human_video_jobs where user_id=$1 and request_json->>'root_job_id'=$2 and status in ('queued','processing')", [userId, rootId]);
    if (active.rowCount) throw new VideoVersionError("这条作品已有修改正在制作，请完成后再提交", 409);
    const master = await db.query("select id from digital_human_media_assets where video_job_id=$1 and user_id=$2 and kind='presenter_master'", [rootId, userId]);
    if (!master.rowCount) throw new VideoVersionError("原口播文件暂不可用，无法继续剪辑。已有成片仍可下载", 409);
    const revision = Number((await db.query("select coalesce(max((request_json->>'revision_number')::int),1)+1 as n from digital_human_video_jobs where user_id=$1 and request_json->>'root_job_id'=$2", [userId, rootId])).rows[0].n);
    const jobId = randomUUID(), taskId = randomUUID();
    const request = { workflow: "spoken_video_v1", production_mode: productionMode || (base.request_json?.production_mode === "smart" ? "smart" : "basic"), stage: "queued", root_job_id: rootId, base_version_id: base.id, revision_number: revision, revision_request_id: requestId, edit_instructions: instructions, local_task_id: taskId, source_text_locked: true };
    const inserted = await db.query<DigitalHumanVideoJob>(`insert into digital_human_video_jobs(id,user_id,asset_id,provider,edition,title,script,aspect_ratio,subtitle_enabled,status,quota_cost,request_json)
      values($1,$2,$3,$4,$5,$6,$7,$8,true,'processing',0,$9) returning *`, [jobId, userId, root.asset_id, root.provider, root.edition, root.title, root.script, root.aspect_ratio, request]);
    // The worker obtains all immutable inputs from the server; a revision task has no HeyGen submission parameters.
    await db.query(`insert into local_agent_tasks(id,task_type,owner_user_id,payload,dedupe_key,priority,max_attempts)
      values($1,'digital-human.video.produce',$2,$3,$4,90,1)`, [taskId, userId, { jobId, mode: "recut" }, jobId]);
    await db.query("update digital_human_video_jobs set updated_at=now() where id=$1",[rootId]);
    await db.query("commit");
    return inserted.rows[0];
  } catch (error) { await db.query("rollback"); throw error; } finally { db.release(); }
}

export async function selectVideoVersion(userId: string, rootId: string, versionId: string) {
  const result = await query(`update digital_human_video_jobs root
    set request_json=root.request_json||jsonb_build_object('selected_version_id',$3::text),updated_at=now()
    where root.id=$1 and root.user_id=$2 and not(root.request_json ? 'root_job_id')
      and root.request_json->>'workflow'='spoken_video_v1'
      and exists(select 1 from digital_human_video_jobs v where v.id=$3::uuid and v.user_id=$2 and v.status='completed' and v.video_url is not null and (v.id=root.id or v.request_json->>'root_job_id'=root.id::text))
    returning root.id`, [rootId, userId, versionId]);
  if (!result.rowCount) throw new VideoVersionError("版本不存在或尚未完成", 404);
}
