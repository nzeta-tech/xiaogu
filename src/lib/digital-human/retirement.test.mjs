// Retired provider must never create new resources or synthesize speech.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const state = { authenticated: true, writes: 0, requests: [], voices: [] };
globalThis.__retirementFixture = state;
const fixture = `const state=globalThis.__retirementFixture;`;
const modules = {
  '@/lib/db/repositories': `export async function tryGetSystemSettings(){return {digitalHuman:{enabled:true,heygenEnabled:true,chanjingEnabled:true}}} export async function tryGetCreationAppBySlug(){return {points:50}}`,
  '@/lib/auth/session': fixture + `export async function requireSessionUser(){return state.authenticated?{id:'00000000-0000-4000-8000-000000000001'}:Response.json({}, {status:401})}`,
  '@/lib/digital-human/store': fixture + `export async function listCreatorVoices(){return state.voices} export async function savePublicVoice(input){state.writes++;return {id:'favorite',...input}} export async function getDigitalHumanAsset(){return {id:'00000000-0000-4000-8000-000000000002',provider:'chanjing',provider_avatar_id:'legacy',metadata_json:{},status:'ready'}} ` + ['insertCreatorVoice','removePublicVoiceFavorite','updateCreatorVoice','archiveDigitalHumanAsset','insertDigitalHumanAsset','listCreatingEditionBindings','listDigitalHumanAssets','updateDigitalHumanAsset','updateEditionBindingStatus','upsertDigitalHumanEditionBinding','getDigitalHumanVideoJob','insertDigitalHumanVideoJob','insertSpokenVideoJob','listTemplateFavorites','listDigitalHumanVideoJobs','listReadyDigitalHumanBindings','updateDigitalHumanVideoJob'].map(name=>`export async function ${name}(){state.writes++;throw new Error('Unexpected persistence: ${name}')}`).join('\n'),
  '@/lib/digital-human/media-assets': `export async function readDigitalHumanSource(){throw new Error('Unexpected media read')} export async function storeDigitalHumanMedia(){throw new Error('Unexpected upload')} export async function archiveRemoteVideo(){throw new Error('Unexpected archive')}`,
  '@/lib/billing/enforce': `export async function requireQuota(){return {ok:true,quotaCost:50}}`,
  '@/lib/local-agent/repository': ['enqueueLocalAgentTask','getHeygenAgentAvailability','getSpokenVideoAgentAvailability','getSpokenVoiceAgentAvailability'].map(name=>`export async function ${name}(){throw new Error('Unexpected worker call')}`).join('\n'),
  '@/lib/local-agent/auth': fixture + `export function requireLocalAgent(){return state.authenticated?null:Response.json({}, {status:401})}`,
  '@/lib/db/client': `export function getPool(){throw new Error('Unexpected pool')} export async function query(){throw new Error('Unexpected database query')}`,
};
registerHooks({ resolve(specifier, context, next) {
  if (modules[specifier]) return {url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true};
  if (specifier.startsWith('@/')) return {url:pathToFileURL(path.join(process.cwd(),'src',specifier.slice(2)+'.ts')).href,shortCircuit:true};
  return next(specifier,context);
}});
const providers = await import('./providers.ts');
const avatars = await import('../../app/api/avatar/digital-humans/route.ts');
const generated = await import('../../app/api/avatar/generated-digital-humans/route.ts');
const videos = await import('../../app/api/digital-human-videos/route.ts');
const resources = await import('../../app/api/digital-human-resources/route.ts');
const spoken = await import('../../app/api/spoken-voices/route.ts');
const audio = await import('../../app/api/internal/local-agent/digital-human/voice-audio/route.ts');
const preview = await import('../../app/api/avatar/digital-human-voice-preview/route.ts');
const originalFetch=globalThis.fetch;
const oldId=process.env.CHANJING_APP_ID,oldSecret=process.env.CHANJING_SECRET_KEY;
process.env.CHANJING_APP_ID='fixture';process.env.CHANJING_SECRET_KEY='fixture';
test.after(()=>{globalThis.fetch=originalFetch; if(oldId===undefined)delete process.env.CHANJING_APP_ID;else process.env.CHANJING_APP_ID=oldId;if(oldSecret===undefined)delete process.env.CHANJING_SECRET_KEY;else process.env.CHANJING_SECRET_KEY=oldSecret;delete globalThis.__retirementFixture;});
test.beforeEach(()=>{state.requests=[];state.voices=[];state.writes=0;state.authenticated=true;globalThis.fetch=async(url)=>{state.requests.push(String(url));throw new Error('Unexpected external request')}});

test('configured credentials cannot reactivate retired avatar/video creation',async()=>{
  assert.equal((await providers.providerAvailability()).chanjing,false);
  await assert.rejects(providers.createProviderAvatar({provider:'chanjing',name:'fixture',file:new File(['x'],'a.mp4')}),/已下线/);
  await assert.rejects(providers.createProviderVideo({asset:{provider:'chanjing',provider_avatar_id:'legacy'}}),/已下线/);
  assert.equal(providers.createChanjingGeneratedPhoto,undefined);
  await assert.rejects(providers.getProviderVideo({provider:'chanjing',jobId:'legacy'}),/已下线/);
  assert.deepEqual(state.requests,[]);
});
test('reading or locally archiving legacy identity does not call provider',async()=>{
  const asset={provider:'chanjing',provider_avatar_id:'legacy'};
  assert.equal(await providers.refreshProviderAvatar(asset),null);
  await providers.deleteProviderAvatar(asset);
  assert.deepEqual(state.requests,[]);
});
test('legacy HTTP creation and retry fail before persistence or provider side effects',async()=>{
  const form=new FormData();form.set('name','fixture');form.set('consent','true');form.set('file',new File(['video'],'fixture.mp4',{type:'video/mp4'}));
  assert.equal((await avatars.POST(new Request('http://localhost/api',{method:'POST',body:form}))).status,410);
  for(const action of ['refresh','retry','toggle'])assert.equal((await avatars.PATCH(new Request('http://localhost/api',{method:'PATCH',body:JSON.stringify({id:'00000000-0000-4000-8000-000000000002',action})}))).status,410);
  assert.equal((await generated.POST()).status,410);
  assert.equal((await generated.PATCH()).status,410);
  assert.equal((await videos.POST(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({edition:'standard'})}))).status,410);
  assert.equal(state.writes,0);assert.deepEqual(state.requests,[]);
});
test('retired endpoints still require authentication',async()=>{state.authenticated=false;assert.equal((await generated.POST()).status,401);assert.equal((await avatars.POST(new Request('http://localhost/api',{method:'POST'}))).status,401)});
test('template voice and TTS exports are removed',()=>{
  for(const name of ['listChanjingResourceLibrary','createChanjingCreatorVoice','refreshChanjingCreatorVoice','createChanjingVoicePreview','createChanjingSpeechForScript'])assert.equal(providers[name],undefined);
});
test('all legacy resource mutations are retired before persistence',async()=>{
  for(const method of ['POST','PATCH','PUT','DELETE'])assert.equal((await resources[method](new Request('http://localhost/api',{method,body:JSON.stringify({action:'save-public-voice',provider:'chanjing',name:'fixture',voiceId:'voice-1'})}))).status,410);
  assert.equal(state.writes,0);assert.deepEqual(state.requests,[]);
});

test('template import and voice synthesis endpoints return 410 without remote requests',async()=>{
  const form=new FormData();form.set('action','chanjing');form.set('consent','true');form.set('name','fixture');form.set('voiceId','voice-1');
  assert.equal((await spoken.POST(new Request('http://localhost/api',{method:'POST',body:form}))).status,410);
  assert.equal((await audio.POST(new Request('http://localhost/api',{method:'POST'}))).status,410);
  assert.equal((await preview.POST()).status,410);
  assert.equal(state.writes,0);assert.deepEqual(state.requests,[]);
  state.authenticated=false;
  assert.equal((await spoken.POST(new Request('http://localhost/api',{method:'POST'}))).status,401);
  assert.equal((await audio.POST(new Request('http://localhost/api',{method:'POST'}))).status,401);
  assert.equal((await preview.POST()).status,401);
});

test('saved template voices are hidden while recorded voices remain available without provider calls',async()=>{
  state.voices=[{id:'old',provider:'chanjing',status:'ready'},{id:'recorded',provider:'heygen',status:'ready',provider_voice_id:'voice-2'}];
  const response=await spoken.GET();assert.equal(response.status,200);
  const body=await response.json();assert.deepEqual(body.voices.map(v=>v.id),['recorded']);assert.equal(body.chanjingVoices,undefined);
  assert.deepEqual((await (await resources.GET()).json()).voices.map(v=>v.id),['recorded']);
  assert.equal(state.writes,0);assert.deepEqual(state.requests,[]);
});
