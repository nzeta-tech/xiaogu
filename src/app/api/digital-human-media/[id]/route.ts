import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { requireSessionUser } from "@/lib/auth/session";
import { readDigitalHumanMedia } from "@/lib/digital-human/media-assets";

function rangeFor(value: string | null, size: number) {
  const match=value?.match(/^bytes=(\d*)-(\d*)$/); if(!match)return null;
  const start=match[1]?Number(match[1]):0; const end=match[2]?Math.min(Number(match[2]),size-1):size-1;
  return Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>=start&&start<size?{start,end}:null;
}

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const user=await requireSessionUser();if(user instanceof Response)return user;const {id}=await context.params;
  const media=await readDigitalHumanMedia(user.id,id).catch(()=>null);if(!media)return Response.json({error:"文件不存在"},{status:404});
  const filePath="filePath" in media&&typeof media.filePath==="string"?media.filePath:null;
  const bytes="bytes" in media&&Buffer.isBuffer(media.bytes)?media.bytes:null;
  if(!filePath&&!bytes)return Response.json({error:"文件不存在"},{status:404});
  const size=Number(media.row.size_bytes)||(bytes?.length||0);const selected=rangeFor(request.headers.get("range"),size);const headers=new Headers({"content-type":media.row.content_type,"content-disposition":`inline; filename*=UTF-8''${encodeURIComponent(media.row.original_filename)}`,"cache-control":"private, max-age=300","accept-ranges":"bytes"});
  if(selected){headers.set("content-range",`bytes ${selected.start}-${selected.end}/${size}`);headers.set("content-length",String(selected.end-selected.start+1));const body=filePath?Readable.toWeb(createReadStream(filePath,{start:selected.start,end:selected.end})):bytes!.subarray(selected.start,selected.end+1);return new Response(body as BodyInit,{status:206,headers});}
  headers.set("content-length",String(size));const body=filePath?Readable.toWeb(createReadStream(filePath)):bytes!;return new Response(body as BodyInit,{headers});
}
