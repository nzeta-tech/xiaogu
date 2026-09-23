import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function routeRootThroughApplication(source) {
  const hosts=[...source.matchAll(/server_name\s+([^;]+);/g)].map(match=>match[1]);
  assert(hosts.length>0&&hosts.every(host=>host==='xiaogu.nzeta.ai'),'Only the Xiaogu virtual host may be patched');
  assert(source.includes('proxy_pass http://127.0.0.1:3001;'),'Application fallback proxy is required');
  const guard='        if ($http_x_forwarded_proto != "https") {\n            return 301 https://xiaogu.nzeta.ai$request_uri;\n        }\n\n';
  let output=source,count=0;
  for(const prefix of [guard,'']) {
    const block=`    location = / {\n${prefix}        return 302 https://xiaogu.nzeta.ai/login;\n    }\n\n`;
    while(output.includes(block)){output=output.replace(block,'');count++;}
  }
  assert(count<=2,'Unexpected duplicate root locations');
  assert(!/location\s*=\s*\/\s*\{/.test(output),'Unknown root override must be reviewed manually');
  return {output,removedOverrides:count};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [source,destination]=process.argv.slice(2);assert(source&&destination,'Source and output paths required');
  const result=routeRootThroughApplication(readFileSync(source,'utf8'));writeFileSync(destination,result.output,{mode:0o600});
  console.log(JSON.stringify({removedOverrides:result.removedOverrides}));
}
