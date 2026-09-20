import test from 'node:test';import assert from 'node:assert/strict';
import {readStructuredModelStream} from './structured-model-stream.ts';
const response=(text,width=7)=>new Response(new ReadableStream({start(c){const bytes=new TextEncoder().encode(text);for(let i=0;i<bytes.length;i+=width)c.enqueue(bytes.slice(i,i+width));c.close();}}));
const delta=s=>'data: '+JSON.stringify({choices:[{delta:{content:s}}]})+'\r\n\r\n';
test('structured JSON survives byte boundaries, Unicode and gateway heartbeats',async()=>{const raw=': heartbeat\n\n'+delta('{"标题":')+delta('"汇率"}')+'data: [DONE]\r\n\r\n';assert.deepEqual(JSON.parse(await readStructuredModelStream(response(raw,1))),{标题:'汇率'});});
test('truncated or empty structured output never succeeds',async()=>{await assert.rejects(readStructuredModelStream(response(delta('{}'))),/不完整/);await assert.rejects(readStructuredModelStream(response('data: [DONE]\n')),/不完整/);});
test('upstream streamed failure does not expose partial JSON or provider details',async()=>{await assert.rejects(readStructuredModelStream(response(delta('{}')+'data: {"error":{"message":"private-provider-detail"}}\n')),e=>/中断/.test(e.message)&&!e.message.includes('private'));});
