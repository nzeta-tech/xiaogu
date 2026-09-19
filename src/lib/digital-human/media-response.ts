import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { fetchMediaObject } from "./media-node.ts";
import type { readDigitalHumanMedia } from "./media-assets";

export function parseMediaRange(value: string | null, size: number) {
  if (!value) return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!match||(!match[1]&&!match[2])||size<1)return false;
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  const end=match[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;
  return Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<=end&&start<size?{start,end}:false;
}
export async function mediaResponse(media: NonNullable<Awaited<ReturnType<typeof readDigitalHumanMedia>>>, range: string | null = null, download = false) {
  const headers=new Headers({"content-type":media.row.content_type,"content-disposition":`${download?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(media.row.original_filename)}`,"cache-control":"private, max-age=300","accept-ranges":"bytes","x-content-type-options":"nosniff"});
  if ('remoteKey' in media && media.remoteKey) {
    const response=await fetchMediaObject(media.remoteKey,range);
    for(const key of ['content-length','content-range']){const value=response.headers.get(key);if(value)headers.set(key,value);}
    return new Response(response.body,{status:response.status,headers});
  }
  const bytes='bytes' in media?media.bytes:undefined;
  const filePath='filePath' in media?media.filePath:undefined;
  const size=Number(media.row.size_bytes)||bytes?.length||0;
  const selected=parseMediaRange(range,size);
  if(selected===false){headers.set('content-range',`bytes */${size}`);return new Response(null,{status:416,headers});}
  if(!filePath&&!bytes)return Response.json({error:'文件不存在'},{status:404});
  headers.set('content-length',String(selected?selected.end-selected.start+1:size));
  if(selected)headers.set('content-range',`bytes ${selected.start}-${selected.end}/${size}`);
  const body=filePath?Readable.toWeb(createReadStream(filePath,selected||undefined)):selected?bytes!.subarray(selected.start,selected.end+1):bytes!;
  return new Response(body as BodyInit,{status:selected?206:200,headers});
}
