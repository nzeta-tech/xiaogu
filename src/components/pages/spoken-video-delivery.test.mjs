import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
async function component(){
  const source=await readFile(new URL('./SpokenVideoVersions.tsx',import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
  const module={exports:{}};vm.runInNewContext(outputText,{exports:module.exports,module,require:name=>name.endsWith('.css')?{}:name==='@/lib/client/url'?{apiPath:x=>x}:require(name)});return module.exports.SpokenVideoVersions;
}
test('published third-round issues remain visible alongside playback and download',async()=>{
  const Component=await component();const root={id:'job',title:'Test',created_at:'2026-09-21T00:00:00Z',status:'completed',video_url:'/movie.mp4',request_json:{delivery_notes:['字幕遮挡'],quality_review:[{attempt:3,pass:false,issues:['字幕遮挡']}]}};
  const html=renderToStaticMarkup(React.createElement(Component,{root,versions:[root],available:true,onRefresh:async()=>{}}));
  assert.match(html,/已发布 · 质检仍有待改进项/);assert.match(html,/字幕遮挡/);assert.match(html,/<video/);assert.match(html,/下载此版本/);assert.doesNotMatch(html,/这个版本未能完成/);
});
