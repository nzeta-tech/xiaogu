import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const UPLOAD_PART_BYTES=8*1024*1024;
export function validateUploadAssembly(value: unknown){
  const v=value as {jobId?:string;kind?:string;parts?:string[];size?:number;sha256?:string;fileName?:string;contentType?:string};
  if(!v||!uuid.test(v.jobId||'')||!['output','presenter_master'].includes(v.kind||'')||!Array.isArray(v.parts)||v.parts.length<1||v.parts.length>64||new Set(v.parts).size!==v.parts.length||v.parts.some(id=>!uuid.test(id))||!Number.isSafeInteger(v.size)||v.size!<1||v.size!>500*1024*1024||!/^[a-f0-9]{64}$/.test(v.sha256||'')||!['video/mp4','video/quicktime','video/webm'].includes(v.contentType||'')||typeof v.fileName!=='string'||v.fileName.length>240)throw Error('invalid_upload_assembly');
  return v as {jobId:string;kind:'output'|'presenter_master';parts:string[];size:number;sha256:string;fileName:string;contentType:string};
}
export function assembleVerifiedParts(parts:{size:number;open:()=>Promise<ReadableStream<Uint8Array>>}[],expectedSize:number,sha256:string){
  if(parts.some(p=>!Number.isSafeInteger(p.size)||p.size<1||p.size>UPLOAD_PART_BYTES)||parts.reduce((sum,p)=>sum+p.size,0)!==expectedSize)throw Error('upload_parts_size_mismatch');
  async function* bytes(){const hash=createHash('sha256');let total=0;for(const part of parts){let size=0;const reader=(await part.open()).getReader();try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;total+=value.length;if(size>part.size||total>expectedSize)throw Error('upload_part_overflow');hash.update(value);yield value;}if(size!==part.size)throw Error('upload_part_truncated');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}if(hash.digest('hex')!==sha256)throw Error('upload_checksum_mismatch');}
  return Readable.toWeb(Readable.from(bytes())) as ReadableStream<Uint8Array>;
}
