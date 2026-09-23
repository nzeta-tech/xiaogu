// Tags: billing:completion, spoken:quality-delivery. Actual completion HTTP and DB re-fetch.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
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
  fixture('grant',f.id);
  for(const mode of ['missing-report','contradictory-pass','passed','advisory','single-failed','review-unavailable','multi-failed']){
    const task=fixture('quality-create',f.id);
    const singleIssue=mode==='single-failed'||mode==='review-unavailable';
    const multiFailed=mode==='multi-failed';
    const passed=mode==='passed'||mode==='advisory'||singleIssue;
    const review=multiFailed?[1,2].map(attempt=>({attempt,pass:false,issues:['字幕遮挡']})):[{attempt:1,pass:mode==='passed'||mode==='advisory'||mode==='contradictory-pass',issues:mode==='passed'||mode==='advisory'?[]:[mode==='review-unavailable'?'质检服务暂时不可用':'字幕遮挡'],...(mode==='advisory'?{warnings:['模板变化可以更丰富']}:{})}];
    const result={status:'completed',videoUrl:'https://example.invalid/synthetic.mp4',...(mode==='missing-report'?{}:{qualityReview:review})};
    const request=()=>fetch(base+`/api/internal/local-agent/tasks/${task.taskId}/complete`,{method:'POST',headers:{authorization:'Bearer '+f.agentToken,'content-type':'application/json'},body:JSON.stringify({...task,result}),signal:AbortSignal.timeout(30000)});
    check((await request()).ok,'completion acknowledged');
    check((await request()).status===409,'duplicate fenced by consumed lease');
    const row=fixture('quality-evidence',f.id).jobs.find(job=>job.id===task.jobId);
    check(row.status===(passed?'completed':'failed'),'durable job status');
    check(row.task_status===(passed?'succeeded':'failed'),'durable task status');
    check(row.has_video===passed,'failed delivery exposes no final URL');
    check(row.charges===(passed?1:0),'quality gate controls real charge trigger');
    if(!passed)check(row.error_message.includes('质检未通过'),'visible failure persisted');
    if(mode==='single-failed')check(row.reviews[0].issues[0]==='字幕遮挡','quality history persisted');
    if(mode==='advisory')check(row.reviews[0].warnings[0]==='模板变化可以更丰富','advisories survive durable reload');
    if(singleIssue){check(row.quality_passed===false,'single-review publication does not claim QA pass');check(row.delivery_notes[0]===review[0].issues[0],'unresolved issues persist');}
    if(mode==='single-failed'||mode==='advisory'||singleIssue){
      const {chromium}=createRequire(import.meta.url)('playwright-core');
      const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
      try{
        const context=await browser.newContext();context.setDefaultTimeout(30000);await context.addCookies([{name:'ica_session',value:f.cookie.slice('ica_session='.length),url:base}]);
        const page=await context.newPage();await page.goto(base+'/apps/digital-human-video');
        await page.getByRole('button',{name:/我的作品/}).click();
        const target=()=>singleIssue?page.getByText('已发布 · 质检仍有待改进项').last():mode==='advisory'?page.getByText('画面优化建议（不影响交付）'):page.getByRole('alert').filter({hasText:'字幕遮挡'});
        await target().waitFor();
        check(true,'actual spoken version page displays quality failure');
        await page.reload();await page.getByRole('button',{name:/我的作品/}).click();
        await target().waitFor();check(true,'quality result survives reload');
        if(singleIssue){await page.getByText(review[0].issues[0],{exact:true}).last().waitFor();check(true,'unresolved QA text visible after reload');}
        if(mode==='advisory'){
          await target().click();await page.getByText('模板变化可以更丰富').waitFor();check(true,'advisory text is visible');
          await page.setViewportSize({width:390,height:844});
          check(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'mobile has no horizontal overflow');
        }
      }finally{await browser.close();}
    }
  }
  for(const mode of ['passed','single-failed','contradictory-pass']){
    const task=fixture('quality-version-create',f.id);
    const successful=mode!=='contradictory-pass';
    const qualityReview=[{attempt:1,pass:mode!=='single-failed',issues:mode==='passed'?[]:['字幕遮挡']}];
    const response=await fetch(base+`/api/internal/local-agent/tasks/${task.taskId}/complete`,{method:'POST',headers:{authorization:'Bearer '+f.agentToken,'content-type':'application/json'},body:JSON.stringify({...task,result:{status:'completed',videoUrl:'https://example.invalid/revision.mp4',qualityReview}}),signal:AbortSignal.timeout(30000)});
    check(response.ok,`${mode} revision completion acknowledged`);
    const rows=fixture('quality-evidence',f.id).jobs;
    const root=rows.find(job=>job.id===task.rootJobId);
    check(root.selected_version_id===(successful?task.jobId:null),`${mode} only delivered version becomes current`);
  }
  console.log(JSON.stringify({passed:true,production,assertions:count,paidProviderCalls:0}));
}finally{fixture('cleanup',f.id);}
