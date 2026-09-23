import { mediaResponse } from "@/lib/digital-human/media-response";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { requireLocalAgent } from "@/lib/local-agent/auth";
import { query } from "@/lib/db/client";
import { readDigitalHumanMedia, readDigitalHumanSource } from "@/lib/digital-human/media-assets";
import { resolveXiaoguVideoTemplateMedia, type VideoTemplateCollection } from "@/lib/digital-human/video-template-library";

export async function GET(request: Request) {
  const unauthorized = requireLocalAgent(request);
  if (unauthorized) return unauthorized;
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId") || "";
  const kind = params.get("kind") || "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !["photo", "avatar_source", "template_cover", "recut", "master", "material"].includes(kind)) return Response.json({ error: "invalid_input" }, { status: 400 });
  const result = await query<{user_id:string;asset_id:string|null;request_json:Record<string,unknown>}>(`select user_id,asset_id,request_json from digital_human_video_jobs where id=$1 and request_json->>'workflow'='spoken_video_v1'`, [jobId]);
  const job = result.rows[0];
  if (!job) return Response.json({ error: "job_not_found" }, { status: 404 });
  if (["recut", "master", "material"].includes(kind)) {
    const rootId=String(job.request_json.root_job_id||jobId);
    const root=(await query<{id:string;title:string;script:string;aspect_ratio:string;provider_job_id:string|null;request_json:Record<string,unknown>}>("select id,title,script,aspect_ratio,provider_job_id,request_json from digital_human_video_jobs where id=$1 and user_id=$2",[rootId,job.user_id])).rows[0];
    if(!root)return Response.json({error:"original_not_found"},{status:404});
    if(kind==="recut") {
      const base=(await query<{request_json:Record<string,unknown>}>("select request_json from digital_human_video_jobs where id=$1 and user_id=$2 and status in ('completed','failed') and (id=$3 or request_json->>'root_job_id'=$3::text)",[String(job.request_json.base_version_id||rootId),job.user_id,rootId])).rows[0];
      if(!base)return Response.json({error:"base_version_not_found"},{status:404});
      const master=(await query<{id:string;size_bytes:string;sha256:string}>("select id,size_bytes,sha256 from digital_human_media_assets where video_job_id=$1 and user_id=$2 and kind='presenter_master'",[rootId,job.user_id])).rows[0];
      return Response.json({master:master?{id:master.id,size:Number(master.size_bytes),sha256:master.sha256}:null,title:root.title,script:root.script,aspectRatio:root.aspect_ratio,productionMode:job.request_json.production_mode==="smart"?"smart":"basic",baseProductionMode:base.request_json.production_mode==="smart"?"smart":"basic",providerJobId:root.provider_job_id,subtitleSrt:base.request_json.subtitle_srt||root.request_json.subtitle_srt||"",materialPlan:base.request_json.material_plan||[],options:base.request_json.edit_options||{},instructions:String(job.request_json.edit_instructions||"")});
    }
    const mediaId=kind==="master"?(await query<{id:string}>("select id from digital_human_media_assets where video_job_id=$1 and user_id=$2 and kind='presenter_master'",[rootId,job.user_id])).rows[0]?.id:params.get("mediaId");
    if(!mediaId||!/^[0-9a-f-]{36}$/i.test(mediaId))return Response.json({error:"media_not_found"},{status:404});
    const media=await readDigitalHumanMedia(job.user_id,mediaId);
    if(!media)return Response.json({error:"media_unavailable"},{status:404});
    return mediaResponse(media,request.headers.get("range"));
  }
  if (kind === "photo") {
    const id = String(job.request_json.photo_id || "");
    const owner = await query<{id:string}>(`select id from digital_human_media_assets where id=$1 and user_id=$2 and kind in ('input_photo','spoken_photo')`, [id,job.user_id]);
    if (!owner.rows[0]) return Response.json({ error: "photo_not_found" }, { status: 404 });
    const media = await readDigitalHumanMedia(job.user_id,id);
    if (!media) return Response.json({ error: "photo_unavailable" }, { status: 404 });
    return mediaResponse(media,request.headers.get("range"));
  }
  if (kind === "avatar_source") {
    if (!job.asset_id) return Response.json({ error: "avatar_not_selected" }, { status: 404 });
    const source = await readDigitalHumanSource(job.user_id,job.asset_id);
    if (!source) return Response.json({ error: "avatar_source_unavailable" }, { status: 404 });
    return new Response(source.bytes as BodyInit,{headers:{"content-type":source.row.content_type,"content-length":String(source.bytes.length)}});
  }
  const template = job.request_json.template as {collection?:string;id?:string}|undefined;
  if (!template || !["expressive","production"].includes(template.collection||"")) return Response.json({ error: "template_not_selected" }, { status: 404 });
  const saved = await query<{id:string}>(`select id from digital_human_template_favorites where user_id=$1 and collection=$2 and template_id=$3`,[job.user_id,template.collection,template.id]);
  if (!saved.rows[0]) return Response.json({ error: "template_not_owned" }, { status: 404 });
  const media = await resolveXiaoguVideoTemplateMedia(template.collection as VideoTemplateCollection,String(template.id),"cover");
  if (!media) return Response.json({ error: "template_cover_unavailable" }, { status: 404 });
  return new Response(Readable.toWeb(createReadStream(media.file)) as BodyInit,{headers:{"content-type":media.contentType,"content-length":String(media.size)}});
}
