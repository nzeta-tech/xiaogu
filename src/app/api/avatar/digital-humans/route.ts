import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { createProviderAvatar, deleteProviderAvatar, getChanjingGeneratedPhoto, listChanjingResourceLibrary, providerAvailability, publicDigitalHumanError, refreshProviderAvatar } from "@/lib/digital-human/providers";
import { archiveDigitalHumanAsset, getDigitalHumanAsset, insertDigitalHumanAsset, listCreatingEditionBindings, listDigitalHumanAssets, updateDigitalHumanAsset, updateEditionBindingStatus, upsertDigitalHumanEditionBinding } from "@/lib/digital-human/store";
import { readDigitalHumanSource, storeDigitalHumanMedia } from "@/lib/digital-human/media-assets";

export const runtime = "nodejs";
const idSchema = z.string().uuid();

async function refreshCreating(userId: string) {
  const assets = await listDigitalHumanAssets(userId);
  const editionBindings=await listCreatingEditionBindings(userId);
  await Promise.all(editionBindings.map(async(binding)=>{const identity=assets.find(asset=>asset.id===binding.digital_human_id);if(!identity||!binding.remote_avatar_id)return;try{const remote=await refreshProviderAvatar({...identity,provider:binding.provider,provider_avatar_id:binding.remote_avatar_id,provider_group_id:binding.remote_group_id,provider_voice_id:binding.remote_voice_id,metadata_json:{...identity.metadata_json,...binding.capabilities}});if(remote)await updateEditionBindingStatus(binding.id,{status:remote.status,voiceId:remote.voiceId,capabilities:remote.capabilities,error:remote.error});}catch{/* retry on next load */}}));
  await Promise.all(assets.filter((asset) => !["public","chanjing_generated_photo"].includes(String(asset.metadata_json?.source || "")) && (asset.status === "creating" || (asset.status === "ready" && !asset.metadata_json?.provider_capabilities))).map(async (asset) => {
    try {
      const remote = await refreshProviderAvatar(asset); if (!remote) return;
      await updateDigitalHumanAsset(userId, asset.id, { status: remote.status, provider_voice_id: remote.voiceId || undefined, preview_image_url: remote.previewImageUrl || undefined, preview_video_url: remote.previewVideoUrl || undefined, error_message: remote.error || null, metadata_json:{supports_remove_background:Boolean(remote.capabilities?.supportsRemoveBackground),supports_4k:Boolean(remote.capabilities?.supports4k),source_width:Number(remote.capabilities?.width||0),source_height:Number(remote.capabilities?.height||0),voice_trained:Boolean(remote.capabilities?.trainsVoice),provider_capabilities:remote.capabilities||{}} });
    } catch { /* Preserve the last known state when a provider status check is transiently unavailable. */ }
  }));
  const refreshed = await listDigitalHumanAssets(userId);
  const missingPublicCovers = refreshed.filter((asset) => asset.metadata_json?.source === "public" && !asset.preview_image_url && asset.provider_avatar_id);
  if (missingPublicCovers.length) {
    try {
      const library = await listChanjingResourceLibrary();
      await Promise.all(missingPublicCovers.map(async (asset) => {
        const figureType = String(asset.metadata_json?.figure_type || "");
        const template = library.templates.find((item) => item.id === asset.provider_avatar_id && item.figure_type === figureType);
        if (template?.cover_url) await updateDigitalHumanAsset(userId, asset.id, { preview_image_url: template.cover_url });
      }));
    } catch { /* Keep the asset usable and retry the cover backfill on the next load. */ }
  }
  return listDigitalHumanAssets(userId);
}

export async function GET() {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  return Response.json({ assets: await refreshCreating(user.id), providers: await providerAvailability() });
}

export async function POST(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const form = await request.formData().catch(() => null);
  const name = String(form?.get("name") || "").trim(); const consent = form?.get("consent") === "true"; const file = form?.get("file");
  const identityId=String(form?.get("identityId")||"");
  const targetEdition=form?.get("targetEdition")==="standard"||file instanceof File&&file.type.startsWith("video/")?"standard" as const:"pro" as const;
  const replaceBackground=form?.get("replaceBackground")!=="false"; const quality=form?.get("quality")==="high"?"high" as const:"standard" as const;
  const trainType=form?.get("trainType")==="figure"?"figure" as const:"both" as const; const language=form?.get("language")==="en"?"en" as const:"cn" as const; const continueWithoutVoice=form?.get("continueWithoutVoice")==="true";
  if (name.length < 2 || name.length > 80 || !(file instanceof File) || !consent) return Response.json({ error: "请填写名称、选择正确素材并确认本人授权" }, { status: 400 });
  const provider = file.type.startsWith("image/") ? "heygen" : file.type.startsWith("video/") ? "chanjing" : null;
  if (!provider) return Response.json({ error: "请上传 JPG/PNG 照片或 MP4/MOV/WebM 视频" }, { status: 400 });
  if (!(await providerAvailability())[provider]) return Response.json({ error: provider === "heygen" ? "快速形象创建暂时繁忙，请稍后再试" : "高还原形象创建暂时繁忙，请稍后再试" }, { status: 503 });
  const maxBytes = provider === "heygen" ? 32 * 1024 * 1024 : 80 * 1024 * 1024;
  if (file.size > maxBytes) return Response.json({ error: provider === "heygen" ? "照片不能超过 32MB" : "视频不能超过 80MB" }, { status: 400 });
  const upgradeIdentity=identityId&&idSchema.safeParse(identityId).success?await getDigitalHumanAsset(user.id,identityId):null;
  if(identityId&&!upgradeIdentity)return Response.json({error:"要升级的数字人不存在"},{status:404});
  if(upgradeIdentity&&((targetEdition==="pro"&&provider!=="heygen")||(targetEdition==="standard"&&provider!=="chanjing")))return Response.json({error:targetEdition==="pro"?"Pro 版需要上传一张清晰正面照片":"标准版需要上传一段真人训练视频"},{status:400});
  const asset = upgradeIdentity || await insertDigitalHumanAsset({ userId: user.id, provider, name, sourceType: provider === "heygen" ? "photo" : "video", metadata: { originalFileName: file.name, creation_mode: provider === "heygen" ? "quick_photo" : "high_fidelity_video",replace_background_requested:replaceBackground,quality,train_type:trainType,language,continue_without_voice:continueWithoutVoice } });
  try {
    const bytes=Buffer.from(await file.arrayBuffer());
    await storeDigitalHumanMedia({userId:user.id,digitalHumanId:asset.id,kind:"source",bytes,contentType:file.type,fileName:file.name});
    const remote = await createProviderAvatar({ provider, name, file:new File([bytes],file.name,{type:file.type}),replaceBackground,quality,trainType,language,continueWithoutVoice });
    if(upgradeIdentity){await upsertDigitalHumanEditionBinding({digitalHumanId:asset.id,provider,edition:targetEdition,status:remote.status,avatarId:remote.avatarId,groupId:remote.groupId,voiceId:remote.voiceId,capabilities:remote.capabilities,reviewStatus:"approved"});return Response.json({asset:await getDigitalHumanAsset(user.id,asset.id)},{status:201});}
    const updated = await updateDigitalHumanAsset(user.id, asset.id, { status: remote.status, provider_avatar_id: remote.avatarId, provider_group_id: remote.groupId || undefined, provider_voice_id: remote.voiceId || undefined, preview_image_url: remote.previewImageUrl || undefined, preview_video_url: remote.previewVideoUrl || undefined,metadata_json:{supports_remove_background:Boolean(remote.capabilities?.supportsRemoveBackground),voice_trained:Boolean(remote.capabilities?.trainsVoice),provider_capabilities:remote.capabilities||{}} });
    return Response.json({ asset: updated }, { status: 201 });
  } catch (error) {
    const providerError = error instanceof Error ? error.message : String(error);
    console.error("digital-human avatar creation failed", { assetId: asset.id, provider, error: providerError });
    const message=publicDigitalHumanError(error,"数字人创建失败，请稍后重试");if(upgradeIdentity)await upsertDigitalHumanEditionBinding({digitalHumanId:asset.id,provider,edition:targetEdition,status:"failed",avatarId:"",capabilities:{error:message},reviewStatus:"pending"});else await updateDigitalHumanAsset(user.id, asset.id, { status: "failed", error_message: message, metadata_json: { last_provider_error: providerError.slice(0, 500), last_failed_at: new Date().toISOString() } });
    return Response.json({ error: message, assetId: asset.id }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const body = await request.json().catch(() => null) as { id?: string; action?: string } | null;
  if (!body?.id || !idSchema.safeParse(body.id).success) return Response.json({ error: "数字人参数不正确" }, { status: 400 });
  const asset = await getDigitalHumanAsset(user.id, body.id); if (!asset) return Response.json({ error: "数字人不存在" }, { status: 404 });
  if (body.action === "refresh") {
    if (asset.metadata_json?.source === "chanjing_generated_photo") { const remote = await getChanjingGeneratedPhoto(String(asset.metadata_json.photo_task_id || "")); return Response.json({ asset: await updateDigitalHumanAsset(user.id, asset.id, { status: remote.status, preview_image_url: remote.imageUrl || undefined, error_message: remote.error || null }) }); }
    const remote = await refreshProviderAvatar(asset); if (!remote) return Response.json({ asset });
    return Response.json({ asset: await updateDigitalHumanAsset(user.id, asset.id, { status: remote.status, provider_voice_id: remote.voiceId || undefined, preview_image_url: remote.previewImageUrl || undefined, preview_video_url: remote.previewVideoUrl || undefined, error_message: remote.error || null,metadata_json:{supports_remove_background:Boolean(remote.capabilities?.supportsRemoveBackground),supports_4k:Boolean(remote.capabilities?.supports4k),source_width:Number(remote.capabilities?.width||0),source_height:Number(remote.capabilities?.height||0),voice_trained:Boolean(remote.capabilities?.trainsVoice),provider_capabilities:remote.capabilities||{}} }) });
  }
  if (body.action === "retry") {
    if (asset.status !== "failed") return Response.json({ error: "只有创建失败的数字人可以重试" }, { status: 409 });
    const source=await readDigitalHumanSource(user.id,asset.id); if(!source) return Response.json({ error: "原始素材不存在，请重新上传" }, { status: 404 });
    if (!(await providerAvailability())[asset.provider]) return Response.json({ error: "数字人创建通道暂时不可用" }, { status: 503 });
    await updateDigitalHumanAsset(user.id,asset.id,{status:"creating",error_message:null});
    try { const remote=await createProviderAvatar({provider:asset.provider,name:asset.name,file:new File([source.bytes],source.row.original_filename,{type:source.row.content_type}),replaceBackground:asset.metadata_json?.replace_background_requested!==false,quality:asset.metadata_json?.quality==="high"?"high":"standard",trainType:asset.metadata_json?.train_type==="figure"?"figure":"both",language:asset.metadata_json?.language==="en"?"en":"cn",continueWithoutVoice:asset.metadata_json?.continue_without_voice===true}); return Response.json({asset:await updateDigitalHumanAsset(user.id,asset.id,{status:remote.status,provider_avatar_id:remote.avatarId,provider_group_id:remote.groupId||undefined,provider_voice_id:remote.voiceId||undefined,preview_image_url:remote.previewImageUrl||undefined,preview_video_url:remote.previewVideoUrl||undefined,error_message:null,metadata_json:{supports_remove_background:Boolean(remote.capabilities?.supportsRemoveBackground),voice_trained:Boolean(remote.capabilities?.trainsVoice),provider_capabilities:remote.capabilities||{}}})}); }
    catch(error){const providerError=error instanceof Error?error.message:String(error);console.error("digital-human avatar retry failed",{assetId:asset.id,provider:asset.provider,error:providerError});const message=publicDigitalHumanError(error,"数字人创建失败，请稍后重试");await updateDigitalHumanAsset(user.id,asset.id,{status:"failed",error_message:message,metadata_json:{last_provider_error:providerError.slice(0,500),last_failed_at:new Date().toISOString()}});return Response.json({error:message},{status:502});}
  }
  if (body.action === "toggle") return Response.json({ asset: await updateDigitalHumanAsset(user.id, asset.id, { status: asset.status === "disabled" ? "ready" : "disabled" }) });
  return Response.json({ error: "不支持的操作" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const user = await requireSessionUser(); if (user instanceof Response) return user;
  const id = new URL(request.url).searchParams.get("id"); if (!id || !idSchema.safeParse(id).success) return Response.json({ error: "数字人参数不正确" }, { status: 400 });
  const asset = await getDigitalHumanAsset(user.id, id); if (!asset) return Response.json({ error: "数字人不存在" }, { status: 404 });
  try { if (asset.metadata_json?.source !== "chanjing_generated_photo") await deleteProviderAvatar(asset); await archiveDigitalHumanAsset(user.id, id); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: publicDigitalHumanError(error,"删除暂未完成，请稍后重试") }, { status: 502 }); }
}
