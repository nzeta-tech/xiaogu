import { query } from "@/lib/db/client";
import type { DigitalHumanAsset, DigitalHumanEdition, DigitalHumanEditionSummary, DigitalHumanProvider, DigitalHumanVideoJob } from "@/lib/digital-human/types";

const assetColumns = "id,provider,name,status,source_type,provider_avatar_id,provider_group_id,provider_voice_id,preview_image_url,preview_video_url,consent_confirmed_at,error_message,metadata_json,created_at,updated_at";

export async function listDigitalHumanAssets(userId: string) {
  const result = await query<DigitalHumanAsset>(`select ${assetColumns} from digital_human_assets where user_id=$1 and status<>'deleting' order by created_at desc`, [userId]);
  return attachEditionSummaries(result.rows);
}

export async function getDigitalHumanAsset(userId: string, id: string) {
  const result = await query<DigitalHumanAsset>(`select ${assetColumns} from digital_human_assets where user_id=$1 and id=$2`, [userId, id]);
  return (await attachEditionSummaries(result.rows))[0] ?? null;
}

async function attachEditionSummaries(assets: DigitalHumanAsset[]) {
  if (!assets.length) return assets;
  const result=await query<{digital_human_id:string;edition:DigitalHumanEdition;status:DigitalHumanEditionSummary["status"];review_status:DigitalHumanEditionSummary["reviewStatus"];provider:string;capabilities:Record<string,unknown>}>(`select digital_human_id,edition,status,review_status,provider,capabilities from digital_human_provider_bindings where digital_human_id=any($1::uuid[]) order by edition`,[assets.map(asset=>asset.id)]);
  const grouped=new Map<string,DigitalHumanEditionSummary[]>();
  for(const row of result.rows){const list=grouped.get(row.digital_human_id)||[];list.push({edition:row.edition,status:row.status,reviewStatus:row.review_status,supportsLooks:row.provider==="heygen",supportsRemoveBackground:row.capabilities?.supportsRemoveBackground===true||row.capabilities?.supports_remove_background===true,supports4k:row.capabilities?.supports4k===true||row.capabilities?.supports_4k===true});grouped.set(row.digital_human_id,list);}
  return assets.map(asset=>({...asset,editions:asset.metadata_json?.source==="chanjing_generated_photo"?[]:grouped.get(asset.id)||[{edition:asset.provider==="heygen"?"pro":"standard",status:asset.status==="deleting"?"disabled":asset.status,reviewStatus:"approved",supportsLooks:asset.provider==="heygen",supportsRemoveBackground:asset.metadata_json?.supports_remove_background===true,supports4k:asset.metadata_json?.supports_4k===true}]}));
}

export async function listReadyDigitalHumanBindings(userId: string, digitalHumanId: string) {
  const result = await query<{ provider: DigitalHumanProvider; edition: DigitalHumanEdition; review_status: "pending"|"approved"|"rejected"; remote_avatar_id: string | null; remote_group_id: string | null; remote_voice_id: string | null; capabilities: Record<string, unknown>; quality_score: number | null; cost_profile: Record<string, unknown> }>(
    `select binding.provider,binding.edition,binding.review_status,binding.remote_avatar_id,binding.remote_group_id,binding.remote_voice_id,binding.capabilities,binding.quality_score,binding.cost_profile
     from digital_human_provider_bindings binding join digital_human_assets asset on asset.id=binding.digital_human_id
     where binding.digital_human_id=$1 and asset.user_id=$2 and binding.status='ready' and binding.review_status='approved'
     order by binding.quality_score desc nulls last,binding.updated_at desc`, [digitalHumanId,userId],
  );
  return result.rows;
}
export async function getReadyDigitalHumanEditionBinding(userId:string,digitalHumanId:string,edition:DigitalHumanEdition){return (await listReadyDigitalHumanBindings(userId,digitalHumanId)).find(binding=>binding.edition===edition)||null;}

export async function upsertDigitalHumanEditionBinding(input:{digitalHumanId:string;provider:DigitalHumanProvider;edition:DigitalHumanEdition;status:"creating"|"ready"|"failed"|"disabled";avatarId:string;groupId?:string;voiceId?:string;capabilities?:Record<string,unknown>;reviewStatus?:"pending"|"approved"|"rejected"}){
  await query(`insert into digital_human_provider_bindings(digital_human_id,provider,edition,status,review_status,remote_avatar_id,remote_group_id,remote_voice_id,capabilities,metadata_json)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,'{"createdBy":"xiaogu-edition-flow"}'::jsonb)
    on conflict(digital_human_id,provider) do update set edition=excluded.edition,status=excluded.status,review_status=excluded.review_status,remote_avatar_id=excluded.remote_avatar_id,remote_group_id=excluded.remote_group_id,remote_voice_id=excluded.remote_voice_id,capabilities=excluded.capabilities,updated_at=now()`,[input.digitalHumanId,input.provider,input.edition,input.status,input.reviewStatus||"approved",input.avatarId||null,input.groupId||null,input.voiceId||null,input.capabilities||{}]);
}

export async function listCreatingEditionBindings(userId:string){
  const result=await query<{id:string;digital_human_id:string;provider:DigitalHumanProvider;edition:DigitalHumanEdition;remote_avatar_id:string|null;remote_group_id:string|null;remote_voice_id:string|null;capabilities:Record<string,unknown>}>(`select binding.id,binding.digital_human_id,binding.provider,binding.edition,binding.remote_avatar_id,binding.remote_group_id,binding.remote_voice_id,binding.capabilities from digital_human_provider_bindings binding join digital_human_assets asset on asset.id=binding.digital_human_id where asset.user_id=$1 and binding.status='creating'`,[userId]);return result.rows;
}
export async function updateEditionBindingStatus(id:string,patch:{status:"creating"|"ready"|"failed";voiceId?:string;capabilities?:Record<string,unknown>;error?:string}){await query(`update digital_human_provider_bindings set status=$2,remote_voice_id=coalesce($3,remote_voice_id),capabilities=capabilities||$4::jsonb,metadata_json=metadata_json||jsonb_build_object('lastError',$5),updated_at=now() where id=$1`,[id,patch.status,patch.voiceId||null,patch.capabilities||{},patch.error||null]);}

export async function insertDigitalHumanAsset(input: { userId: string; provider: DigitalHumanProvider; name: string; sourceType: "photo" | "video"; metadata?: Record<string, unknown> }) {
  const result = await query<DigitalHumanAsset>(
    `insert into digital_human_assets(user_id,provider,name,source_type,consent_confirmed_at,metadata_json)
     values($1,$2,$3,$4,now(),$5) returning ${assetColumns}`,
    [input.userId, input.provider, input.name, input.sourceType, input.metadata ?? {}],
  );
  return result.rows[0];
}

export async function updateDigitalHumanAsset(userId: string, id: string, patch: Partial<DigitalHumanAsset>) {
  const result = await query<DigitalHumanAsset>(
    `update digital_human_assets set
       status=coalesce($3,status),provider_avatar_id=coalesce($4,provider_avatar_id),provider_group_id=coalesce($5,provider_group_id),
       provider_voice_id=coalesce($6,provider_voice_id),preview_image_url=coalesce($7,preview_image_url),preview_video_url=coalesce($8,preview_video_url),
       error_message=$9,metadata_json=metadata_json||$10::jsonb,updated_at=now()
     where user_id=$1 and id=$2 returning ${assetColumns}`,
    [userId, id, patch.status ?? null, patch.provider_avatar_id ?? null, patch.provider_group_id ?? null, patch.provider_voice_id ?? null, patch.preview_image_url ?? null, patch.preview_video_url ?? null, patch.error_message ?? null, patch.metadata_json ?? {}],
  );
  return result.rows[0] ?? null;
}

export async function archiveDigitalHumanAsset(userId: string, id: string) {
  const result = await query<DigitalHumanAsset>(`update digital_human_assets set status='deleting',updated_at=now() where user_id=$1 and id=$2 returning ${assetColumns}`, [userId, id]);
  return result.rows[0] ?? null;
}

export async function insertDigitalHumanVideoJob(input: { userId: string; asset: DigitalHumanAsset; edition: DigitalHumanEdition; title: string; script: string; aspectRatio: "9:16" | "16:9"; subtitleEnabled: boolean; voiceId?: string; voiceName?: string; voiceSource?: string }) {
  const result = await query<DigitalHumanVideoJob>(
    `insert into digital_human_video_jobs(user_id,asset_id,provider,edition,title,script,aspect_ratio,subtitle_enabled,voice_id,voice_name,voice_source)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [input.userId, input.asset.id, input.asset.provider, input.edition, input.title, input.script, input.aspectRatio, input.subtitleEnabled, input.voiceId || input.asset.provider_voice_id, input.voiceName || null, input.voiceSource || null],
  );
  return result.rows[0];
}

export async function updateDigitalHumanVideoJob(userId: string, id: string, patch: { status?: DigitalHumanVideoJob["status"]; providerJobId?: string; providerSessionId?: string; videoUrl?: string; previewImageUrl?: string; durationSeconds?: number; progress?: number; errorMessage?: string | null; request?: Record<string, unknown> }) {
  const result = await query<DigitalHumanVideoJob>(
    `update digital_human_video_jobs set status=coalesce($3,status),provider_job_id=coalesce($4,provider_job_id),provider_session_id=coalesce($5,provider_session_id),
       video_url=coalesce($6,video_url),preview_image_url=coalesce($7,preview_image_url),duration_seconds=coalesce($8,duration_seconds),
       progress=coalesce($9,progress),error_message=$10,request_json=request_json||$11::jsonb,updated_at=now(),
       completed_at=case when $3='completed' then now() else completed_at end where user_id=$1 and id=$2 returning *`,
    [userId, id, patch.status ?? null, patch.providerJobId ?? null, patch.providerSessionId ?? null, patch.videoUrl ?? null, patch.previewImageUrl ?? null, patch.durationSeconds ?? null, patch.progress ?? null, patch.errorMessage ?? null, patch.request ?? {}],
  );
  return result.rows[0] ?? null;
}

export async function updateDigitalHumanVideoJobById(id: string, patch: { status?: DigitalHumanVideoJob["status"]; providerJobId?: string; providerSessionId?: string; videoUrl?: string; previewImageUrl?: string; durationSeconds?: number; progress?: number; errorMessage?: string | null; request?: Record<string, unknown> }) {
  const result = await query<DigitalHumanVideoJob>(
    `update digital_human_video_jobs set status=coalesce($2,status),provider_job_id=coalesce($3,provider_job_id),provider_session_id=coalesce($4,provider_session_id),
       video_url=coalesce($5,video_url),preview_image_url=coalesce($6,preview_image_url),duration_seconds=coalesce($7,duration_seconds),
       progress=coalesce($8,progress),error_message=$9,request_json=request_json||$10::jsonb,updated_at=now(),
       completed_at=case when $2='completed' then now() else completed_at end where id=$1 returning *`,
    [id, patch.status ?? null, patch.providerJobId ?? null, patch.providerSessionId ?? null, patch.videoUrl ?? null, patch.previewImageUrl ?? null, patch.durationSeconds ?? null, patch.progress ?? null, patch.errorMessage ?? null, patch.request ?? {}],
  );
  return result.rows[0] ?? null;
}

export async function listDigitalHumanVideoJobs(userId: string) {
  const result = await query<DigitalHumanVideoJob & { asset_name: string }>(
    `select job.*,asset.name as asset_name from digital_human_video_jobs job join digital_human_assets asset on asset.id=job.asset_id where job.user_id=$1 order by job.created_at desc limit 50`, [userId],
  );
  return result.rows;
}

export async function getDigitalHumanVideoJob(userId: string, id: string) {
  const result = await query<DigitalHumanVideoJob & { provider_job_id: string | null; provider_session_id: string | null }>(`select * from digital_human_video_jobs where user_id=$1 and id=$2`, [userId, id]);
  return result.rows[0] ?? null;
}

export async function listCreatorVoices(userId: string) {
  const result = await query<{ id: string; provider: "heygen" | "chanjing"; name: string; status: "creating" | "ready" | "failed" | "disabled"; provider_voice_id: string | null; preview_audio_url: string | null; error_message: string | null; metadata_json: Record<string, unknown> }>(`select id,provider,name,status,provider_voice_id,preview_audio_url,error_message,metadata_json from digital_human_voice_assets where user_id=$1 order by created_at desc`, [userId]);
  return result.rows;
}

export async function removePublicVoiceFavorite(userId: string, id: string) {
  const result = await query<{ id: string }>(`delete from digital_human_voice_assets where user_id=$1 and id=$2 and metadata_json->>'source'='public_favorite' returning id`, [userId, id]);
  return result.rows[0] ?? null;
}

export async function insertCreatorVoice(input: { userId: string; name: string; referenceUrl: string; providerVoiceId: string }) {
  const result = await query<{ id: string }>(`insert into digital_human_voice_assets(user_id,provider,name,provider_voice_id,reference_audio_url,consent_confirmed_at) values($1,'chanjing',$2,$3,$4,now()) returning id`, [input.userId, input.name, input.providerVoiceId, input.referenceUrl]);
  return result.rows[0];
}

export async function savePublicVoice(input: { userId: string; provider: DigitalHumanProvider; name: string; providerVoiceId: string; previewUrl: string }) {
  const result = await query<{ id: string }>(`insert into digital_human_voice_assets(user_id,provider,name,status,provider_voice_id,preview_audio_url,consent_confirmed_at,metadata_json)
    values($1,$2,$3,'ready',$4,$5,now(),'{"source":"public_favorite"}'::jsonb)
    on conflict(user_id,provider,provider_voice_id) where provider_voice_id is not null do update set name=excluded.name,status='ready',preview_audio_url=coalesce(excluded.preview_audio_url,digital_human_voice_assets.preview_audio_url),metadata_json=digital_human_voice_assets.metadata_json||excluded.metadata_json,updated_at=now()
    returning id`, [input.userId, input.provider, input.name, input.providerVoiceId, input.previewUrl || null]);
  return result.rows[0];
}

export async function listTemplateFavorites(userId: string) {
  const result = await query<{ collection: "expressive" | "production"; template_id: string; template_json: Record<string, unknown> }>(`select collection,template_id,template_json from digital_human_template_favorites where user_id=$1 order by created_at desc`, [userId]);
  return result.rows;
}

export async function saveTemplateFavorite(input: { userId: string; collection: "expressive" | "production"; templateId: string; template: Record<string, unknown> }) {
  const result = await query<{ id: string }>(`insert into digital_human_template_favorites(user_id,collection,template_id,template_json) values($1,$2,$3,$4)
    on conflict(user_id,collection,template_id) do update set template_json=excluded.template_json returning id`, [input.userId, input.collection, input.templateId, input.template]);
  return result.rows[0];
}

export async function removeTemplateFavorite(userId: string, collection: "expressive" | "production", templateId: string) {
  await query(`delete from digital_human_template_favorites where user_id=$1 and collection=$2 and template_id=$3`, [userId, collection, templateId]);
}

export async function updateCreatorVoice(userId: string, id: string, patch: { status: "creating" | "ready" | "failed"; previewUrl?: string; error?: string }) {
  const result = await query(`update digital_human_voice_assets set status=$3,preview_audio_url=coalesce($4,preview_audio_url),error_message=$5,updated_at=now() where user_id=$1 and id=$2 returning id`, [userId, id, patch.status, patch.previewUrl || null, patch.error || null]);
  return result.rows[0] ?? null;
}

export async function activateChanjingTemplate(input: { userId: string; personId: string; name: string; figureType: string; voiceId: string; coverUrl: string; previewUrl: string; width: number; height: number }) {
  const result = await query<DigitalHumanAsset>(`insert into digital_human_assets(user_id,provider,name,status,source_type,provider_avatar_id,provider_voice_id,preview_image_url,preview_video_url,consent_confirmed_at,metadata_json)
    values($1,'chanjing',$2,'ready','video',$3,$4,$5,$6,now(),$7)
    on conflict(user_id,provider,provider_avatar_id) where provider_avatar_id is not null do update set name=excluded.name,status='ready',provider_voice_id=excluded.provider_voice_id,preview_image_url=coalesce(excluded.preview_image_url,digital_human_assets.preview_image_url),preview_video_url=excluded.preview_video_url,metadata_json=digital_human_assets.metadata_json||excluded.metadata_json,updated_at=now()
    returning ${assetColumns}`, [input.userId, input.name, input.personId, input.voiceId || null, input.coverUrl || null, input.previewUrl || null, { source: "public", figure_type: input.figureType, width: input.width, height: input.height }]);
  return result.rows[0];
}
