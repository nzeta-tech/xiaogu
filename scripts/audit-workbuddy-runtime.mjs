import process from "node:process";
import pg from "pg";
import {auditRuntimeTasks} from "../src/lib/workbuddy/runtime-audit.ts";

const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const numericArg=process.argv.slice(2).find(value=>/^\d+$/.test(value));
const limitArg=process.argv.slice(2).find(value=>value.startsWith("--limit="))?.slice(8);
const sinceArg=process.argv.slice(2).find(value=>value.startsWith("--since="))?.slice(8);
const limit=Math.max(1,Math.min(500,Number(limitArg||numericArg)||50));
const since=sinceArg&&Number.isFinite(Date.parse(sinceArg))?new Date(sinceArg).toISOString():null;
try{
  const tasks=await pool.query(`select id,status,error_message,coalesce((context_json->'agentRun'->>'iteration')::int,0) iteration from workbuddy_tasks where ($2::timestamptz is null or updated_at >= $2) order by updated_at desc limit $1`,[limit,since]);
  const taskIds=tasks.rows.map(row=>row.id);
  const usage=taskIds.length?await pool.query(`select metadata->>'workbuddyInvocationId' invocation_id,coalesce(sum(quota_cost),0)::int charged from usage_logs where metadata->>'workbuddyTaskId'=any($1::text[]) group by 1`,[taskIds]):{rows:[]};
  const chargedByInvocation=new Map(usage.rows.map(row=>[row.invocation_id,row.charged]));
  const snapshots=[];
  for(const row of tasks.rows){
    const [messages,invocations]=await Promise.all([
      pool.query(`select role,message_type,content from workbuddy_task_messages where task_id=$1 order by created_at`,[row.id]),
      pool.query(`select id,capability_id,status,points_cost,input_json,output_json from workbuddy_capability_invocations where task_id=$1 order by created_at`,[row.id]),
    ]);
    snapshots.push({id:row.id,status:row.status,errorMessage:row.error_message,iteration:row.iteration,messages:messages.rows.map(item=>({role:item.role,messageType:item.message_type,content:item.content})),invocations:invocations.rows.map(item=>({id:item.id,capabilityId:item.capability_id,status:item.status,pointsCost:item.points_cost,input:item.input_json??{},output:item.output_json??{},usageCharged:chargedByInvocation.get(item.id)??0}))});
  }
  const report=auditRuntimeTasks(snapshots);
  console.log(JSON.stringify({...report,window:{since,limit}},null,2));
  if(!report.passed)process.exitCode=2;
}finally{await pool.end();}
