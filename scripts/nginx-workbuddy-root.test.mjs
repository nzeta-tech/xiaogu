import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeRootThroughApplication} from './nginx-workbuddy-root.mjs';
const fallback='    location / {\n        proxy_pass http://127.0.0.1:3001;\n    }\n';
const prefix='server {\n    server_name xiaogu.nzeta.ai;\n';
test('root login override is removed without changing the application proxy',()=>{
  const root='    location = / {\n        return 302 https://xiaogu.nzeta.ai/login;\n    }\n\n';
  const result=routeRootThroughApplication(prefix+root+fallback+'}\n');
  assert.equal(result.removedOverrides,1);assert.equal(result.output,prefix+fallback+'}\n');
  assert.equal(routeRootThroughApplication(result.output).removedOverrides,0);
});
test('HTTP TLS guard remains in the fallback and only the root override is removed',()=>{
  const guard='        if ($http_x_forwarded_proto != "https") {\n            return 301 https://xiaogu.nzeta.ai$request_uri;\n        }\n\n';
  const root=`    location = / {\n${guard}        return 302 https://xiaogu.nzeta.ai/login;\n    }\n\n`;
  const proxy=fallback.replace('        proxy_pass',guard+'        proxy_pass');
  assert.equal(routeRootThroughApplication(prefix+root+proxy+'}\n').output,prefix+proxy+'}\n');
});
test('unreviewed hosts and root logic are rejected',()=>{
  assert.throws(()=>routeRootThroughApplication(prefix.replace('xiaogu.nzeta.ai','example.com')+fallback));
  assert.throws(()=>routeRootThroughApplication(prefix+'location = / { return 200; }\n'+fallback));
});
