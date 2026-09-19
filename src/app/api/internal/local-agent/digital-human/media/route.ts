import { MEDIA_MAX_BYTES, MediaNodeError } from "@/lib/digital-human/media-node";
import { requireLocalAgent } from "@/lib/local-agent/auth";
import { query } from "@/lib/db/client";
import { storeDigitalHumanMediaStream, storeDigitalHumanMedia } from "@/lib/digital-human/media-assets";

export async function PUT(request: Request) {
  const unauthorized=requireLocalAgent(request);if(unauthorized)return unauthorized;
  const url=new URL(request.url);const jobId=url.searchParams.get("jobId")||"";const kind=url.searchParams.get("kind")==="presenter_master"?"presenter_master":url.searchParams.get("kind")==="output"?"output":url.searchParams.get("kind")==="cover"?"cover":url.searchParams.get("kind")==="material"?"material":null;
  if(!/^[0-9a-f-]{36}$/i.test(jobId)||!kind||!request.body)return Response.json({error:"invalid_media_upload"},{status:400});
  const declared=Number(request.headers.get("content-length")||0);
  if(!Number.isSafeInteger(declared)||declared<0)return Response.json({error:"invalid_length"},{status:400});
  if(declared>MEDIA_MAX_BYTES)return Response.json({error:"媒体文件不能超过 500 MB"},{status:413});
  const job=await query<{user_id:string;asset_id:string|null;title:string;status:string;request_json:Record<string,unknown>}>(`select user_id,asset_id,title,status,request_json from digital_human_video_jobs where id=$1`,[jobId]);const row=job.rows[0];if(!row)return Response.json({error:"job_not_found"},{status:404});
  if(!["queued","processing"].includes(row.status))return Response.json({error:"completed_media_is_immutable"},{status:409});
  if(kind==="presenter_master"&&row.request_json?.root_job_id)return Response.json({error:"revision_cannot_replace_master"},{status:409});
  const contentType=(request.headers.get("content-type")||"video/mp4").split(";")[0];if(!(kind==="material"?["image/jpeg","image/png","image/webp","video/mp4","video/webm"].includes(contentType):kind==="cover"?["image/jpeg","image/png","image/webp"].includes(contentType):["video/mp4","video/quicktime","video/webm"].includes(contentType)))return Response.json({error:"unsupported_media_type"},{status:415});
  if(kind==="material") {
    if(declared>45*1024*1024)return Response.json({error:"material_too_large"},{status:413});
    const bytes=Buffer.from(await request.arrayBuffer());
    if(bytes.length>45*1024*1024)return Response.json({error:"material_too_large"},{status:413});
    const id=await storeDigitalHumanMedia({userId:row.user_id,kind:"preview",bytes,contentType,fileName:contentType.startsWith("video/")?"composition-material.webm":"composition-material.jpg"});
    await query("update digital_human_media_assets set metadata_json=metadata_json||jsonb_build_object('composition_job_id',$2::text) where id=$1",[id,jobId]);
    return Response.json({id,url:`/api/digital-human-media/${id}`,size:bytes.length});
  }
  try{const media=await storeDigitalHumanMediaStream({userId:row.user_id,digitalHumanId:row.asset_id||undefined,videoJobId:jobId,kind,body:request.body,contentLength:declared,contentType,fileName:decodeURIComponent(request.headers.get("x-xiaogu-filename")||`${row.title}.${kind==="cover"?"jpg":"mp4"}`),sourceUrl:request.headers.get("x-xiaogu-source-url")||undefined});return Response.json({ok:true,...media});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"媒体保存失败"},{status:error instanceof MediaNodeError?error.status:500});}
}
