import { createHash } from "node:crypto";

export type RuntimeAuditTask={id:string;status:string;errorMessage?:string|null;iteration?:number;messages:Array<{role:string;messageType:string;content:string}>;invocations:Array<{id:string;capabilityId:string;status:string;pointsCost:number;input:Record<string,unknown>;output:Record<string,unknown>;usageCharged?:number}>};
export type RuntimeAuditIssue={taskId:string;code:string;severity:"error"|"warning";message:string;invocationId?:string};

const leaks=["[应用参数:","outputSlotIds","idempotencyKey","结合已取得的研究观察，执行用户要求的专业产物"];

export function auditRuntimeTasks(tasks:RuntimeAuditTask[]){
  const issues:RuntimeAuditIssue[]=[];
  for(const task of tasks){
    if(task.status==="cancelled")for(const invocation of task.invocations){
      if(Number(invocation.usageCharged??0)>0)issues.push({...issue(task,"cancelled_but_charged","error",`任务取消后仍产生 ${invocation.usageCharged} 点实际扣费：${invocation.capabilityId}`),invocationId:invocation.id});
    }
    if((task.iteration??0)>=8)issues.push(issue(task,"loop_near_exhaustion","error",`Agent 执行达到 ${task.iteration} 轮`));
    if(task.status==="failed"&&task.invocations.some(item=>item.status==="completed"))issues.push(issue(task,"successful_work_lost","error","工具已经成功，但任务最终失败"));
    for(const message of task.messages.filter(item=>item.role==="assistant"))for(const leak of leaks)if(message.content.includes(leak))issues.push(issue(task,"protocol_leak","error",`用户可见消息包含内部协议：${leak}`));
    const fingerprints=new Map<string,string>();
    for(const invocation of task.invocations){
      const fingerprint=createHash("sha1").update(JSON.stringify([invocation.capabilityId,stable(invocation.input)])).digest("hex");
      const previous=fingerprints.get(fingerprint);
      if(previous)issues.push({...issue(task,"duplicate_invocation","error",`相同能力和输入被重复执行：${invocation.capabilityId}`),invocationId:invocation.id});
      else fingerprints.set(fingerprint,invocation.id);
      const source=materialSource(invocation.input);
      if(invocation.capabilityId.startsWith("app.")&&isCommandOnlyMaterial(source))issues.push({...issue(task,"command_only_material","error",`${invocation.capabilityId} 只收到操作说明，没有真实素材`),invocationId:invocation.id});
      if(invocation.status==="completed"&&invocation.capabilityId.startsWith("app.")&&!hasMeaningfulOutput(invocation.output))issues.push({...issue(task,"completed_without_output","error",`${invocation.capabilityId} 标记完成但没有可识别成果`),invocationId:invocation.id});
      if((invocation.usageCharged??0)>0&&invocation.status!=="completed")issues.push({...issue(task,"charged_failed_invocation","error",`失败调用实际扣除了 ${invocation.usageCharged} 点`),invocationId:invocation.id});
      else if(invocation.pointsCost>0&&invocation.status!=="completed")issues.push({...issue(task,"failed_invocation_with_cost_estimate","warning",`失败调用保留了 ${invocation.pointsCost} 点成本估算，未发现实际扣费证据`),invocationId:invocation.id});
    }
  }
  return{auditedTasks:tasks.length,issues,errorCount:issues.filter(item=>item.severity==="error").length,warningCount:issues.filter(item=>item.severity==="warning").length,passed:issues.every(item=>item.severity!=="error")};
}

function issue(task:RuntimeAuditTask,code:string,severity:RuntimeAuditIssue["severity"],message:string):RuntimeAuditIssue{return{taskId:task.id,code,severity,message};}
function stable(value:unknown):unknown{if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)]));return value;}
function materialSource(input:Record<string,unknown>){const values=input.values&&typeof input.values==="object"&&!Array.isArray(input.values)?input.values as Record<string,unknown>:{};return [values.source,values.topic,values.content,values.prompt,values.summary].find((item):item is string=>typeof item==="string"&&Boolean(item.trim()))??"";}
function isCommandOnlyMaterial(source:string){const clean=source.trim();if(!clean)return false;return clean.length<240&&/(?:基于|根据|结合).{0,20}(?:刚完成|上述|已有|前面).{0,30}(?:生成|制作|写|输出)/.test(clean)&&!/\n.{30,}/.test(clean);}
function hasMeaningfulOutput(output:Record<string,unknown>){
  if(Object.keys(output).length===0)return false;
  if([output.content,output.resultText,output.resultUrl,output.workId].some(item=>typeof item==="string"&&Boolean(item.trim())))return true;
  return containsDeliverable(output.contentJson??output,0);
}
function containsDeliverable(value:unknown,depth:number):boolean{
  if(depth>6||value===null||value===undefined)return false;
  if(typeof value==="string")return value.trim().length>0;
  if(Array.isArray(value))return value.length>0&&value.some(item=>containsDeliverable(item,depth+1));
  if(typeof value!=="object")return false;
  const object=value as Record<string,unknown>;
  if(["url","downloadUrl","body","plainText","artifactId","contentRef"].some(key=>typeof object[key]==="string"&&Boolean((object[key] as string).trim())))return true;
  return ["images","videos","files","items","scripts","articles","presentations","batches","outputs","result"].some(key=>containsDeliverable(object[key],depth+1));
}
