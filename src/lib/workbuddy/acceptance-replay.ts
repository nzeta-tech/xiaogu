import { runAgentRuntime, type AgentObservation } from "./agent-runtime.ts";
import type { WorkbuddyAgentAction } from "./planner.ts";
import type { AcceptanceCase, AcceptanceInvocation, AcceptanceTrace } from "./acceptance-harness.ts";
import { evaluateAcceptance } from "./acceptance-harness.ts";
import { WORKBUDDY_PROTOCOL_VERSION, type ObservationEnvelope } from "./interaction-protocol.ts";

export type ReplayToolResult = {
  capabilityId:string;
  source:string;
  pointsCost:number;
  outputs:ObservationEnvelope["outputs"];
  summary?:string;
  fault?:"fetch_failed"|"timeout"|"blocked";
};

export type AcceptanceReplay = {
  testCase:AcceptanceCase;
  actions:WorkbuddyAgentAction[];
  toolResults:ReplayToolResult[];
  deliveryChecks?:Array<{outcome:"allow"}|{outcome:"continue";reason:string}>;
};

export async function replayAcceptance(input:AcceptanceReplay) {
  let actionIndex=0;
  let toolIndex=0;
  let deliveryIndex=0;
  let finalText="";
  const invocations:AcceptanceInvocation[]=[];
  const runtime=await runAgentRuntime({
    maxIterations:input.testCase.expect.maxIterations??9,
    decide:async()=>input.actions[actionIndex++]??input.actions.at(-1)??{type:"final",content:"没有可执行动作",reason:"脚本结束"},
    control:async()=>({outcome:"allow"}),
    invoke:async(action,state)=>{
      const scripted=input.toolResults[toolIndex++];
      if(!scripted)return {capabilityId:action.capabilityId,status:"error",summary:"测试脚本缺少工具结果"};
      const idempotencyKey=`replay-${input.testCase.id}-${state.iteration}-${toolIndex}`;
      invocations.push({capabilityId:scripted.capabilityId,operation:input.testCase.expect.operation,idempotencyKey,source:scripted.source,pointsCost:scripted.pointsCost,outputs:scripted.outputs});
      if(scripted.fault)return {capabilityId:scripted.capabilityId,status:scripted.fault==="blocked"?"blocked":"error",summary:scripted.fault==="timeout"?"timeout":"fetch failed"} satisfies AgentObservation;
      return {capabilityId:scripted.capabilityId,status:"success",summary:scripted.summary??"工具完成",protocol:observation(scripted,state.iteration,idempotencyKey)} satisfies AgentObservation;
    },
    validateDelivery:async()=>input.deliveryChecks?.[deliveryIndex++]??{outcome:"allow"},
    deliver:async(action)=>{finalText=action.content;},
    askUser:async()=>{},
  });
  const trace:AcceptanceTrace={route:{capabilityId:input.testCase.expect.capabilityId,operation:input.testCase.expect.operation},iterations:runtime.iterations,invocations,finalText};
  return {runtime,trace,acceptance:evaluateAcceptance(input.testCase,trace)};
}

function observation(result:ReplayToolResult,iteration:number,idempotencyKey:string):ObservationEnvelope {
  void idempotencyKey;
  return {protocolVersion:WORKBUDDY_PROTOCOL_VERSION,observationId:`observation-${iteration}`,runId:"acceptance-replay",stepId:`step-${iteration}`,attempt:1,status:"success",retryable:true,preview:result.summary??"工具完成",outputs:result.outputs};
}
