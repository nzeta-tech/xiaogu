import type { DeliverableKind } from "./deliverable-contract.ts";

export type AcceptanceInvocation = {
  capabilityId:string;
  operation?:string;
  idempotencyKey?:string;
  source?:string;
  pointsCost?:number;
  outputs?:Array<{slotId:string;kind:DeliverableKind;artifactId?:string;contentRef?:string;downloadUrl?:string}>;
};

export type AcceptanceTrace = {
  route:{capabilityId:string|null;operation?:string};
  iterations:number;
  invocations:AcceptanceInvocation[];
  finalText?:string;
  presentationText?:string;
};

export type AcceptanceExpectation = {
  capabilityId:string|null;
  operation?:string;
  invocationCount?:number;
  maxIterations?:number;
  maxPoints?:number;
  requiredSourceFragments?:string[];
  forbiddenSourceFragments?:string[];
  outputSlots?:string[];
  outputKind?:DeliverableKind;
  outputCount?:number;
  requireDownloads?:boolean;
};

export type AcceptanceCase = {id:string;title:string;tags:string[];expect:AcceptanceExpectation};
export type AcceptanceViolation = {code:string;message:string};

const DEFAULT_PROTOCOL_LEAKS=[
  "[应用参数:",
  "outputSlotIds",
  "idempotencyKey",
  "【应用执行目标】",
  "结合已取得的研究观察，执行用户要求的专业产物",
];

export function evaluateAcceptance(testCase:AcceptanceCase,trace:AcceptanceTrace) {
  const violations:AcceptanceViolation[]=[];
  const expected=testCase.expect;
  if(trace.route.capabilityId!==expected.capabilityId)violations.push({code:"route_mismatch",message:`期望 ${expected.capabilityId ?? "direct"}，实际 ${trace.route.capabilityId ?? "direct"}`});
  if(expected.operation&&trace.route.operation!==expected.operation)violations.push({code:"operation_mismatch",message:`期望 ${expected.operation}，实际 ${trace.route.operation ?? "unknown"}`});
  if(typeof expected.invocationCount==="number"&&trace.invocations.length!==expected.invocationCount)violations.push({code:"invocation_count",message:`期望调用 ${expected.invocationCount} 次，实际 ${trace.invocations.length} 次`});
  if(typeof expected.maxIterations==="number"&&trace.iterations>expected.maxIterations)violations.push({code:"iteration_budget",message:`Agent 循环 ${trace.iterations} 轮，超过上限 ${expected.maxIterations}`});
  const points=trace.invocations.reduce((sum,item)=>sum+(item.pointsCost??0),0);
  if(typeof expected.maxPoints==="number"&&points>expected.maxPoints)violations.push({code:"points_budget",message:`点数 ${points} 超过上限 ${expected.maxPoints}`});
  const keys=trace.invocations.flatMap(item=>item.idempotencyKey?[item.idempotencyKey]:[]);
  if(new Set(keys).size!==keys.length)violations.push({code:"duplicate_idempotency_key",message:"多个外部调用复用了同一幂等键"});
  const source=trace.invocations.map(item=>item.source??"").join("\n");
  for(const fragment of expected.requiredSourceFragments??[])if(!source.includes(fragment))violations.push({code:"source_missing",message:`应用素材缺少：${fragment}`});
  for(const fragment of expected.forbiddenSourceFragments??[])if(source.includes(fragment))violations.push({code:"source_contaminated",message:`应用素材错误包含：${fragment}`});
  const outputs=trace.invocations.flatMap(item=>item.outputs??[]);
  if(typeof expected.outputCount==="number"&&outputs.length!==expected.outputCount)violations.push({code:"output_count",message:`期望 ${expected.outputCount} 个成果，实际 ${outputs.length} 个`});
  if(expected.outputKind&&outputs.some(item=>item.kind!==expected.outputKind))violations.push({code:"output_kind",message:`存在非 ${expected.outputKind} 成果`});
  for(const slot of expected.outputSlots??[])if(!outputs.some(item=>item.slotId===slot&&(item.artifactId||item.contentRef||item.downloadUrl)))violations.push({code:"output_slot_missing",message:`缺少有效输出槽 ${slot}`});
  if(expected.requireDownloads&&outputs.some(item=>!item.downloadUrl))violations.push({code:"download_missing",message:"媒体成果缺少下载地址"});
  const visible=`${trace.finalText??""}\n${trace.presentationText??""}`;
  for(const leak of DEFAULT_PROTOCOL_LEAKS)if(visible.includes(leak))violations.push({code:"protocol_leak",message:`用户界面泄漏内部协议：${leak}`});
  return {id:testCase.id,passed:violations.length===0,violations,metrics:{iterations:trace.iterations,invocations:trace.invocations.length,points,outputs:outputs.length}};
}

export function summarizeAcceptance(results:ReturnType<typeof evaluateAcceptance>[]) {
  const passed=results.filter(item=>item.passed).length;
  return {total:results.length,passed,failed:results.length-passed,passRate:results.length?passed/results.length:1,failures:results.filter(item=>!item.passed)};
}
