import { getCreationAppBySlug } from "@/lib/apps/catalog";
import { requireSessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { normalizeRemixCapability } from "@/lib/creation/capabilities";
import { runTrafficTopicAnalysis } from "@/lib/creation/traffic-topic-analysis";

export async function POST(request:Request,context:{params:Promise<{slug:string}>}){
  const{slug}=await context.params;
  const app=getCreationAppBySlug(slug);
  if(!app)return Response.json({error:"应用不存在"},{status:404});
  const user=await requireSessionUser();
  if(user instanceof Response)return user;
  const body=await request.json().catch(()=>({})) as{values?:Record<string,string|string[]>};
  const values=body.values??{};
  const isTraffic=slug==="traffic-copy"||slug==="link-remix"&&normalizeRemixCapability(values.remix_target)==="traffic-copy";
  if(!isTraffic)return Response.json({error:"当前应用不支持选题竞技场"},{status:400});
  const quota=await requireQuota(user,"write_script",app.points);
  if(!quota.ok)return quota.response;
  try{return Response.json(await runTrafficTopicAnalysis({slug,userId:user.id,values}),{headers:{"cache-control":"no-store"}});}catch(error){return Response.json({error:error instanceof Error?error.message:"选题推荐失败，请稍后重试"},{status:502});}
}
