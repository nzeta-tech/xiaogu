import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('./proxy.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};vm.runInNewContext(code,{exports,process:{env:{NODE_ENV:'production'}},require:()=>({NextResponse:{next:()=>({status:200}),json:(_,init)=>({status:init.status})}})});
for(const path of ['/apps/digital-human-video','/api/spoken-photos','/api/spoken-voices','/api/spoken-photo-templates/id/image','/api/digital-human-videos','/api/digital-human-videos/id/versions','/api/digital-human-media/id','/api/internal/local-agent/digital-human/media','/api/internal/local-agent/digital-human/checkpoint']){
 test('production allows authenticated route handlers: '+path,()=>assert.equal(exports.proxy({nextUrl:{pathname:path}}).status,200));
}
test('unreleased external editor stays hidden',()=>assert.equal(exports.proxy({nextUrl:{pathname:'/workbuddy/video-editor'}}).status,404));
