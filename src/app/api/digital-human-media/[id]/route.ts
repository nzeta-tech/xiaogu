import { requireSessionUser } from "@/lib/auth/session";
import { readDigitalHumanMedia } from "@/lib/digital-human/media-assets";
import { mediaResponse } from "@/lib/digital-human/media-response";
import { MediaNodeError } from "@/lib/digital-human/media-node";

export async function GET(request: Request, context: {params:Promise<{id:string}>}) {
  const user=await requireSessionUser();if(user instanceof Response)return user;
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return Response.json({error:'文件不存在'},{status:404});
  try {
    const media=await readDigitalHumanMedia(user.id,id);
    if(!media)return Response.json({error:'文件不存在'},{status:404});
    return await mediaResponse(media,request.headers.get('range'),new URL(request.url).searchParams.get('download')==='1');
  } catch(error){return Response.json({error:error instanceof MediaNodeError?error.message:'媒体读取暂时不可用'},{status:error instanceof MediaNodeError?error.status:503});}
}
