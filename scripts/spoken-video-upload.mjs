import { execFile } from 'node:child_process';

export function originUploadConfig({url,origin,token,file,size,contentType,name}) {
  const target=new URL(url);
  if(target.protocol!=='https:'||target.username||target.password)throw Error('Media upload requires authenticated HTTPS');
  if(!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(origin))throw Error('Invalid media upload origin hostname');
  const quote=value=>{const text=String(value);if(/[\r\n\0]/.test(text))throw Error('Invalid media upload header');return '"'+text.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';};
  return [
    'url = '+quote(target.href),
    'connect-to = '+quote(`${target.hostname}:${target.port||443}:${origin}:443`),
    'header = '+quote('authorization: Bearer '+token),
    'header = '+quote('content-type: '+contentType),
    'header = '+quote('content-length: '+size),
    'header = '+quote('x-xiaogu-filename: '+encodeURIComponent(name)),
    'upload-file = '+quote(file),
  ].join('\n')+'\n';
}

// Connect only media PUTs to the configured origin. TLS still verifies the public
// service hostname; credentials stay on stdin, never argv. No redirects or retries.
export async function uploadVideoToOrigin(input) {
  const config=originUploadConfig(input);
  return new Promise((resolve,reject)=>{
    const child=execFile('/usr/bin/curl',['-q','--silent','--show-error','--noproxy','*','--proto','=https','--connect-timeout','20','--max-time','1200','--request','PUT','--write-out','\n%{http_code}','--config','-'],{timeout:1210000,maxBuffer:1024*1024},(error,stdout)=>{
      if(error)return reject(new Error('Media origin upload transport failed'));
      const split=stdout.lastIndexOf('\n'),status=Number(stdout.slice(split+1));
      if(status<200||status>=300)return reject(new Error(`成片上传失败（${status||'网络异常'}）`));
      try{resolve(JSON.parse(stdout.slice(0,split)));}catch{reject(new Error('Media origin upload returned invalid JSON'));}
    });
    child.stdin.on('error',()=>{});child.stdin.end(config);
  });
}
