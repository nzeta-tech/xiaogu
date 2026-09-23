import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { requireAppAccess } from "@/lib/billing/paid-access";
import { getSpokenVideoAgentAvailability } from "@/lib/local-agent/repository";
import { createVideoVersion, selectVideoVersion, VideoVersionError } from "@/lib/digital-human/video-versions";
const create = z.object({ instructions: z.string().trim().min(4,"请写下具体的修改要求").max(1500), requestId: z.string().uuid(), productionMode: z.enum(["basic","smart"]).optional() }).strict();
const select = z.object({ versionId: z.string().uuid() }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({error:"作品不存在"},{status:404});
  const parsed = create.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return Response.json({error:parsed.error.issues[0]?.message||"修改要求无效"},{status:400});
  const denied = await requireAppAccess(user.id,"digital-human-video"); if(denied)return denied;
  const available=await getSpokenVideoAgentAvailability();
  if(!available.available)return Response.json({error:"制作服务暂不可用，请稍后再试。已有版本不受影响"},{status:503});
  try { return Response.json({job:await createVideoVersion(user.id,id,parsed.data.instructions,parsed.data.requestId,parsed.data.productionMode)},{status:202}); }
  catch(error){if(error instanceof VideoVersionError)return Response.json({error:error.message},{status:error.status});console.error("video revision create failed",error);return Response.json({error:"修改提交失败，请重试"},{status:500});}
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user=await requireSessionUser();if(user instanceof Response)return user;
  const {id}=await context.params;const parsed=select.safeParse(await request.json().catch(()=>null));
  if(!z.string().uuid().safeParse(id).success||!parsed.success)return Response.json({error:"版本参数无效"},{status:400});
  try {await selectVideoVersion(user.id,id,parsed.data.versionId);return Response.json({ok:true});}
  catch(error){if(error instanceof VideoVersionError)return Response.json({error:error.message},{status:error.status});return Response.json({error:"选择版本失败，请重试"},{status:500});}
}
