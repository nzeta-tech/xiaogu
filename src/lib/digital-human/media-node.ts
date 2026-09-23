export const MEDIA_MAX_BYTES = 500 * 1024 * 1024;
export class MediaNodeError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}
export function mediaNodeConfig() {
  const endpoint = process.env.MEDIA_NODE_URL?.trim();
  if (!endpoint) return null;
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new MediaNodeError('媒体节点地址配置无效');
  const token = process.env.MEDIA_NODE_TOKEN;
  const id = process.env.MEDIA_NODE_ID;
  if (!token || token.length < 32 || !id) throw new MediaNodeError('媒体节点鉴权或标识尚未配置');
  return { endpoint: url.origin, token, id };
}
async function objectRequest(key: string, init: RequestInit & { duplex?: 'half' } = {}) {
  const config = mediaNodeConfig();
  if (!config) throw new MediaNodeError('媒体节点尚未配置');
  if (!/^[-a-zA-Z0-9]+\/\d{4}-\d{2}\/[a-f0-9-]{36}\.[a-z0-9]{2,5}$/.test(key)) throw new MediaNodeError('媒体路径无效', 400);
  const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${config.token}`);
  try { return await fetch(`${config.endpoint}/objects/${key}`, { ...init, headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30 * 60 * 1000) }); }
  catch { throw new MediaNodeError('媒体节点暂时不可用，请稍后重试'); }
}
export async function uploadMediaObject(key: string, body: BodyInit, size: number) {
  if (!Number.isSafeInteger(size) || size < 0) throw new MediaNodeError('媒体大小无效',400);
  if (size > MEDIA_MAX_BYTES) throw new MediaNodeError('媒体文件不能超过 500 MB',413);
  const headers: Record<string,string> = {};
  if (size) headers['content-length'] = String(size);
  const response = await objectRequest(key,{ method:'PUT',body,headers,duplex:'half' });
  if (!response.ok) { await response.body?.cancel(); throw new MediaNodeError(response.status===413?'媒体文件不能超过 500 MB':response.status===507?'媒体磁盘空间不足':'媒体上传失败，请稍后重试',[413,507].includes(response.status)?response.status:503); }
  const result = await response.json() as {key:string;size:number;sha256:string};
  if (result.key!==key || !Number.isSafeInteger(result.size) || result.size<1 || result.size>MEDIA_MAX_BYTES || (size>0&&size!==result.size) || !/^[a-f0-9]{64}$/.test(result.sha256)) throw new MediaNodeError('媒体上传校验失败');
  return result;
}
export async function fetchMediaObject(key: string, range?: string | null) {
  const response=await objectRequest(key,{headers:range?{range}:undefined});
  if (![200,206,416].includes(response.status)) {await response.body?.cancel();throw new MediaNodeError(response.status===404?'媒体文件不存在':'媒体节点暂时不可用',response.status===404?404:503);}
  return response;
}
export async function removeMediaObject(key: string) { const response=await objectRequest(key,{method:'DELETE'});if(!response.ok)throw new MediaNodeError('媒体临时文件清理失败'); }
