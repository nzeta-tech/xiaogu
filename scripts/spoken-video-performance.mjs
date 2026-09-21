import {AsyncLocalStorage} from 'node:async_hooks';
import {appendFile} from 'node:fs/promises';
import path from 'node:path';
const context=new AsyncLocalStorage();
export function performanceScope(dir,work){return context.run({dir,started:performance.now(),events:[]},work);}
export async function measureVideoStage(stage,work,detail={}){
  const start=performance.now();let ok=false;
  try{const value=await work();ok=true;return value;}
  finally{const state=context.getStore();if(state){const event={stage,elapsedMs:Math.round(performance.now()-start),offsetMs:Math.round(start-state.started),ok,...detail};state.events.push(event);if(state.dir)await appendFile(path.join(state.dir,'performance.jsonl'),JSON.stringify(event)+'\n').catch(()=>{});}}
}
export function videoMetrics(){const s=context.getStore();return s?{wallMs:Math.round(performance.now()-s.started),stages:[...s.events]}:null;}
