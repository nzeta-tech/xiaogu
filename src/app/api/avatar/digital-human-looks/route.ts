import { requireSessionUser } from "@/lib/auth/session";
import { getDigitalHumanAsset, getReadyDigitalHumanEditionBinding, updateDigitalHumanAsset } from "@/lib/digital-human/store";
import { createProviderLook, listProviderLooks, publicDigitalHumanError } from "@/lib/digital-human/providers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const assetId = new URL(request.url).searchParams.get("assetId") || "";
  const identity = await getDigitalHumanAsset(user.id, assetId); if (!identity) return Response.json({ error: "数字人不存在" }, { status: 404 });
  const edition=new URL(request.url).searchParams.get("edition")==="standard"?"standard":"pro";const binding=await getReadyDigitalHumanEditionBinding(user.id,assetId,edition);const asset=binding?{...identity,provider:binding.provider,provider_avatar_id:binding.remote_avatar_id,provider_group_id:binding.remote_group_id,provider_voice_id:binding.remote_voice_id}:identity;
  try { return Response.json({ looks: await listProviderLooks(asset) }); }
  catch (error) { return Response.json({ error: publicDigitalHumanError(error, "造型列表暂时无法加载") }, { status: 502 }); }
}

export async function POST(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const form = await request.formData().catch(() => null); const assetId = String(form?.get("assetId") || ""); const name = String(form?.get("name") || "").trim(); const file = form?.get("file");
  const identity = await getDigitalHumanAsset(user.id, assetId); if (!identity) return Response.json({ error: "数字人不存在" }, { status: 404 });const binding=await getReadyDigitalHumanEditionBinding(user.id,assetId,"pro");const asset=binding?{...identity,provider:binding.provider,provider_avatar_id:binding.remote_avatar_id,provider_group_id:binding.remote_group_id,provider_voice_id:binding.remote_voice_id}:identity;
  if (name.length < 2 || name.length > 80 || !(file instanceof File) || !file.type.startsWith("image/") || file.size > 32 * 1024 * 1024) return Response.json({ error: "请填写造型名称并上传不超过 32MB 的清晰照片" }, { status: 400 });
  try {
    const look = await createProviderLook(asset, { name, file });
    const knownLooks = Array.isArray(asset.metadata_json?.looks) ? asset.metadata_json.looks : [];
    await updateDigitalHumanAsset(user.id, asset.id, { metadata_json: { looks: [...knownLooks, look] } });
    return Response.json({ look }, { status: 202 });
  } catch (error) { return Response.json({ error: publicDigitalHumanError(error, "新增造型失败，请稍后再试") }, { status: 502 }); }
}
