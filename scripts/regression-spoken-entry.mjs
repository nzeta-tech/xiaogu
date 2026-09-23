// tags: spoken:entry, apps:visibility
// Runs a real Chrome against a compiled production candidate or the public site.
// Isolated accounts only; no generation/payment/provider requests are submitted.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHmac } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const production = process.argv.includes('--production');
const base = production ? 'https://xiaogu.nzeta.ai' : 'http://127.0.0.1:3119';
let pool, fixture, browser, count = 0;
const check = (value, label) => { assert.ok(value, label); count++; };
function remote(action, id = '') {
  return JSON.parse(execFileSync('ssh', ['-i', process.env.SPOKEN_TEST_SSH_KEY || '/Users/a2251/Downloads/router.pem', '-o', 'BatchMode=yes', 'ubuntu@16.176.34.69', `docker exec -i -w /app insurance-content-agent-app-1 node - ${action} ${id}`], { input: readFileSync(new URL('./production-regression-fixture.cjs', import.meta.url)), encoding: 'utf8', timeout: 60000 }));
}
try {
  if (production) fixture = remote('create');
  else {
    const u = new URL(process.env.DATABASE_URL);
    assert.equal(u.hostname, '127.0.0.1'); assert.equal(u.pathname, '/paid_access_test');
    pool = new (require('pg').Pool)({connectionString: u.href});
    const id = randomUUID(), email = `spoken-entry-${id}@example.invalid`;
    await pool.query("insert into users(id,name,email,password_hash,role,email_verified_at) values($1,'入口回归',$2,$3,'user',now())", [id,email,randomUUID()]);
    fixture = {id};
    await pool.query("insert into gift_records(user_id,source_type,quota_amount) values($1,'admin',1000)", [id]);
    const now = Math.floor(Date.now()/1000), enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    const token = enc({alg:'HS256'})+'.'+enc({id,email,name:'入口回归',role:'user',sessionVersion:1,iat:now,exp:now+1800});
    fixture.cookie = 'ica_session='+token+'.'+createHmac('sha256',process.env.AUTH_SECRET).update(token).digest('base64url');
  }
  browser = await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'ica_session',value:fixture.cookie.slice('ica_session='.length),url:base}]);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const api = async path => { const r = await context.request.get(base+path); check(r.status()===200,'GET '+path); return r.json(); };
  let hub = await api('/api/creation/hub');
  check(hub.apps.some(a=>a.slug==='digital-human-video' && a.accessPolicy==='paid_customer'),'hub exposes paid spoken app');
  check(!hub.apps.some(a=>a.slug==='write-copy'),'deferred application remains hidden');
  let access = await api('/api/billing/access-status?app=digital-human-video');
  check(access.eligible===false,'gift credits alone do not unlock');
  await page.goto(base+'/create');
  const card = page.locator('article.workspaceHubCard').filter({has:page.getByText('口播视频生成',{exact:true})});
  await card.waitFor(); check(await card.isVisible(),'all applications card visible');
  check((await card.innerText()).includes('50 起 积分 · 口播视频'),'correct price and output');
  check((await card.innerText()).includes('充值用户专享'),'paid badge');
  await page.getByRole('button',{name:'短视频 & 直播'}).click();
  check(await card.isVisible(),'video category shows card');
  await page.getByRole('searchbox').fill('口播视频');
  check(await card.isVisible(),'search shows card');
  await page.getByRole('searchbox').fill('no-matching-spoken-tool-xyz');
  check(await card.count()===0,'nonmatching search hides card');
  await page.getByRole('searchbox').fill('口播视频');
  await card.getByRole('link',{name:'使用'}).click();
  await page.waitForURL('**/apps/digital-human-video?**');
  await page.getByRole('heading',{name:'口播视频生成',exact:true}).waitFor();
  check(true,'card opens released application');
  await page.getByRole('link',{name:/去充值解锁/}).waitFor();
  check(true,'noneligible user receives recharge notice');
  const denied = await context.request.post(base+'/api/digital-human-videos',{data:{}});
  check(denied.status()===403,'generation remains denied without entitlement');
  if (production) remote('grant',fixture.id);
  else await pool.query("insert into exclusive_app_access_overrides(user_id,mode,reason) values($1,'granted','Isolated entry regression')",[fixture.id]);
  await page.reload();
  await page.getByText('充值用户专享 · 已解锁',{exact:true}).waitFor();
  check(true,'granted access survives reload');
  await page.getByRole('heading',{name:'选择口播照片',exact:true}).waitFor();
  await page.getByRole('heading',{name:'选择声音',exact:true}).waitFor();
  check(true,'photo and voice form visible');
  await api('/api/digital-human-videos'); await api('/api/spoken-photos'); await api('/api/spoken-voices');
  await page.getByRole('button',{name:/智能版/}).click();
  check((await page.getByRole('button',{name:/智能版/}).getAttribute('aria-pressed'))==='true','smart mode selectable');
  check((await page.locator('body').innerText()).includes('100 积分 / 条 · 成功后扣除'),'smart price displayed');
  await page.goto(base+'/create'); await card.waitFor();
  await page.reload(); await card.waitFor();
  check(await card.isVisible(),'hub entry survives reload after grant');
  check(errors.length===0,'no browser runtime errors');
  const anonymous = await browser.newContext();
  const deniedApi = await anonymous.request.get(base+'/api/creation/hub');
  check(deniedApi.status()===401,'anonymous hub API denied');
  const anonPage = await anonymous.newPage();
  await anonPage.goto(base+'/apps/digital-human-video');
  await anonPage.waitForURL('**/login?**');
  check(true,'anonymous app opens login instead of 404');
  console.log(JSON.stringify({passed:true,assertions:count,environment:production?'production':'compiled-production-candidate',browser:'Chrome headless',tags:['spoken:entry','apps:visibility']}));
} finally {
  if (browser) await browser.close();
  if (fixture) {
    if (production) remote('cleanup',fixture.id);
    else await pool.query('delete from users where id=$1',[fixture.id]);
  }
  if (pool) await pool.end();
}
