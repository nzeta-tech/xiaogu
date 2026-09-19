import { MEDIA_MAX_BYTES, MediaNodeError, mediaNodeConfig, uploadMediaObject, fetchMediaObject } from "./media-node.ts";
import { createHash, randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, open, rename, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { query } from "@/lib/db/client";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { decryptSettingSecret } from "@/lib/security/secrets";

type MediaKind = "source" | "preview" | "presenter_master" | "output" | "voice_source" | "input_photo" | "cover" | "spoken_photo" | "voice_recording";
type MediaRow = { id: string; user_id: string; storage_provider: "database" | "s3" | "local_disk"; storage_key: string | null; storage_node_id: string | null; content_type: string; original_filename: string; size_bytes: number; file_data: Buffer | null };

function localStorageRoot(settings: Awaited<ReturnType<typeof tryGetSystemSettings>>) {
  const configured = process.env.DIGITAL_HUMAN_LOCAL_STORAGE_DIR?.trim() || settings.digitalHuman.localDiskPath;
  return path.resolve(configured);
}

function localDiskEnabled(settings: Awaited<ReturnType<typeof tryGetSystemSettings>>) {
  return settings.digitalHuman.localDiskEnabled || (process.env.NODE_ENV === "development" && Boolean(process.env.DIGITAL_HUMAN_LOCAL_STORAGE_DIR?.trim()));
}

function safeLocalPath(root: string, key: string) {
  if (!/^[a-zA-Z0-9/_-]+\.[a-z0-9]{2,5}$/.test(key)) throw new Error("媒体文件路径无效");
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("媒体文件路径越界");
  return resolved;
}

async function ensureLocalCapacity(root: string, expectedBytes: number, maxGb: number) {
  await mkdir(root, { recursive: true });
  const disk = await statfs(root);
  const free = Number(disk.bavail) * Number(disk.bsize);
  if (free < expectedBytes + 512 * 1024 * 1024) throw new Error("媒体磁盘剩余空间不足，请联系管理员清理或扩容");
  if (expectedBytes > maxGb * 1024 * 1024 * 1024) throw new Error("媒体文件超过本地磁盘策略上限");
}

function localKey(userId: string, extension: string) {
  return `${userId}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${extension}`;
}

async function storeOnMediaNode(input: { userId: string; digitalHumanId?: string; videoJobId?: string; kind: MediaKind; contentType: string; fileName: string; sourceUrl?: string }, body: BodyInit, size: number) {
  const config = mediaNodeConfig()!;
  const key = localKey(input.userId, safeExtension(input.fileName, input.contentType));
  const uploaded = await uploadMediaObject(key, body, size);
  try {
    const result = await query<{id:string}>(`insert into digital_human_media_assets(user_id,digital_human_id,video_job_id,kind,storage_provider,storage_key,storage_node_id,content_type,original_filename,size_bytes,sha256,source_url,file_data)
      values($1,$2,$3,$4,'local_disk',$5,$6,$7,$8,$9,$10,$11,null)
      on conflict(video_job_id,kind) do update set storage_provider='local_disk',storage_key=excluded.storage_key,storage_node_id=excluded.storage_node_id,content_type=excluded.content_type,original_filename=excluded.original_filename,size_bytes=excluded.size_bytes,sha256=excluded.sha256,source_url=excluded.source_url,file_data=null returning id`,
      [input.userId,input.digitalHumanId||null,input.videoJobId||null,input.kind,key,config.id,input.contentType,input.fileName.slice(0,240),uploaded.size,uploaded.sha256,input.sourceUrl||null]);
    return {id:result.rows[0].id,url:`/api/digital-human-media/${result.rows[0].id}`,size:uploaded.size};
  } catch(error) {
    // A lost DB response may follow a committed write. Retain the immutable
    // object until an offline orphan audit proves it is unreferenced.
    throw error;
  }
}

export async function storeDigitalHumanMedia(input: { userId: string; digitalHumanId?: string; videoJobId?: string; kind: MediaKind; bytes: Buffer; contentType: string; fileName: string; sourceUrl?: string }) {
  if (!input.bytes.length) throw new Error("素材文件为空");
  if (input.bytes.length > MEDIA_MAX_BYTES) throw new MediaNodeError("媒体文件不能超过 500 MB",413);
  if (mediaNodeConfig()) return (await storeOnMediaNode(input, input.bytes as BodyInit, input.bytes.length)).id;
  const settings = await tryGetSystemSettings();
  const useLocal = localDiskEnabled(settings);
  const useS3 = Boolean(settings.backup.s3Enabled && settings.backup.s3Bucket && settings.backup.s3AccessKeyId && settings.backup.s3SecretEncrypted);
  if (!useLocal && !useS3 && !settings.digitalHuman.databaseFallbackEnabled) throw new Error("媒体存储尚未配置，请联系管理员");
  const databaseLimit = settings.digitalHuman.databaseMaxFileMb * 1024 * 1024;
  if (!useLocal && !useS3 && input.bytes.length > databaseLimit) throw new Error(`素材超过数据库临时存储上限（${settings.digitalHuman.databaseMaxFileMb} MB），请联系管理员配置媒体磁盘或对象存储`);
  const extension = safeExtension(input.fileName, input.contentType);
  const provider = useLocal ? "local_disk" : useS3 ? "s3" : "database";
  const key = useLocal ? localKey(input.userId, extension) : useS3 ? `${(process.env.DIGITAL_HUMAN_S3_PREFIX || "digital-humans").replace(/^\/+|\/+$/g, "")}/${input.userId}/${randomUUID()}.${extension}` : null;
  if (useLocal && key) { const root=localStorageRoot(settings); await ensureLocalCapacity(root,input.bytes.length,settings.digitalHuman.localDiskMaxGb); const target=safeLocalPath(root,key); await mkdir(path.dirname(target),{recursive:true}); const temporary=`${target}.part`; await writeFile(temporary,input.bytes,{flag:"wx"}); await rename(temporary,target); }
  else if (useS3 && key) await client(settings).send(new PutObjectCommand({ Bucket: settings.backup.s3Bucket, Key: key, Body: input.bytes, ContentType: input.contentType, CacheControl: "private, max-age=300" }));
  const row = await query<{ id: string }>(`insert into digital_human_media_assets(user_id,digital_human_id,video_job_id,kind,storage_provider,storage_key,storage_node_id,content_type,original_filename,size_bytes,sha256,source_url,file_data)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    on conflict(video_job_id,kind) do update set storage_provider=excluded.storage_provider,storage_key=excluded.storage_key,storage_node_id=excluded.storage_node_id,content_type=excluded.content_type,original_filename=excluded.original_filename,size_bytes=excluded.size_bytes,sha256=excluded.sha256,source_url=excluded.source_url,file_data=excluded.file_data
    returning id`, [input.userId,input.digitalHumanId||null,input.videoJobId||null,input.kind,provider,key,useLocal?settings.digitalHuman.localDiskNodeId:null,input.contentType,input.fileName.slice(0,240),input.bytes.length,createHash("sha256").update(input.bytes).digest("hex"),input.sourceUrl||null,provider==="database"?input.bytes:null]);
  return row.rows[0].id;
}

export async function storeDigitalHumanMediaStream(input: { userId: string; digitalHumanId?: string; videoJobId: string; kind: "presenter_master" | "output" | "cover"; body: ReadableStream<Uint8Array>; contentLength: number; contentType: string; fileName: string; sourceUrl?: string }) {
  if (input.contentLength > MEDIA_MAX_BYTES) throw new MediaNodeError("媒体文件不能超过 500 MB",413);
  if (mediaNodeConfig()) return storeOnMediaNode(input,input.body,input.contentLength);
  const settings = await tryGetSystemSettings();
  if (!localDiskEnabled(settings)) throw new Error("服务器媒体磁盘尚未启用");
  const root = localStorageRoot(settings);
  await ensureLocalCapacity(root, Math.max(0,input.contentLength), settings.digitalHuman.localDiskMaxGb);
  const extension=safeExtension(input.fileName,input.contentType); const key=localKey(input.userId,extension); const target=safeLocalPath(root,key); const temporary=`${target}.part`;
  await mkdir(path.dirname(target),{recursive:true});
  let size=0; const hash=createHash("sha256"); const meter=new Transform({transform(chunk,_encoding,callback){size+=chunk.length;if(size>MEDIA_MAX_BYTES)return callback(new MediaNodeError("媒体文件不能超过 500 MB",413));hash.update(chunk);callback(null,chunk)}});
  try {
    const handle=await open(temporary,"wx");
    try { await pipeline(Readable.fromWeb(input.body as never),meter,handle.createWriteStream()); } finally { await handle.close().catch(()=>undefined); }
    if(!size)throw new Error("上传的媒体文件为空");
    if(input.contentLength>0&&size!==input.contentLength)throw new Error(`媒体上传不完整：预期 ${input.contentLength} 字节，实际 ${size} 字节`);
    await rename(temporary,target);
    const row=await query<{id:string}>(`insert into digital_human_media_assets(user_id,digital_human_id,video_job_id,kind,storage_provider,storage_key,storage_node_id,content_type,original_filename,size_bytes,sha256,source_url,file_data)
      values($1,$2,$3,$4,'local_disk',$5,$6,$7,$8,$9,$10,$11,null)
      on conflict(video_job_id,kind) do update set storage_provider='local_disk',storage_key=excluded.storage_key,storage_node_id=excluded.storage_node_id,content_type=excluded.content_type,original_filename=excluded.original_filename,size_bytes=excluded.size_bytes,sha256=excluded.sha256,source_url=excluded.source_url,file_data=null
      returning id`,[input.userId,input.digitalHumanId||null,input.videoJobId,input.kind,key,settings.digitalHuman.localDiskNodeId,input.contentType,input.fileName.slice(0,240),size,hash.digest("hex"),input.sourceUrl||null]);
    return {id:row.rows[0].id,url:`/api/digital-human-media/${row.rows[0].id}`,size};
  } catch(error) { await unlink(temporary).catch(()=>undefined); throw error; }
}

export async function archiveRemoteVideo(input: { userId: string; digitalHumanId: string; videoJobId: string; url: string; title: string }) {
  const existing = await query<{ id: string }>(`select id from digital_human_media_assets where video_job_id=$1 and kind='output'`, [input.videoJobId]);
  if (existing.rows[0]) return `/api/digital-human-media/${existing.rows[0].id}`;
  const response = await fetch(input.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error("成片归档下载失败");
  const declared = Number(response.headers.get("content-length") || 0); if (declared > 500*1024*1024) throw new Error("成片超过归档上限");
  if (mediaNodeConfig()) {
    if (!response.body) throw new Error("成片归档内容为空");
    const result = await storeOnMediaNode({ ...input,kind:"output",contentType:response.headers.get("content-type")?.split(";")[0]||"video/mp4",fileName:`${input.title||"video"}.mp4`,sourceUrl:input.url },response.body,declared);
    return result.url;
  }
  const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > 500*1024*1024) throw new Error("成片超过归档上限");
  const id = await storeDigitalHumanMedia({ ...input, kind:"output", bytes, contentType: response.headers.get("content-type")?.split(";")[0] || "video/mp4", fileName:`${input.title || "video"}.mp4`, sourceUrl:input.url });
  return `/api/digital-human-media/${id}`;
}

export async function readDigitalHumanMedia(userId: string, id: string) {
  const result=await query<MediaRow>(`select id,user_id,storage_provider,storage_key,storage_node_id,content_type,original_filename,size_bytes,file_data from digital_human_media_assets where id=$1 and user_id=$2`,[id,userId]); const row=result.rows[0]; if(!row)return null;
  const gateway=mediaNodeConfig();
  if(row.storage_provider==="local_disk" && gateway) {
    if(!row.storage_key || row.storage_node_id!==gateway.id) throw new MediaNodeError("此媒体尚未迁移到当前媒体节点",503);
    return {row,remoteKey:row.storage_key};
  }
  if(row.storage_provider==="database") return { row, bytes: Buffer.from(row.file_data||[]) };
  if(row.storage_provider==="local_disk"){if(!row.storage_key)return null;const settings=await tryGetSystemSettings();if(row.storage_node_id&&row.storage_node_id!==settings.digitalHuman.localDiskNodeId)return null;const filePath=safeLocalPath(localStorageRoot(settings),row.storage_key);await stat(filePath).catch(()=>{throw new Error("媒体文件已不在当前存储节点")});return {row,filePath};}
  if(!row.storage_key)return null; const settings=await tryGetSystemSettings(); const object=await client(settings).send(new GetObjectCommand({Bucket:settings.backup.s3Bucket,Key:row.storage_key})); if(!object.Body)return null;
  return { row, bytes:Buffer.from(await object.Body.transformToByteArray()) };
}
export async function readDigitalHumanSource(userId:string,digitalHumanId:string){
  const result=await query<MediaRow>(`select id,user_id,storage_provider,storage_key,storage_node_id,content_type,original_filename,size_bytes,file_data from digital_human_media_assets where user_id=$1 and digital_human_id=$2 and kind='source' order by created_at desc limit 1`,[userId,digitalHumanId]); const row=result.rows[0]; if(!row)return null;
  const gateway=mediaNodeConfig();
  if(row.storage_provider==="local_disk" && gateway){
    if(!row.storage_key || row.storage_node_id!==gateway.id) throw new MediaNodeError("此媒体尚未迁移到当前媒体节点",503);
    const response=await fetchMediaObject(row.storage_key);
    return {row,bytes:Buffer.from(await response.arrayBuffer())};
  }
  if(row.storage_provider==="database")return {row,bytes:Buffer.from(row.file_data||[])};
  if(row.storage_provider==="local_disk"){if(!row.storage_key)return null;const settings=await tryGetSystemSettings();if(row.storage_node_id&&row.storage_node_id!==settings.digitalHuman.localDiskNodeId)return null;return {row,bytes:await import("node:fs/promises").then(fs=>fs.readFile(safeLocalPath(localStorageRoot(settings),row.storage_key!)))};}
  if(!row.storage_key)return null; const settings=await tryGetSystemSettings(); const object=await client(settings).send(new GetObjectCommand({Bucket:settings.backup.s3Bucket,Key:row.storage_key})); if(!object.Body)return null; return {row,bytes:Buffer.from(await object.Body.transformToByteArray())};
}
function client(settings:Awaited<ReturnType<typeof tryGetSystemSettings>>){return new S3Client({region:settings.backup.s3Region||"auto",endpoint:settings.backup.s3Endpoint||undefined,forcePathStyle:settings.backup.s3ForcePathStyle,credentials:{accessKeyId:settings.backup.s3AccessKeyId,secretAccessKey:decryptSettingSecret(settings.backup.s3SecretEncrypted)}})}
function safeExtension(name:string,type:string){const found=name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1]; if(found)return found; return type.includes("webm")?"webm":type.includes("quicktime")?"mov":type.includes("png")?"png":type.includes("jpeg")?"jpg":"mp4"}
