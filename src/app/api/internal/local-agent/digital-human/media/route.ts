import { requireLocalAgent } from "@/lib/local-agent/auth";
import { query } from "@/lib/db/client";
import { storeDigitalHumanMediaStream } from "@/lib/digital-human/media-assets";

export async function PUT(request: Request) {
  const unauthorized=requireLocalAgent(request);if(unauthorized)return unauthorized;
  const url=new URL(request.url);const jobId=url.searchParams.get("jobId")||"";const kind=url.searchParams.get("kind")==="presenter_master"?"presenter_master":url.searchParams.get("kind")==="output"?"output":null;
  if(!/^[0-9a-f-]{36}$/i.test(jobId)||!kind||!request.body)return Response.json({error:"invalid_media_upload"},{status:400});
  const job=await query<{user_id:string;asset_id:string;title:string}>(`select user_id,asset_id,title from digital_human_video_jobs where id=$1`,[jobId]);const row=job.rows[0];if(!row)return Response.json({error:"job_not_found"},{status:404});
  const contentType=(request.headers.get("content-type")||"video/mp4").split(";")[0];if(!["video/mp4","video/quicktime","video/webm"].includes(contentType))return Response.json({error:"unsupported_media_type"},{status:415});
  try{const media=await storeDigitalHumanMediaStream({userId:row.user_id,digitalHumanId:row.asset_id,videoJobId:jobId,kind,body:request.body,contentLength:Number(request.headers.get("content-length")||0),contentType,fileName:decodeURIComponent(request.headers.get("x-xiaogu-filename")||`${row.title}.mp4`),sourceUrl:request.headers.get("x-xiaogu-source-url")||undefined});return Response.json({ok:true,...media});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"媒体保存失败"},{status:500});}
}
