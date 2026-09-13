"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiPath, appPath } from "@/lib/client/url";
import { usePageMeta } from "@/lib/client/page-meta";
import type {
  DigitalHumanAsset,
  DigitalHumanEdition,
  DigitalHumanProvider,
  DigitalHumanTemplate,
  DigitalHumanVideoJob,
  DigitalHumanVoice,
} from "@/lib/digital-human/types";
import {
  digitalHumanBackgroundScenes,
  digitalHumanSceneReferences,
} from "@/lib/digital-human/scene-research-catalog";
import type { DigitalHumanCreativePlan, DigitalHumanCreationMode } from "@/lib/digital-human/creative-plan";

type Payload = {
  assets: DigitalHumanAsset[];
  jobs: DigitalHumanVideoJob[];
  providers: Record<DigitalHumanProvider, boolean>;
  error?: string;
};
type ResourcePayload = {
  templates: DigitalHumanTemplate[];
  voices: DigitalHumanVoice[];
  error?: string;
};
type LookOption = {
  id: string;
  name: string;
  status: string;
  previewImageUrl: string;
  previewVideoUrl: string;
  width?: number;
  height?: number;
};
type VideoTemplateOption = {
  id: string;
  collection: "expressive" | "production";
  name: string;
  category: string;
  categories: string[];
  aspectRatio: "9:16" | "16:9";
  width: number;
  height: number;
  durationSeconds: number | null;
  structure: string[];
  coverUrl: string;
  previewUrl: string;
};
async function json<T>(response: Response, label: string) {
  const text = await response.text();
  if (!text.trim())
    throw new Error(`${label}没有返回内容（HTTP ${response.status}）`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label}返回格式异常（HTTP ${response.status}）`);
  }
}

function jobMediaUrl(jobId: string, options?: { poster?: boolean; download?: boolean }) {
  const query = new URLSearchParams();
  if (options?.poster) query.set("asset", "poster");
  if (options?.download) query.set("download", "1");
  return apiPath(`/api/digital-human-videos/${encodeURIComponent(jobId)}/media${query.size ? `?${query}` : ""}`);
}

export function DigitalHumanVideoPageClient() {
  const [payload, setPayload] = useState<Payload>({
    assets: [],
    jobs: [],
    providers: { heygen: false, chanjing: false },
  });
  const [assetId, setAssetId] = useState("");
  const [edition, setEdition] = useState<DigitalHumanEdition>("standard");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [creationMode, setCreationMode] = useState<DigitalHumanCreationMode>("quick");
  const [creativePlan, setCreativePlan] = useState<DigitalHumanCreativePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [resources, setResources] = useState<ResourcePayload>({
    templates: [],
    voices: [],
  });
  const [voiceId, setVoiceId] = useState("");
  const [showVoices, setShowVoices] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [backgroundType, setBackgroundType] = useState<
    "original" | "color" | "url"
  >("color");
  const [backgroundColor, setBackgroundColor] = useState("#F5F2EC");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [compositionReferenceId, setCompositionReferenceId] = useState(
    "composition-office-seated",
  );
  const [visualStyleReferenceId, setVisualStyleReferenceId] = useState("");
  const [videoTemplate, setVideoTemplate] =
    useState<VideoTemplateOption | null>(null);
  const [looks, setLooks] = useState<LookOption[]>([]);
  const [lookId, setLookId] = useState("");
  const [previewJob, setPreviewJob] = useState<DigitalHumanVideoJob | null>(
    null,
  );
  const loadingJobsRef = useRef(false);
  usePageMeta({
    title: "数字人视频 · 创作广场",
    description: "选择数字人，把口播文案生成视频",
  });
  async function load(silent = false) {
    if (loadingJobsRef.current) return;
    loadingJobsRef.current = true;
    if (!silent) setLoading(true);
    try {
      const response = await fetch(apiPath("/api/digital-human-videos"));
      const data = await json<Payload>(response, "数字人服务");
      if (!response.ok) throw new Error(data.error || "数字人视频暂时无法加载");
      setPayload(data);
    } catch (cause) {
      if (!silent)
        setError(
          cause instanceof Error ? cause.message : "数字人视频暂时无法加载",
        );
    } finally {
      loadingJobsRef.current = false;
      if (!silent) setLoading(false);
    }
  }
  async function loadResources() {
    try {
      const response = await fetch(apiPath("/api/digital-human-resources"));
      const data = await json<ResourcePayload>(response, "资源服务");
      if (!response.ok) throw new Error(data.error || "声音库加载失败");
      setResources(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "声音库加载失败");
    }
  }
  const hasProcessingJobs = payload.jobs.some((job) => job.status === "processing");
  // Initial network hydration intentionally updates this client page's local state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!hasProcessingJobs) return;
    let active = true;
    const refresh = () => { if (active) void load(true); };
    refresh();
    const timer = window.setInterval(refresh, 4000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [hasProcessingJobs]);
  // Deep links from the asset and sound libraries hydrate the intended choices.
  useEffect(() => {
    void Promise.resolve().then(() => {
      const params = new URLSearchParams(window.location.search);
      const requestedAsset = params.get("assetId") || "";
      const requestedVoice = params.get("voiceId") || "";
      const requestedScript = params.get("script") || "";
      const requestedTitle = params.get("title") || "";
      if (requestedAsset) setAssetId(requestedAsset);
      if (requestedScript) setScript(requestedScript.slice(0,5000));
      if (requestedTitle) setTitle(requestedTitle.slice(0,100));
      if (requestedVoice) {
        setVoiceId(requestedVoice);
        setShowVoices(true);
        void loadResources();
      }
    });
  }, []);
  const resolvedId = payload.assets.some((asset) => asset.id === assetId)
    ? assetId
    : payload.assets[0]?.id || "";
  const selected = payload.assets.find((asset) => asset.id === resolvedId);
  const availableEditions = selected?.editions?.filter((item) => item.status === "ready" && item.reviewStatus === "approved") ?? [];
  const resolvedEdition: DigitalHumanEdition = availableEditions.some((item) => item.edition === edition) ? edition : availableEditions[0]?.edition || "standard";
  const selectedEditionSummary=availableEditions.find(item=>item.edition===resolvedEdition);
  const canReplaceBackground = selectedEditionSummary?.supportsLooks === true || selectedEditionSummary?.supportsRemoveBackground === true;
  // Switching identities hydrates that identity's saved scene preset.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const saved = selected?.metadata_json?.default_background as
      | { type?: "original" | "color" | "url"; color?: string; url?: string }
      | undefined;
    setBackgroundType(
      canReplaceBackground ? saved?.type || "color" : "original",
    );
    setBackgroundColor(saved?.color || "#F5F2EC");
    setBackgroundUrl(saved?.url || "");
  }, [selected, canReplaceBackground]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setLookId("");
    setLooks([]);
    if (!selected || !selectedEditionSummary?.supportsLooks) return;
    const controller = new AbortController();
    void fetch(
      apiPath(
        `/api/avatar/digital-human-looks?assetId=${encodeURIComponent(selected.id)}&edition=${resolvedEdition}`,
      ),
      { signal: controller.signal },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { looks?: LookOption[] } | null) => {
        if (data?.looks)
          setLooks(data.looks.filter((item) => item.status === "completed"));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [selected?.id, resolvedEdition, selectedEditionSummary?.supportsLooks]);
  const voices = useMemo(
    () =>
      Array.from(
        resources.voices
          .filter(
            (voice) =>
              voice.provider === selected?.provider &&
              voice.status === "ready" &&
              voice.source === "creator",
          )
          .reduce((items, voice) => {
            if (!items.has(voice.provider_voice_id))
              items.set(voice.provider_voice_id, voice);
            return items;
          }, new Map<string, DigitalHumanVoice>())
          .values(),
      ),
    [resources.voices, selected?.provider],
  );
  const selectedVoice = voices.find(
    (voice) => voice.provider_voice_id === voiceId,
  );
  async function planSmartVideo() {
    if (script.trim().length < 5) {
      setError("请先填写完整的口播文案");
      return;
    }
    setPlanning(true);
    setError("");
    try {
      const response = await fetch(apiPath("/api/digital-human-videos/plan"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ script, aspectRatio, templateName: videoTemplate?.name }),
      });
      const data = await json<{ plan?: DigitalHumanCreativePlan; error?: string }>(response, "分镜服务");
      if (!response.ok || !data.plan) throw new Error(data.error || "视频分镜生成失败");
      setCreativePlan(data.plan);
      setNotice("视频分镜已生成，口播文案保持逐字锁定。确认后即可生成。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "视频分镜生成失败");
    } finally {
      setPlanning(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    if (creationMode === "smart" && !creativePlan) {
      setBusy(false);
      setError("请先生成并确认视频分镜");
      return;
    }
    const composition = digitalHumanSceneReferences.find(
      (item) =>
        item.id === compositionReferenceId && item.kind === "composition",
    );
    const visualStyle = digitalHumanSceneReferences.find(
      (item) =>
        item.id === visualStyleReferenceId && item.kind === "visual-style",
    );
    const serializeReference = (
      reference: (typeof digitalHumanSceneReferences)[number] | undefined,
    ) =>
      reference
        ? {
            id: reference.id,
            name: reference.name,
            category: reference.category,
            aspectRatio: reference.aspectRatio,
            kind: reference.kind,
            providerStyleId: reference.providerStyleId,
          }
        : undefined;
    const selectedLookId = lookId || looks[0]?.id;
    try {
      const response = await fetch(apiPath("/api/digital-human-videos"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creationMode,
          creativePlan: creationMode === "smart" ? creativePlan : undefined,
          assetId: resolvedId,
          edition: resolvedEdition,
          lookId: selectedLookId || undefined,
          title,
          script,
          aspectRatio,
          subtitleEnabled,
          voiceId: selectedVoice?.provider_voice_id,
          voiceName: selectedVoice?.name,
          voiceSource: selectedVoice?.source || "avatar",
          backgroundType,
          backgroundColor,
          backgroundUrl,
          videoTemplate: creationMode === "smart" && videoTemplate
            ? {
                id: videoTemplate.id,
                collection: videoTemplate.collection,
                name: videoTemplate.name,
                category: videoTemplate.category,
                aspectRatio: videoTemplate.aspectRatio,
                structure: videoTemplate.structure,
              }
            : undefined,
          compositionReference: creationMode === "smart" ? serializeReference(composition) : undefined,
          visualStyleReference: creationMode === "smart" ? serializeReference(visualStyle) : undefined,
        }),
      });
      const data = await json<Payload>(response, "生成服务");
      if (!response.ok) throw new Error(data.error || "视频任务提交失败");
      setNotice("视频任务已提交，可离开页面，稍后回来查看结果。");
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "视频任务提交失败");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="digitalHumanVideoPage">
        <div className="digitalHumanLoading">正在加载数字人资产…</div>
      </main>
    );
  return (
    <main className="digitalHumanVideoPage">
      <header className="digitalHumanHero">
        <div>
          <span>创作广场 · 短视频</span>
          <h1>数字人视频</h1>
          <p>
            选择你的数字分身，将口播文案生成视频；形象、声音与任务调度由小谷自动处理。
          </p>
        </div>
        <a href={appPath("/avatar?tab=visual&asset=digital-humans")}>
          管理数字人资产
        </a>
      </header>
      {error ? <div className="alertPanel">{error}</div> : null}
      {notice ? <div className="successPanel">{notice}</div> : null}
      <div className="digitalHumanWorkbench">
        <form className="digitalHumanComposer" onSubmit={submit}>
          <div className="digitalHumanModePicker" role="tablist" aria-label="选择创作方式">
            <button className={creationMode === "quick" ? "active" : ""} onClick={() => { setCreationMode("quick"); setCreativePlan(null); }} role="tab" type="button">
              <strong>快速生成</strong><span>原生合成成片，不做二次转码</span>
            </button>
            <button className={creationMode === "smart" ? "active" : ""} onClick={() => { setCreationMode("smart"); setCreativePlan(null); }} role="tab" type="button">
              <strong>智能创作</strong><span>锁定原文，自动设计分镜与画面节奏</span>
            </button>
            <a href={appPath(`/workbuddy?mode=video&objective=${encodeURIComponent(title || "把我的定稿口播文案制作成数字人视频，原文逐字不变")}`)}>在 WorkBuddy 中创作 →</a>
          </div>
          {creationMode === "smart" ? <div className="digitalHumanLockedCopyNotice"><strong>口播文案已启用锁定保护</strong><span>生成服务先完成人物、声音、字幕与背景；小谷再追加知识卡、分镜节奏和视觉包装，不会改写口播原文。</span></div> : <div className="digitalHumanLockedCopyNotice"><strong>直接生成数字人口播成片</strong><span>人物、声音、字幕、背景和画幅由当前生成通道原生完成，不经过小谷二次视觉合成。</span></div>}
          {creationMode === "smart" ? <section>
            <Step
              number="1"
              title="选择成片模板"
              hint="先定内容结构和画面方向，也可以自由创作"
            />
            <VideoTemplatePicker
              selected={videoTemplate}
              onSelect={(template) => {
                setVideoTemplate(template);
                setCreativePlan(null);
                if (template) {
                  setAspectRatio(template.aspectRatio);
                }
              }}
            />
          </section> : null}
          <section>
            <Step
              number={creationMode === "smart" ? "2" : "1"}
              title="选择我的数字人"
              hint="默认使用创建时绑定或自动训练出的声音"
            />
            {payload.assets.length ? (
              <div className="digitalHumanAssetPicker">
                {payload.assets.map((asset) => (
                  <button
                    className={resolvedId === asset.id ? "active" : ""}
                    key={asset.id}
                    onClick={() => {
                      setAssetId(asset.id);
                      setVoiceId("");
                    }}
                    type="button"
                  >
                    {asset.preview_image_url ? (
                      <img alt={asset.name} src={asset.preview_image_url} />
                    ) : (
                      <span className="digitalHumanAvatarFallback">
                        {asset.name.slice(0, 1)}
                      </span>
                    )}
                    <div>
                      <strong>{asset.name}</strong>
                      <small>
                        {asset.provider_voice_id
                          ? "使用数字人原声"
                          : "已绑定默认声音"}
                      </small>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="digitalHumanEmpty">
                <strong>还没有可用的数字人</strong>
                <p>先创建自己的数字分身，或从形象模板库增加一个。</p>
                <a href={appPath("/avatar?tab=visual&asset=digital-humans")}>
                  去新增数字人
                </a>
              </div>
            )}
            {selected ? <div className="digitalHumanEditionPicker"><div><strong>选择生成版本</strong><span>同一条视频会锁定所选版本，不会在生成过程中切换效果。</span></div><div>{(["standard","pro"] as DigitalHumanEdition[]).map((item)=>{const summary=availableEditions.find((candidate)=>candidate.edition===item);return <button className={resolvedEdition===item?"active":""} disabled={!summary} key={item} onClick={()=>{setEdition(item);setVoiceId("");setLookId("");}} type="button"><strong>{item==="pro"?"Pro 版":"标准版"}</strong><small>{summary?item==="pro"?"更精细的形象、声音与造型能力":"适合高频日常口播，生成稳定":"尚未创建"}</small></button>})}</div>{!availableEditions.some((item)=>item.edition==="pro")?<a href={appPath(`/avatar?tab=visual&asset=digital-humans&upgrade=${encodeURIComponent(selected.id)}`)}>升级数字人 Pro →</a>:null}</div> : null}
            {looks.length > 1 ? (
              <div className="digitalHumanLookPicker">
                <div>
                  <strong>选择本次人物造型</strong>
                  <small>同一人物的服装、姿态与画幅版本</small>
                </div>
                <div>
                  {looks.map((look) => (
                    <button
                      className={
                        (lookId || looks[0]?.id) === look.id ? "active" : ""
                      }
                      key={look.id}
                      onClick={() => setLookId(look.id)}
                      type="button"
                    >
                      {look.previewImageUrl ? (
                        <img alt={look.name} src={look.previewImageUrl} />
                      ) : (
                        <span>{look.name.slice(0, 1)}</span>
                      )}
                      <strong>{look.name}</strong>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="digitalHumanOptionalVoice">
              <button
                onClick={() => {
                  const next = !showVoices;
                  setShowVoices(next);
                  if (next && !resources.voices.length) void loadResources();
                }}
                type="button"
              >
                {showVoices ? "收起声音选择" : "需要更换声音？"}
              </button>
              <a href={appPath("/avatar?tab=visual&asset=digital-humans")}>
                管理数字人和声音
              </a>
            </div>
            {showVoices ? (
              <div className="digitalHumanVoiceGrid">
                <article className={!voiceId ? "active" : ""}>
                  <button onClick={() => setVoiceId("")} type="button">
                    <strong>跟随数字人原声</strong>
                    <small>推荐 · 无需重复录入</small>
                  </button>
                </article>
                {voices.map((voice) => (
                  <article
                    className={
                      voiceId === voice.provider_voice_id ? "active" : ""
                    }
                    key={voice.id}
                  >
                    <button
                      onClick={() => setVoiceId(voice.provider_voice_id)}
                      type="button"
                    >
                      <strong>{voice.name}</strong>
                      <small>
                        {voice.source === "creator"
                          ? "我的其他声音"
                          : "精选声音"}
                      </small>
                    </button>
                    {voice.preview_audio_url ? (
                      <audio
                        controls
                        preload="none"
                        src={voice.preview_audio_url}
                      />
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </section>
          <section>
            <Step
              number={creationMode === "smart" ? "3" : "2"}
              title="填写口播内容"
              hint={
                creationMode === "smart" && videoTemplate?.structure.length
                  ? `参考结构：${videoTemplate.structure.join(" / ")}`
                  : selectedVoice
                    ? `当前声音：${selectedVoice.name}`
                    : "未单独选择时使用数字人绑定声音"
              }
            />
            <label>
              视频标题
              <input
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                required
                value={title}
              />
            </label>
            <label>
              口播文案
              <textarea
                maxLength={5000}
                onChange={(e) => { setScript(e.target.value); setCreativePlan(null); }}
                placeholder="粘贴最终确认的口播文案…"
                required
                rows={10}
                value={script}
              />
              <small>{script.length} / 5000</small>
            </label>
          </section>
          {creationMode === "smart" ? (
            <section>
              <Step number="4" title="智能编排视频" hint="保持口播文案原文不变，自动安排段落节奏、重点字幕、知识卡和画面" />
              {creativePlan ? <SmartPlanPreview plan={creativePlan} onRegenerate={() => void planSmartVideo()} /> : <div className="digitalHumanPlanEmpty"><strong>口播文案保持不变</strong><span>先生成可检查的文字编排方案，确认后再提交视频。</span><button disabled={planning || script.trim().length < 5} onClick={() => void planSmartVideo()} type="button">{planning ? "正在智能编排…" : "智能编排视频"}</button></div>}
            </section>
          ) : null}
          <section>
            <Step
              number={creationMode === "smart" ? "5" : "3"}
              title={creationMode === "smart" ? "确认成片设置" : "画面设置"}
              hint={creationMode === "smart" ? "编排方案负责节奏；这里确认背景、人物构图和画幅" : "可选择是否移除原背景，并设置成片环境"}
            />
            <div
              className={
                canReplaceBackground
                  ? "digitalHumanSceneCapability supported"
                  : "digitalHumanSceneCapability limited"
              }
            >
              <strong>
                {canReplaceBackground
                  ? "可选择是否移除原背景，并设置成片环境"
                  : "当前数字人将保留原背景"}
              </strong>
              <span>
                {canReplaceBackground
                  ? "当前数字人支持背景替换；是否应用以你下方的选择为准。"
                  : "当前数字人不具备背景替换能力，因此不会显示不可用的场景选项。"}
              </span>
            </div>
            <DigitalHumanVideoDesign
              showCreativeOptions={creationMode === "smart"}
              canReplaceBackground={canReplaceBackground}
              backgroundColor={backgroundColor}
              backgroundType={backgroundType}
              onBackgroundSelect={(color) => {
                setBackgroundType("color");
                setBackgroundColor(color);
              }}
              onUseOriginal={() => setBackgroundType("original")}
              onUseCustom={() => setBackgroundType("url")}
              compositionReferenceId={compositionReferenceId}
              visualStyleReferenceId={visualStyleReferenceId}
              onCompositionSelect={(item) => {
                setCompositionReferenceId(item.id);
                setAspectRatio(item.aspectRatio);
              }}
              onVisualStyleSelect={(item) =>
                setVisualStyleReferenceId(item?.id || "")
              }
            />
            {backgroundType === "url" && canReplaceBackground ? (
              <label>
                自定义背景地址
                <input
                  onChange={(e) => setBackgroundUrl(e.target.value)}
                  placeholder="HTTPS JPG / PNG 背景地址"
                  required
                  type="url"
                  value={backgroundUrl}
                />
              </label>
            ) : null}
            <div className="digitalHumanOptions">
              <label>
                画面比例
                <select
                  onChange={(e) =>
                    { setAspectRatio(e.target.value as "9:16" | "16:9"); setCreativePlan(null); }
                  }
                  value={aspectRatio}
                >
                  <option value="9:16">竖屏 9:16</option>
                  <option value="16:9">横屏 16:9</option>
                </select>
              </label>
              <label className="digitalHumanSwitch">
                <input
                  checked={subtitleEnabled}
                  onChange={(e) => setSubtitleEnabled(e.target.checked)}
                  type="checkbox"
                />
                <span>生成字幕</span>
              </label>
            </div>
          </section>
          <button
            className="digitalHumanSubmit"
            disabled={
              busy ||
              !resolvedId ||
              !selected || !availableEditions.length
            }
            type="submit"
          >
            {busy ? "正在提交…" : creationMode === "smart" ? "按分镜生成视频" : "生成数字人视频"}
          </button>
        </form>
        <aside className="digitalHumanJobs">
          <div>
            <span>生成记录</span>
            <strong>{payload.jobs.length} 个任务</strong>
          </div>
          {payload.jobs.length ? (
            payload.jobs.map((job) => (
              <article key={job.id}>
                {job.video_url ? (
                  <button
                    aria-label={`播放${job.title}`}
                    className="digitalHumanJobPreview"
                    onClick={() => setPreviewJob(job)}
                    type="button"
                  >
                    {job.preview_image_url ? (
                      <img alt="" src={jobMediaUrl(job.id, { poster: true })} />
                    ) : (
                      <span>▶</span>
                    )}
                    <i>▶</i>
                  </button>
                ) : (
                  <div>
                    {job.preview_image_url ? (
                      <img alt="视频预览" src={jobMediaUrl(job.id, { poster: true })} />
                    ) : (
                      <span>{job.progress}%</span>
                    )}
                  </div>
                )}
                <section>
                  <small>{job.asset_name} · {job.edition === "pro" ? "Pro 版" : "标准版"}</small>
                  <strong>{job.title}</strong>
                  <p>
                    {job.status === "completed"
                      ? "已完成"
                      : job.status === "failed"
                        ? job.error_message || "生成失败"
                        : stageLabel(job.request_json?.stage, job.progress)}
                  </p>
                  {job.status === "processing" ? (
                    <div className="digitalHumanJobProgress" aria-label={`生成进度 ${job.progress}%`}>
                      <i style={{ width: `${Math.max(3, Math.min(job.progress, 100))}%` }} />
                      <span>{job.progress}%</span>
                    </div>
                  ) : null}
                  {job.request_json?.creative_summary?.length ? (
                    <details className="digitalHumanCreativeTrace">
                      <summary>查看创作过程</summary>
                      <ol>
                        {job.request_json.creative_summary.map(
                          (item, index) => (
                            <li key={`${job.id}:${index}`}>{item}</li>
                          ),
                        )}
                      </ol>
                    </details>
                  ) : null}
                  {job.video_url ? (
                    <button
                      className="digitalHumanJobPlay"
                      onClick={() => setPreviewJob(job)}
                      type="button"
                    >
                      播放成片
                    </button>
                  ) : null}
                </section>
              </article>
            ))
          ) : (
            <div className="digitalHumanJobsEmpty">
              生成后的任务会出现在这里。
            </div>
          )}
        </aside>
      </div>
      {previewJob?.video_url ? createPortal(
        <div
          aria-label={`${previewJob.title}视频预览`}
          aria-modal="true"
          className="digitalHumanResultModal"
          onClick={() => setPreviewJob(null)}
          role="dialog"
        >
          <div onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <small>{previewJob.asset_name}</small>
                <strong>{previewJob.title}</strong>
              </div>
              <button
                aria-label="关闭视频"
                onClick={() => setPreviewJob(null)}
                type="button"
              >
                ×
              </button>
            </header>
            <video
              autoPlay
              controls
              playsInline
              poster={previewJob.preview_image_url ? jobMediaUrl(previewJob.id, { poster: true }) : undefined}
              preload="metadata"
              src={jobMediaUrl(previewJob.id)}
            />
            <footer>
              <span>数字人口播成片</span>
              <a download href={jobMediaUrl(previewJob.id, { download: true })}>
                下载视频
              </a>
            </footer>
          </div>
        </div>, document.body
      ) : null}
    </main>
  );
}
function VideoTemplatePicker({
  selected,
  onSelect,
}: {
  selected: VideoTemplateOption | null;
  onSelect: (template: VideoTemplateOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [collection, setCollection] = useState<"expressive" | "production">(
    "expressive",
  );
  const [category, setCategory] = useState("全部");
  const [aspect, setAspect] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [templates, setTemplates] = useState<VideoTemplateOption[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<VideoTemplateOption | null>(null);
  const [loadError, setLoadError] = useState("");
  // Opening or changing a library filter intentionally starts a fresh page request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    void fetch(apiPath("/api/digital-human-template-favorites"), {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await json<
          { templates: VideoTemplateOption[] } & { error?: string }
        >(response, "我的模板");
        if (!response.ok) throw new Error(data.error || "我的模板加载失败");
        const all = data.templates.filter(
          (template) => template.collection === collection,
        );
        setCategories([
          ...new Set(all.flatMap((template) => template.categories)),
        ]);
        const keyword = search.trim().toLocaleLowerCase("zh-CN");
        const filtered = all.filter(
          (template) =>
            (category === "全部" || template.categories.includes(category)) &&
            (aspect === "all" || template.aspectRatio === aspect) &&
            (!keyword ||
              `${template.name} ${template.categories.join(" ")}`
                .toLocaleLowerCase("zh-CN")
                .includes(keyword)),
        );
        setTotal(filtered.length);
        setTemplates(filtered.slice((page - 1) * 18, page * 18));
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setLoadError(
            cause instanceof Error ? cause.message : "我的模板加载失败",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, collection, category, aspect, search, page]);
  const choose = (template: VideoTemplateOption) => {
    onSelect(template);
    setOpen(false);
    setPreview(null);
  };
  return (
    <div className="xiaoguTemplatePicker">
      {selected ? (
        <article className="xiaoguSelectedTemplate">
          {selected.coverUrl ? (
            <img alt={`${selected.name}模板封面`} src={selected.coverUrl} />
          ) : (
            <span>模</span>
          )}
          <div>
            <em>
              {selected.collection === "expressive" ? "AI 模板" : "成片模板"}
            </em>
            <strong>{selected.name}</strong>
            <small>
              {selected.category} · {selected.aspectRatio}
              {selected.structure.length
                ? ` · ${selected.structure.join(" / ")}`
                : ""}
            </small>
          </div>
          <button onClick={() => setOpen(true)} type="button">
            更换模板
          </button>
          <button onClick={() => onSelect(null)} type="button">
            清除
          </button>
        </article>
      ) : (
        <div className="xiaoguTemplateEntry">
          <div>
            <strong>从我的常用模板开始</strong>
            <span>只展示已收藏模板；选中后带入画幅和内容结构</span>
          </div>
          <button onClick={() => setOpen(true)} type="button">
            选择我的模板
          </button>
          <button
            className="secondary"
            onClick={() => onSelect(null)}
            type="button"
          >
            自由创作
          </button>
        </div>
      )}
      {open
        ? createPortal(
            <div
              className="xiaoguTemplateModal"
              role="dialog"
              aria-modal="true"
              aria-label="选择我的模板"
              onClick={() => setOpen(false)}
            >
              <div onClick={(event) => event.stopPropagation()}>
                <header>
                  <div>
                    <span>我的常用资产</span>
                    <strong>选择已收藏模板</strong>
                    <small>这里只展示你在数字人资产页收藏的模板</small>
                  </div>
                  <button
                    aria-label="关闭模板库"
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    ×
                  </button>
                </header>
                <div className="xiaoguTemplateToolbar">
                  <div role="tablist">
                    <button
                      className={collection === "expressive" ? "active" : ""}
                      onClick={() => {
                        setCollection("expressive");
                        setCategory("全部");
                        setPage(1);
                      }}
                      type="button"
                    >
                      AI 模板
                    </button>
                    <button
                      className={collection === "production" ? "active" : ""}
                      onClick={() => {
                        setCollection("production");
                        setCategory("全部");
                        setPage(1);
                      }}
                      type="button"
                    >
                      模板库
                    </button>
                  </div>
                  <input
                    aria-label="搜索我的模板"
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="搜索已收藏模板"
                    value={search}
                  />
                  <select
                    aria-label="选择画幅"
                    onChange={(event) => {
                      setAspect(event.target.value);
                      setPage(1);
                    }}
                    value={aspect}
                  >
                    <option value="all">全部画幅</option>
                    <option value="9:16">竖屏 9:16</option>
                    <option value="16:9">横屏 16:9</option>
                  </select>
                </div>
                <div className="xiaoguTemplateCategories">
                  <button
                    className={category === "全部" ? "active" : ""}
                    onClick={() => {
                      setCategory("全部");
                      setPage(1);
                    }}
                    type="button"
                  >
                    全部收藏
                  </button>
                  {categories.map((item) => (
                    <button
                      className={category === item ? "active" : ""}
                      key={item}
                      onClick={() => {
                        setCategory(item);
                        setPage(1);
                      }}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {loadError ? (
                  <div className="alertPanel">{loadError}</div>
                ) : null}
                {loading ? (
                  <div className="xiaoguTemplateLoading">正在加载我的模板…</div>
                ) : templates.length ? (
                  <div className="xiaoguTemplateGrid">
                    {templates.map((template) => (
                      <article
                        className={
                          selected?.id === template.id &&
                          selected.collection === template.collection
                            ? "active"
                            : ""
                        }
                        key={`${template.collection}:${template.id}`}
                      >
                        <button
                          className="preview"
                          disabled={!template.previewUrl}
                          onClick={() => setPreview(template)}
                          type="button"
                        >
                          {template.coverUrl ? (
                            <img
                              alt={`${template.name}成片样例`}
                              loading="lazy"
                              src={template.coverUrl}
                            />
                          ) : (
                            <span>暂无封面</span>
                          )}
                          {template.previewUrl ? <i>▶ 预览完整视频</i> : null}
                        </button>
                        <div>
                          <em>{template.category}</em>
                          <b>{template.aspectRatio}</b>
                        </div>
                        <strong>{template.name}</strong>
                        {template.structure.length ? (
                          <small>{template.structure.join(" / ")}</small>
                        ) : (
                          <small>
                            {template.width}×{template.height}
                          </small>
                        )}
                        <button
                          className="choose"
                          onClick={() => choose(template)}
                          type="button"
                        >
                          以此模板开始
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="xiaoguTemplateLoading xiaoguTemplateEmpty">
                    <strong>还没有收藏模板</strong>
                    <span>先从精简模板库收藏常用模板，再回来选择。</span>
                    <a
                      href={appPath(
                        "/avatar?tab=visual&asset=digital-humans&digitalHumanTab=templates",
                      )}
                    >
                      去收藏我的模板 →
                    </a>
                  </div>
                )}
                <footer>
                  <span>共 {total} 个收藏</span>
                  <div>
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((value) => value - 1)}
                      type="button"
                    >
                      上一页
                    </button>
                    <b>
                      {page} / {Math.max(1, Math.ceil(total / 18))}
                    </b>
                    <button
                      disabled={page >= Math.ceil(total / 18)}
                      onClick={() => setPage((value) => value + 1)}
                      type="button"
                    >
                      下一页
                    </button>
                  </div>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
      {preview?.previewUrl
        ? createPortal(
            <div
              className="xiaoguTemplatePreviewModal"
              role="dialog"
              aria-modal="true"
              aria-label={`${preview.name}模板预览`}
              onClick={() => setPreview(null)}
            >
              <div onClick={(event) => event.stopPropagation()}>
                <header>
                  <div>
                    <strong>{preview.name}</strong>
                    <span>
                      {preview.category} · {preview.aspectRatio}
                    </span>
                  </div>
                  <button
                    aria-label="关闭预览"
                    onClick={() => setPreview(null)}
                    type="button"
                  >
                    ×
                  </button>
                </header>
                <video
                  autoPlay
                  controls
                  playsInline
                  poster={preview.coverUrl || undefined}
                  preload="metadata"
                  src={preview.previewUrl}
                />
                <footer>
                  <span>
                    {preview.structure.length
                      ? preview.structure.join(" · ")
                      : "预览模板完整成片效果"}
                  </span>
                  <button onClick={() => choose(preview)} type="button">
                    使用这个模板
                  </button>
                </footer>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
function DigitalHumanVideoDesign({
  showCreativeOptions,
  canReplaceBackground,
  backgroundColor,
  backgroundType,
  onBackgroundSelect,
  onUseOriginal,
  onUseCustom,
  compositionReferenceId,
  visualStyleReferenceId,
  onCompositionSelect,
  onVisualStyleSelect,
}: {
  showCreativeOptions: boolean;
  canReplaceBackground: boolean;
  backgroundColor: string;
  backgroundType: "original" | "color" | "url";
  onBackgroundSelect: (color: string) => void;
  onUseOriginal: () => void;
  onUseCustom: () => void;
  compositionReferenceId: string;
  visualStyleReferenceId: string;
  onCompositionSelect: (
    item: (typeof digitalHumanSceneReferences)[number],
  ) => void;
  onVisualStyleSelect: (
    item: (typeof digitalHumanSceneReferences)[number] | null,
  ) => void;
}) {
  const compositions = digitalHumanSceneReferences.filter(
    (item) => item.kind === "composition",
  );
  const visualStyles = digitalHumanSceneReferences.filter(
    (item) => item.kind === "visual-style",
  );
  const cards = (
    items: typeof digitalHumanSceneReferences,
    selectedId: string,
    onSelect: (item: (typeof digitalHumanSceneReferences)[number]) => void,
  ) => (
    <div className="digitalHumanReferenceGrid">
      {items.map((item) => (
        <button
          className={selectedId === item.id ? "active" : ""}
          key={item.id}
          onClick={() => onSelect(item)}
          type="button"
        >
          <img alt={`${item.name}完整参考图`} src={item.image} />
          <span>
            <em>{item.category}</em>
            <b>{item.aspectRatio}</b>
          </span>
          <strong>{item.name}</strong>
          <small>
            {item.originalName} · {item.tags.join(" · ")}
          </small>
        </button>
      ))}
    </div>
  );
  return (
    <div className="digitalHumanVideoDesign">
      <div className="digitalHumanReferenceHeading">
        <div>
          <strong>4.1 成片环境</strong>
          <small>
            {canReplaceBackground
              ? "保留原背景，或为支持背景替换的数字人设置新环境"
              : "当前数字人不支持背景替换，仅保留原背景"}
          </small>
        </div>
      </div>
      <div className="digitalHumanSceneGrid">
        <button
          className={
            backgroundType === "original" ? "active utility" : "utility"
          }
          onClick={onUseOriginal}
          type="button"
        >
          <i>原</i>
          <strong>保留原背景</strong>
          <small>不替换环境</small>
        </button>
        {canReplaceBackground ? digitalHumanBackgroundScenes.map((scene) => (
          <button
            className={
              backgroundType === "color" && backgroundColor === scene.id
                ? "active"
                : ""
            }
            disabled={!canReplaceBackground}
            key={scene.id}
            onClick={() => onBackgroundSelect(scene.id)}
            type="button"
          >
            <img alt={`${scene.name}背景预览`} src={scene.image} />
            <span>
              <em>{scene.category}</em>
              <strong>{scene.name}</strong>
            </span>
          </button>
        )) : null}
        {canReplaceBackground ? <button
          className={backgroundType === "url" ? "active utility" : "utility"}
          onClick={onUseCustom}
          type="button"
        >
          <i>＋</i>
          <strong>自定义背景</strong>
          <small>使用品牌环境</small>
        </button> : null}
      </div>
      {showCreativeOptions ? <>
      <div className="digitalHumanReferenceHeading">
        <div>
          <strong>4.2 人物构图</strong>
          <small>
            决定人物站姿或坐姿、景别、画面占比与镜头关系；样例人物不会替换你的数字人
          </small>
        </div>
      </div>
      {cards(compositions, compositionReferenceId, onCompositionSelect)}
      <div className="digitalHumanReferenceHeading">
        <div>
          <strong>4.3 视觉风格（可选）</strong>
          <small>
            决定字幕、图形、色彩和整体包装语言，不改变人物身份与构图
          </small>
        </div>
        <button
          className={
            !visualStyleReferenceId ? "active clearStyle" : "clearStyle"
          }
          onClick={() => onVisualStyleSelect(null)}
          type="button"
        >
          不加额外风格
        </button>
      </div>
      {cards(visualStyles, visualStyleReferenceId, (item) =>
        onVisualStyleSelect(item),
      )}</> : null}
    </div>
  );
}
function SmartPlanPreview({ plan, onRegenerate }: { plan: DigitalHumanCreativePlan; onRegenerate: () => void }) {
  return (
    <div className="digitalHumanSmartPlan">
      <header>
        <div><strong>查看并确认方案</strong><span>{plan.scenes.length} 个画面段落 · 预计约 {plan.estimatedDuration} 秒 · {plan.aspectRatio}</span></div>
        <button onClick={onRegenerate} type="button">重新编排</button>
      </header>
      <div className="digitalHumanSmartPlanScenes">
        {plan.scenes.map((scene, index) => (
          <article key={scene.id}>
            <em>{String(index + 1).padStart(2, "0")}</em>
            <div>
              <span>{scene.presentation === "presenter-example" ? "案例画面" : scene.presentation === "presenter-keypoint" ? "重点画面" : "自然口播"} · 约 {scene.durationHint} 秒</span>
              <strong>{scene.spokenText}</strong>
              {scene.overlayText ? <small>画面重点：{scene.overlayText}</small> : <small>{scene.visualDirection}</small>}
            </div>
          </article>
        ))}
      </div>
      <footer><b>✓ 原文锁定校验通过</b><span>所有段落均直接引用原始口播文案，没有新增口播内容。</span></footer>
    </div>
  );
}
function Step({
  number,
  title,
  hint,
}: {
  number: string;
  title: string;
  hint: string;
}) {
  return (
    <div className="digitalHumanStep">
      <em>{number}</em>
      <div>
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
    </div>
  );
}
function stageLabel(stage: string | undefined, progress: number) {
  if (stage === "queued") return "已进入生成队列";
  if (stage === "planning") return `正在适配人物与画面 · ${progress}%`;
  if (stage === "presenter_ready") return `口播母版已完成，准备小谷编排 · ${progress}%`;
  if (stage === "composition_queued") return `口播母版已完成，等待小谷视频 Worker · ${progress}%`;
  if (stage === "downloading_master") return `小谷视频 Worker 正在读取口播母版 · ${progress}%`;
  if (stage === "generating_graphics") return `正在生成分镜图层与重点卡 · ${progress}%`;
  if (stage === "xiaogu_composing") return `小谷正在执行分镜与视觉包装 · ${progress}%`;
  if (stage === "saving_output") return `正在保存最终成片 · ${progress}%`;
  if (stage === "composition_failed") return `智能编排未完成 · ${progress}%`;
  if (stage === "finalizing") return `正在合成并检查成片 · ${progress}%`;
  return `生成中 · ${progress}%`;
}
