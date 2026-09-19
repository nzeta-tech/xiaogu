// Tags: billing:completion, spoken:quality-delivery. Actual completion HTTP and DB re-fetch.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const production=process.argv.includes('--production');
const base=production?'https://xiaogu.nzeta.ai':'http://127.0.0.1:3119';
if(!production){const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/paid_access_test');}
const code=readFileSync(new URL('./production-regression-fixture.cjs',import.meta.url));
function fixture(action,id=''){
  const options={input:code,encoding:'utf8',timeout:60000};
  return JSON.parse(production?execFileSync('ssh',['-i',process.env.SPOKEN_TEST_SSH_KEY||'/Users/a2251/Downloads/router.pem','-o','BatchMode=yes','ubuntu@16.176.34.69',`docker exec -i -w /app insurance-content-agent-app-1 node - ${action} ${id}`],options):execFileSync(process.execPath,['-',action,id],{...options,env:{...process.env,XIAOGU_FIXTURE_PACKAGE:new URL('../package.json',import.meta.url).pathname}}));
}
let count=0;const check=(v,label)=>{assert.ok(v,label);count++;};
const f=fixture('create');
try{
  for(const mode of ['failed-quality','missing-report','passed']){
    const task=fixture('quality-create',f.id);
    const review=[{attempt:1,pass:mode==='passed',issues:mode==='passed'?[]:['字幕遮挡']}];
    const result={status:'completed',videoUrl:'https://example.invalid/synthetic.mp4',...(mode==='missing-report'?{}:{qualityReview:review})};
    const request=()=>fetch(base+`/api/internal/local-agent/tasks/${task.taskId}/complete`,{method:'POST',headers:{authorization:'Bearer '+f.agentToken,'content-type':'application/json'},body:JSON.stringify({...task,result}),signal:AbortSignal.timeout(30000)});
    check((await request()).ok,'completion acknowledged');
    check((await request()).status===409,'duplicate fenced by consumed lease');
    const row=fixture('quality-evidence',f.id).jobs.find(job=>job.id===task.jobId);
    const passed=mode==='passed';
    check(row.status===(passed?'completed':'failed'),'durable job status');
    check(row.task_status===(passed?'succeeded':'failed'),'durable task status');
    check(row.has_video===passed,'failed delivery exposes no final URL');
    check(row.charges===(passed?1:0),'quality gate controls real charge trigger');
    if(!passed)check(row.error_message.includes('质检未通过'),'visible failure persisted');
    if(mode==='failed-quality')check(row.reviews[0].issues[0]==='字幕遮挡','quality history persisted');
  }
  console.log(JSON.stringify({passed:true,production,assertions:count,paidProviderCalls:0}));
}finally{fixture('cleanup',f.id);}
