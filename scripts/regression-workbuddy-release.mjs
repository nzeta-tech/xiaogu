// Tags: workbuddy:entry, workbuddy:attachments, spoken:quality-delivery.
// Synthetic browser fixtures supplement real authenticated API and persistence checks.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHmac} from 'node:crypto';
const require=createRequire(import.meta.url),{chromium}=require('playwright-core');
const production=process.argv.includes('--production');
const base=production?'https://xiaogu.nzeta.ai':'http://127.0.0.1:3119';
let fixture,pool,browser,count=0;
const check=(value,label)=>{assert.ok(value,label);count++;};
function remote(action,id=''){
  return JSON.parse(execFileSync('ssh',['-i',process.env.SPOKEN_TEST_SSH_KEY||'/Users/a2251/Downloads/router.pem','-o','BatchMode=yes','ubuntu@16.176.34.69',`docker exec -i -w /app insurance-content-agent-app-1 node - ${action} ${id}`],{input:readFileSync(new URL('./production-regression-fixture.cjs',import.meta.url)),encoding:'utf8',timeout:60000}));
}
try{
  if(production)fixture=remote('create');
  else{
    const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/paid_access_test');
    pool=new(require('pg').Pool)({connectionString:url.href});const id=randomUUID(),email=`workbuddy-release-${id}@example.invalid`;
    await pool.query("insert into users(id,name,email,password_hash,role,email_verified_at) values($1,'发布回归',$2,$3,'admin',now())",[id,email,randomUUID()]);fixture={id};
    await pool.query("insert into gift_records(user_id,source_type,quota_amount) values($1,'admin',1000)",[id]);
    const now=Math.floor(Date.now()/1000),enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
    const token=enc({alg:'HS256'})+'.'+enc({id,email,name:'发布回归',role:'admin',sessionVersion:1,iat:now,exp:now+3600});
    fixture.cookie='ica_session='+token+'.'+createHmac('sha256',process.env.AUTH_SECRET).update(token).digest('base64url');
  }
  browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'ica_session',value:fixture.cookie.slice('ica_session='.length),url:base}]);
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const overview=await context.request.get(base+'/api/workbench/overview');check(overview.ok(),'authenticated overview API');
  await page.route('**/api/workbench/overview',route=>route.fulfill({json:{overview:{topics:[{id:'synthetic-topic',title:'家庭资料整理方法',summary:'分类整理资料',source:'发布验收',sourceUrl:'https://example.com/topic',category:'生活',tab:'热点',heat:'高'}],topicsRefreshedAt:new Date().toISOString()}}}));
  await page.goto(base+'/');await page.waitForURL('**/workbuddy');
  const input=page.getByPlaceholder('输入你的想法，支持粘贴图片或添加文件…');await input.waitFor();
  check(await input.isVisible(),'root opens Workbuddy composer');
  await page.getByRole('button',{name:'家庭资料整理方法',exact:true}).click();
  // Hot-topic click must create a persisted conversation, not navigate to an app form.
  await page.waitForURL(/task=/,{timeout:120000});
  const taskId=new URL(page.url()).searchParams.get('task');check(Boolean(taskId),'topic opens a task');
  await page.reload();await page.locator('.wbHotSource').waitFor({timeout:60000});
  check((await page.locator('.wbHotSource').innerText()).includes('家庭资料整理方法'),'topic source survives fresh reload');
  const taskResponse=await context.request.get(base+'/api/workbuddy/tasks/'+taskId);
  check(taskResponse.ok(),'persisted task can be fetched');
  check(JSON.stringify(await taskResponse.json()).includes('家庭资料整理方法'),'persisted task contains source context');
  const cancelled=await context.request.patch(base+'/api/workbuddy/tasks/'+taskId,{data:{action:'cancel-task'}});
  check(cancelled.ok(),'isolated conversation cancelled before cleanup');
  await page.goto(base+'/workbuddy');await input.waitFor();
  await input.fill('保留已有草稿');await page.getByRole('button',{name:'家庭资料整理方法',exact:true}).click();
  check(await input.inputValue()==='保留已有草稿','topic selection preserves draft');
  await page.getByLabel('已引用资料').waitFor();check(true,'topic attached to existing draft');
  let uploads=0;
  await page.route('**/api/creation/import-text',async route=>{uploads++;await route.fulfill({json:{text:'合成图片验收文字'}});});
  await input.evaluate(element=>{
    const data=new DataTransfer();data.items.add(new File([new Uint8Array([137,80,78,71])],'synthetic.png',{type:'image/png'}));
    element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  });
  await page.getByLabel('已引用资料').getByText('synthetic.png',{exact:false}).waitFor();
  check(uploads===1,'clipboard image uploads exactly once');
  await page.getByRole('button',{name:/移除synthetic.png/}).click();
  check(await page.getByRole('button',{name:/移除synthetic.png/}).count()===0,'attachment removable');
  mkdirSync('tmp/release-ui',{recursive:true});
  for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    check(await input.isVisible(),name+' composer visible');
    check(await page.getByRole('button',{name:/小红书笔记创作/}).evaluate(element=>parseFloat(getComputedStyle(element).fontSize)>=11),name+' readable skill labels');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' no horizontal overflow');
    await page.screenshot({path:`tmp/release-ui/workbuddy-${name}.png`,fullPage:true});
  }
  await page.unroute('**/api/creation/import-text');
  const malformed=await context.request.post(base+'/api/creation/import-text',{multipart:{file:{name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('not an image')}}});
  check(malformed.status()===422,'real API rejects invalid image without fake success');
  check(errors.length===0,'no browser runtime errors');
  const anonymous=await browser.newContext();const anon=await anonymous.newPage();await anon.goto(base+'/');await anon.waitForURL(/\/login/);check(true,'anonymous home redirects to login');
  await anonymous.close();console.log(JSON.stringify({passed:true,production,assertions:count,syntheticBrowserFixtures:['topic','clipboard-extraction'],realChecks:['authenticated-api','topic-task-persistence','invalid-image','anonymous-auth']}));
}finally{
  await browser?.close();
  if(production&&fixture)remote('cleanup',fixture.id);
  if(pool){if(fixture)await pool.query('delete from users where id=$1',[fixture.id]);await pool.end();}
}
