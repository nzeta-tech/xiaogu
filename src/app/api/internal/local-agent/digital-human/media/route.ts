import {validateUploadAssembly,assembleVerifiedParts,UPLOAD_PART_BYTES} from "@/lib/digital-human/media-upload-parts";
import {mediaNodeConfig,fetchMediaObject,removeMediaObject} from "@/lib/digital-human/media-node";
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
    const uploadPart=request.headers.get("x-xiaogu-upload-part")==="1";
    if(uploadPart&&declared>UPLOAD_PART_BYTES)return Response.json({error:"upload_part_too_large"},{status:413});
    if(declared>45*1024*1024)return Response.json({error:"material_too_large"},{status:413});
    const bytes=Buffer.from(await request.arrayBuffer());
    if(uploadPart&&bytes.length>UPLOAD_PART_BYTES)return Response.json({error:"upload_part_too_large"},{status:413});
    if(bytes.length>45*1024*1024)return Response.json({error:"material_too_large"},{status:413});
    const id=await storeDigitalHumanMedia({userId:row.user_id,kind:"preview",bytes,contentType,fileName:contentType.startsWith("video/")?"composition-material.webm":"composition-material.jpg"});
    await query("update digital_human_media_assets set metadata_json=metadata_json||jsonb_build_object('composition_job_id',$2::text,'upload_part',$3::boolean) where id=$1",[id,jobId,uploadPart]);
    return Response.json({id,url:`/api/digital-human-media/${id}`,size:bytes.length});
  }
  try{const media=await storeDigitalHumanMediaStream({userId:row.user_id,digitalHumanId:row.asset_id||undefined,videoJobId:jobId,kind,body:request.body,contentLength:declared,contentType,fileName:decodeURIComponent(request.headers.get("x-xiaogu-filename")||`${row.title}.${kind==="cover"?"jpg":"mp4"}`),sourceUrl:request.headers.get("x-xiaogu-source-url")||undefined});return Response.json({ok:true,...media});}
  catch(error){return Response.json({error:error instanceof Error?error.message:"媒体保存失败"},{status:error instanceof MediaNodeError?error.status:500});}
}

export async function POST(request:Request){
  const unauthorized=requireLocalAgent(request);if(unauthorized)return unauthorized;
  let input:ReturnType<typeof validateUploadAssembly>;try{input=validateUploadAssembly(await request.json());}catch{return Response.json({error:"invalid_upload_assembly"},{status:400});}
  const config=mediaNodeConfig();if(!config)return Response.json({error:"multipart_storage_unavailable"},{status:503});
  const row=(await query<{user_id:string;asset_id:string|null;status:string;request_json:Record<string,unknown>}>("select user_id,asset_id,status,request_json from digital_human_video_jobs where id=$1",[input.jobId])).rows[0];
  if(!row)return Response.json({error:"job_not_found"},{status:404});
  if(!["queued","processing"].includes(row.status)||input.kind==="presenter_master"&&row.request_json.root_job_id)return Response.json({error:"completed_media_is_immutable"},{status:409});
  const existing=(await query<{id:string;size_bytes:number}>("select id,size_bytes from digital_human_media_assets where user_id=$1 and video_job_id=$2 and kind=$3 and sha256=$4",[row.user_id,input.jobId,input.kind,input.sha256])).rows[0];
  if(existing&&Number(existing.size_bytes)===input.size)return Response.json({id:existing.id,url:`/api/digital-human-media/${existing.id}`,size:input.size});
  const found=await query<{id:string;size_bytes:number;storage_key:string;storage_node_id:string}>("select id,size_bytes,storage_key,storage_node_id from digital_human_media_assets where id=any($1::uuid[]) and user_id=$2 and kind='preview' and metadata_json->>'composition_job_id'=$3 and metadata_json->>'upload_part'='true'",[input.parts,row.user_id,input.jobId]);
  const byId=new Map(found.rows.map(p=>[p.id,p]));
  if(input.parts.some(id=>!byId.has(id)||byId.get(id)!.storage_node_id!==config.id))return Response.json({error:"upload_parts_not_owned"},{status:404});
  try{
    const body=assembleVerifiedParts(input.parts.map(id=>{const part=byId.get(id)!;return {size:Number(part.size_bytes),open:async()=>{const r=await fetchMediaObject(part.storage_key);if(r.status!==200||!r.body)throw Error("upload_part_missing");return r.body;}};}),input.size,input.sha256);
    const media=await storeDigitalHumanMediaStream({userId:row.user_id,digitalHumanId:row.asset_id||undefined,videoJobId:input.jobId,kind:input.kind,body,contentLength:input.size,contentType:input.contentType,fileName:input.fileName,expectedSha256:input.sha256});
    // The final object is durable before temporary chunks are removed. Cleanup
    // cannot turn a successful upload into a request to regenerate the video.
    for(const part of found.rows){try{await removeMediaObject(part.storage_key);await query("delete from digital_human_media_assets where id=$1 and user_id=$2 and metadata_json->>'upload_part'='true'",[part.id,row.user_id]);}catch{console.warn("[spoken-media] temporary upload part retained for cleanup");}}
    return Response.json(media);
  }catch(error){return Response.json({error:error instanceof Error?error.message:"upload_assembly_failed"},{status:error instanceof MediaNodeError?error.status:400});}
}
