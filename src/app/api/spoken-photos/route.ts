import sharp from "sharp";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";
import { generateImageSet } from "@/lib/agent/image-generator";
import { storeDigitalHumanMedia } from "@/lib/digital-human/media-assets";
import { getPeoplePortrait, listPeoplePortraits } from "@/lib/digital-human/people-portrait-library";

export const runtime="nodejs";
type PhotoRow={id:string;name:string;media_id:string;source_type:string;source_asset_id:string|null;source_template_collection:string|null;source_template_id:string|null;created_at:string};
const photoRows=(userId:string)=>query<PhotoRow>(`select id,name,media_id,source_type,source_asset_id,source_template_collection,source_template_id,created_at from spoken_photo_assets where user_id=$1 order by created_at desc`,[userId]);

async function normalized(file:File){
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<1024||file.size>15*1024*1024)throw new Error("请选择 15 MB 内的 JPG、PNG 或 WebP 照片");
  const bytes=Buffer.from(await file.arrayBuffer());
  return sharp(bytes).rotate().resize({width:2048,height:2048,fit:"inside",withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
}
async function sourceImage(templateId:string){
  const template=await getPeoplePortrait(templateId);
  if(!template)throw new Error("口播模板不存在");
  const bytes=await readFile(template.filePath);
  if(bytes.length>15*1024*1024)throw new Error("模板照片过大");
  return {name:template.name,bytes};
}
async function save(userId:string,name:string,bytes:Buffer,sourceType:"upload"|"template"|"face_swap",sourceTemplate?:{collection:"people";id:string}){
  const normalizedBytes=await sharp(bytes).rotate().resize({width:2048,height:2048,fit:"inside",withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
  const mediaId=await storeDigitalHumanMedia({userId,kind:"spoken_photo",bytes:normalizedBytes,contentType:"image/jpeg",fileName:`${name}.jpg`});
  const row=await query<PhotoRow>(`insert into spoken_photo_assets(user_id,name,media_id,source_type,source_template_collection,source_template_id) values($1,$2,$3,$4,$5,$6) returning id,name,media_id,source_type,source_asset_id,source_template_collection,source_template_id,created_at`,[userId,name,mediaId,sourceType,sourceTemplate?.collection||null,sourceTemplate?.id||null]);
  return {...row.rows[0],url:`/api/digital-human-media/${mediaId}`};
}

export async function GET(){
  const user=await requireSessionUser();if(user instanceof Response)return user;
  const [photos,templates]=await Promise.all([photoRows(user.id),listPeoplePortraits()]);
  return Response.json({photos:photos.rows.map(row=>({...row,url:`/api/digital-human-media/${row.media_id}`})),templates:templates.map(({id,name,description,category,figureType,imageUrl})=>({id,name,description,category,figureType,imageUrl}))});
}

export async function POST(request:Request){
  const user=await requireSessionUser();if(user instanceof Response)return user;
  const form=await request.formData().catch(()=>null);if(!form||form.get("consent")!=="true")return Response.json({error:"请确认照片使用授权"},{status:400});
  const action=String(form.get("action")||"upload"),name=String(form.get("name")||"").trim().slice(0,80),templateId=String(form.get("templateId")||"");
  if(!name||!["upload","import","swap"].includes(action))return Response.json({error:"照片参数不完整"},{status:400});
  try{
    if(action==="upload"){
      const file=form.get("file");if(!(file instanceof File))throw new Error("请选择口播照片");
      return Response.json({photo:await save(user.id,name,await normalized(file),"upload")},{status:201});
    }
    if(!/^[a-zA-Z0-9-]{2,100}$/.test(templateId))throw new Error("请选择口播模板");
    const sourceTemplate={collection:"people" as const,id:templateId};
    const source=await sourceImage(templateId);
    if(action==="import")return Response.json({photo:await save(user.id,name,source.bytes,"template",sourceTemplate)},{status:201});
    const face=form.get("facePhoto");if(!(face instanceof File))throw new Error("请上传用于换脸的照片");
    const faceBytes=await normalized(face);
    const base=await sharp(source.bytes).rotate().jpeg({quality:90}).toBuffer();
    const result=await generateImageSet({prompt:"Use image 1 as the base portrait and image 2 as the authorized face reference. Replace only the face and matching skin tone in image 1 with the identity from image 2. Preserve image 1 pose, clothes, framing, lighting and background. Keep one natural adult person, realistic photographic appearance, no text or watermark.",style:"photorealistic face replacement",ratio:"9:16",count:1,referenceImages:[`data:image/jpeg;base64,${base.toString("base64")}`,`data:image/jpeg;base64,${faceBytes.toString("base64")}`]});
    const output=result.images[0]?.url;if(!output)throw new Error(result.summary||"换脸生成失败，请稍后重试");
    let bytes:Buffer;
    if(output.startsWith("data:image/"))bytes=Buffer.from(output.split(",")[1]||"","base64");
    else {const url=new URL(output);if(url.protocol!=="https:")throw new Error("换脸结果地址无效");const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error("换脸结果下载失败");bytes=Buffer.from(await response.arrayBuffer());}
    if(!bytes.length||bytes.length>20*1024*1024)throw new Error("换脸结果文件异常");
    return Response.json({photo:await save(user.id,name,bytes,"face_swap",sourceTemplate)},{status:201});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"照片保存失败"},{status:502});}
}

export async function DELETE(request:Request){
  const user=await requireSessionUser();if(user instanceof Response)return user;
  const body=await request.json().catch(()=>null);const parsed=z.object({id:z.string().uuid()}).safeParse(body);
  if(!parsed.success)return Response.json({error:"照片参数无效"},{status:400});
  const deleted=await query<{id:string}>(`delete from spoken_photo_assets where user_id=$1 and id=$2 returning id`,[user.id,parsed.data.id]);
  return deleted.rows[0]?Response.json({ok:true}):Response.json({error:"照片不存在"},{status:404});
}
