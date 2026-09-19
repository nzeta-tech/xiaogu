import http from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, statfs, link, unlink, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
export function parseRange(value, size) {
  if (!value) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!m || (!m[1] && !m[2]) || size <= 0) return false;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size ? { start, end } : false;
}
export function createMediaServer({ root, token, maxBytes = DEFAULT_MAX_BYTES, reserveBytes = 512 * 1024 * 1024, maxUploads = 2 }) {
  if (!path.isAbsolute(root) || !token || token.length < 32) throw new Error('Absolute media root and a token of at least 32 characters are required');
  if (![maxBytes,reserveBytes,maxUploads].every(Number.isSafeInteger) || maxBytes<1 || reserveBytes<0 || maxUploads<1) throw new Error('Invalid media limits');
  let active = 0;
  const send = (res,status,error) => { res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error})); };
  const server = http.createServer(async (req,res) => {
    const actual=Buffer.from(req.headers.authorization||'');const expected=Buffer.from(`Bearer ${token}`);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){send(res,401,'unauthorized');return;}
    try {
      if(req.url==='/health' && req.method==='GET'){
        await access(root,constants.R_OK|constants.W_OK);const disk=await statfs(root);const available=Number(disk.bavail)*Number(disk.bsize);
        res.writeHead(available>reserveBytes+maxBytes?200:507,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ready:available>reserveBytes+maxBytes,activeUploads:active,maxBytes}));return;
      }
      const key=req.url?.slice('/objects/'.length);
      // Generated keys only; no query strings, URL escapes, dot segments or user paths.
      if(!req.url?.startsWith('/objects/')||!key||!/^[-a-zA-Z0-9]+\/\d{4}-\d{2}\/[a-f0-9-]{36}\.[a-z0-9]{2,5}$/.test(key)){send(res,400,'invalid_key');return;}
      const file=path.join(root,key);
      if(req.method==='PUT'){
        const length=req.headers['content-length']===undefined?null:Number(req.headers['content-length']);
        if(length!==null&&(!Number.isSafeInteger(length)||length<1)){send(res,400,'invalid_length');return;}
        if(length!==null&&length>maxBytes){send(res,413,'media_too_large');return;}
        if(active>=maxUploads){res.setHeader('retry-after','5');send(res,503,'upload_busy');return;}
        active++;
        const temporary=path.join(root,`.upload-${randomUUID()}`);
        try{
          const disk=await statfs(root);if(Number(disk.bavail)*Number(disk.bsize)<reserveBytes+maxBytes*active){send(res,507,'insufficient_storage');return;}
          let size=0;const hash=createHash('sha256');
          const meter=new Transform({transform(chunk,encoding,callback){size+=chunk.length;if(size>maxBytes){const e=new Error('media_too_large');e.status=413;callback(e);return;}hash.update(chunk);callback(null,chunk);}});
          // Do not let pipeline destroy IncomingMessage before a useful 413 can be sent.
          req.pipe(meter);
          const abort=()=>meter.destroy(new Error('upload_aborted'));req.once('aborted',abort);req.once('error',abort);
          try{await pipeline(meter,createWriteStream(temporary,{flags:'wx',mode:0o600,flush:true}));}finally{req.unpipe(meter);req.off('aborted',abort);req.off('error',abort);}
          if(!size||(length!==null&&size!==length)){send(res,400,'incomplete_upload');return;}
          await mkdir(path.dirname(file),{recursive:true});
          // Hard-link commit is atomic and refuses to overwrite an existing object.
          await link(temporary,file);
          res.writeHead(201,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({key,size,sha256:hash.digest('hex')}));
        }catch(error){if(!res.destroyed)send(res,error.status|| (error.code==='EEXIST'?409:error.code==='ENOSPC'?507:500),error.status===413?'media_too_large':'upload_failed');}
        finally{await unlink(temporary).catch(()=>{});active--;req.resume();}
        return;
      }
      if(req.method==='DELETE'){await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e});res.writeHead(204);res.end();return;}
      if(!['GET','HEAD'].includes(req.method)){send(res,405,'method_not_allowed');return;}
      const info=await stat(file);if(!info.isFile()){send(res,404,'not_found');return;}
      const range=parseRange(req.headers.range,info.size);
      const headers={'content-type':'application/octet-stream','accept-ranges':'bytes','cache-control':'private, no-store','x-content-type-options':'nosniff'};
      if(range===false){res.writeHead(416,{...headers,'content-range':`bytes */${info.size}`});res.end();return;}
      const start=range?.start??0,end=range?.end??info.size-1;
      headers['content-length']=String(end-start+1);if(range)headers['content-range']=`bytes ${start}-${end}/${info.size}`;
      res.writeHead(range?206:200,headers);
      if(req.method==='HEAD'){res.end();return;}
      await pipeline(createReadStream(file,{start,end}),res).catch(()=>{});
    }catch(error){if(!res.headersSent)send(res,error.code==='ENOENT'?404:503,error.code==='ENOENT'?'not_found':'media_unavailable');else res.destroy();}
  });
  server.requestTimeout=30*60*1000;server.headersTimeout=60000;
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const root=process.env.MEDIA_NODE_ROOT||'/data/media';
  await access(root,constants.R_OK|constants.W_OK); // Refuse an absent data directory; verify its mount on the host before startup.
  const server=createMediaServer({root,token:process.env.MEDIA_NODE_TOKEN,maxBytes:Number(process.env.MEDIA_MAX_BYTES||DEFAULT_MAX_BYTES),maxUploads:Number(process.env.MEDIA_MAX_UPLOADS||2)});
  server.listen(Number(process.env.PORT||3400),process.env.HOST||'127.0.0.1',()=>console.log('Media node ready'));
}
