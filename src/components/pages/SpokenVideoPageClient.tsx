"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { apiPath, appPath } from "@/lib/client/url";
import styles from "./spoken-video.module.css";
import { SpokenVideoVersions, type SpokenJob } from "./SpokenVideoVersions";
import { SPOKEN_VIDEO_PRICES, type SpokenVideoProductionMode } from "@/lib/digital-human/spoken-video-modes";

type Photo = { id: string; media_id: string; name: string; url: string };
type Voice = { id: string; name: string; provider: "heygen"; status: string; provider_voice_id: string; preview_audio_url: string };
type Job = SpokenJob;
type Payload = { jobs: Job[]; spokenAgent?: { available: boolean; reason: string }; spokenVideoPrices?: typeof SPOKEN_VIDEO_PRICES };
const isActiveJob = (job: Job) => job.status === "processing" || job.status === "queued";
const assetPage = appPath("/avatar?tab=visual&asset=digital-humans");

export function SpokenVideoPageClient() {
  const [view,setView]=useState<"create"|"works">("create");
  const [payload, setPayload] = useState<Payload>({ jobs: [] });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [photoId, setPhotoId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16");
  const [productionMode, setProductionMode] = useState<SpokenVideoProductionMode>("basic");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [jobFilter, setJobFilter] = useState<"all" | "active" | "completed">("all");
  const photoRef = useRef<HTMLElement>(null);
  const voiceRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const submitLockRef = useRef(false);
  const readyVoices = useMemo(() => voices.filter((voice) => voice.provider === "heygen" && voice.status === "ready" && voice.provider_voice_id), [voices]);
  const selectedPhoto = photos.find((photo) => photo.id === photoId);
  const selectedVoice = readyVoices.find((voice) => voice.id === voiceId);
  const selectedPrice = payload.spokenVideoPrices?.[productionMode] ?? SPOKEN_VIDEO_PRICES[productionMode];
  const jobs = useMemo(() => payload.jobs.filter((job) => job.request_json?.workflow === "spoken_video_v1").map((job) => {
    const revision = job.request_json?.postproduction_revision;
    if (!revision) return job;
    const stamp = `rev=${encodeURIComponent(revision)}`;
    return { ...job, video_url: job.video_url ? `${job.video_url}${job.video_url.includes("?") ? "&" : "?"}${stamp}` : null, preview_image_url: job.preview_image_url ? `${job.preview_image_url}${job.preview_image_url.includes("?") ? "&" : "?"}${stamp}` : null };
  }), [payload.jobs]);
  const activeCount = jobs.filter(isActiveJob).length;
  const roots=jobs.filter(job=>!job.request_json?.root_job_id);
  const family=(root:Job)=>jobs.filter(job=>job.id===root.id||job.request_json?.root_job_id===root.id);
  const visibleJobs=roots.filter(root=>jobFilter==="all"||(jobFilter==="active"?family(root).some(isActiveJob):family(root).some(job=>job.status==="completed")));

  const agentReady = payload.spokenAgent?.available === true;
  const canSubmit = !loading && !busy && !uploading && agentReady;

  const load = useCallback(async (initial = false) => {
    try {
      const responses = await Promise.all([fetch(apiPath("/api/digital-human-videos"), { cache: "no-store" }), fetch(apiPath("/api/spoken-photos"), { cache: "no-store" }), fetch(apiPath("/api/spoken-voices"), { cache: "no-store" })]);
      if (responses.some((response) => !response.ok)) throw new Error("加载失败，请重试");
      const [jobsData, photoData, voiceData] = await Promise.all(responses.map((response) => response.json()));
      setPayload(jobsData); setPhotos(photoData.photos || []); setVoices(voiceData.voices || []);
      setPhotoId((current) => current && !(photoData.photos || []).some((photo: Photo) => photo.id === current) ? "" : current);
      setVoiceId((current) => current && !(voiceData.voices || []).some((voice: Voice) => voice.id === current && voice.status === "ready") ? "" : current);
      if (initial) setError("");
    } catch (cause) {
      if (initial) setError(cause instanceof Error ? cause.message : "加载失败，请重试");
    } finally { if (initial) setLoading(false); }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const passedScript = params.get("script"), passedTitle = params.get("title");
    const prefill = window.setTimeout(() => {
      if (passedScript) setScript(passedScript.slice(0, 5000));
      if (passedTitle) setTitle(passedTitle.slice(0, 100));
      void load(true);
    }, 0);
    return () => window.clearTimeout(prefill);
  }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  useEffect(() => {
    if (!activeCount) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 4000);
    return () => window.clearInterval(timer);
  }, [activeCount, load]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!(["image/jpeg", "image/png", "image/webp"].includes(file.type)) || file.size > 15 * 1024 * 1024) { setError("请选择 15 MB 内的 JPG、PNG 或 WebP 照片"); return; }
    setUploading(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.append("action", "upload"); form.append("name", file.name.replace(/\.[^.]+$/, "") || "口播照片"); form.append("consent", "true"); form.append("file", file);
      const response = await fetch(apiPath("/api/spoken-photos"), { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "照片上传失败");
      await load(); setPhotoId(data.photo.id); setNotice("照片已保存并选中，可继续选择声音");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "照片上传失败"); }
    finally { setUploading(false); }
  }
  function validate() {
    if (!selectedPhoto) { setError("请先选择一张口播照片"); photoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); return false; }
    if (!selectedVoice) { setError("请先选择一个可用的声音"); voiceRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); return false; }
    if (title.trim().length < 2) { setError("视频标题至少需要 2 个字"); titleRef.current?.focus(); return false; }
    if (script.trim().length < 5) { setError("口播文案至少需要 5 个字"); scriptRef.current?.focus(); return false; }
    return true;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current || busy) return;
    setError(""); setNotice("");
    if (!validate() || !canSubmit || !selectedPhoto || !selectedVoice) return;
    submitLockRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(apiPath("/api/digital-human-videos"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflow: "spoken_video_v1", productionMode, personSource: "photo", photoId: selectedPhoto.media_id, voiceAssetId: selectedVoice.id, title: title.trim(), script: script.trim(), aspectRatio }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "视频任务提交失败");
      setPhotoId(""); setVoiceId(""); setTitle(""); setScript(""); setAspectRatio("9:16"); setProductionMode("basic");
      setNotice("任务已提交，表单已清空。可在“我的作品”查看制作进度。");
      setJobFilter("all"); setView("works"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "视频任务提交失败"); }
    finally { submitLockRef.current = false; setBusy(false); }
  }

  return <main className={styles.page}>
    <header className={styles.hero}><div><span>视频创作</span><h1>口播视频生成</h1><p>选择照片与声音，填写定稿文案。为你搭配画面与知识点，完成字幕、剪辑和封面。成片还可以继续修改。</p></div><a href={assetPage}>管理照片与声音 →</a></header>
    {!agentReady ? <div className={styles.statusBar}><span className={styles.agentDot}/><strong>{loading ? "正在检查生成服务" : "制作服务暂不可用"}</strong>{!loading ? <span className={styles.agentReason}>{"请稍后重试，已有作品仍可查看和下载"}</span> : null}<button type="button" onClick={() => void load(true)}>刷新状态</button></div> : null}
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    {notice ? <div className={styles.notice} role="status">{notice}</div> : null}
    <nav className={styles.workspaceTabs} aria-label="视频工作区"><button type="button" aria-pressed={view==="create"} onClick={()=>setView("create")}>制作新视频</button><button type="button" aria-pressed={view==="works"} onClick={()=>setView("works")}>我的作品 <span>{roots.length}</span>{activeCount?<i>{activeCount} 条制作中</i>:null}</button></nav>
    <div className={styles.workspace}><form hidden={view!=="create"} className={styles.form} onSubmit={(event) => void submit(event)} aria-busy={busy} noValidate>
      <section ref={photoRef} className={styles.formSection}><div className={styles.step}><b>1</b><div><h2>选择口播照片</h2><p>从我的照片中选一张，或在这里上传新照片</p></div><span className={selectedPhoto ? styles.done : styles.pending}>{selectedPhoto ? "已选择" : "待选择"}</span></div>
        {loading ? <p className={styles.hint}>正在加载口播照片…</p> : <div className={styles.photoGrid}>{photos.map((photo) => <button key={photo.id} type="button" disabled={busy} aria-pressed={photoId === photo.id} className={`${styles.photoCard} ${photoId === photo.id ? styles.selected : ""}`} onClick={() => { setPhotoId(photo.id); setError(""); }}><img loading="lazy" src={photo.url} alt={photo.name}/><strong title={photo.name}>{photo.name}</strong>{photoId === photo.id ? <span className={styles.selectedMark}>✓ 已选</span> : null}</button>)}<button type="button" className={styles.uploadCard} disabled={uploading || busy} onClick={() => uploadRef.current?.click()}><span>＋</span><strong>{uploading ? "正在上传…" : "上传照片"}</strong><small>JPG、PNG、WebP · 15 MB 内</small></button><input ref={uploadRef} className={styles.visuallyHidden} type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传口播照片" disabled={busy} onChange={(event) => void upload(event)}/></div>}
        {!loading && !photos.length ? <p className={styles.hint}>也可以到 <a href={assetPage}>口播资产</a> 从人物封面创建照片。</p> : null}
      </section>
      <section ref={voiceRef} className={styles.formSection}><div className={styles.step}><b>2</b><div><h2>选择声音</h2><p>试听后选择一个已准备好的声音</p></div><span className={selectedVoice ? styles.done : styles.pending}>{selectedVoice ? "已选择" : "待选择"}</span></div>
        {loading ? <p className={styles.hint}>正在加载声音…</p> : readyVoices.length ? <div className={styles.voiceGrid}>{readyVoices.map((voice) => <article className={`${styles.voiceCard} ${voiceId === voice.id ? styles.selected : ""}`} key={voice.id}><button type="button" disabled={busy} aria-pressed={voiceId === voice.id} onClick={() => { setVoiceId(voice.id); setError(""); }}><span className={styles.voiceIcon}>♫</span><span className={styles.voiceDetails}><strong title={voice.name}>{voice.name}</strong><small>我的录制声音</small></span><span className={styles.radio}>{voiceId === voice.id ? "✓" : ""}</span></button>{voice.preview_audio_url ? <audio aria-label={`试听${voice.name}`} controls preload="none" src={voice.preview_audio_url}/> : null}</article>)}</div> : <div className={styles.emptyState}>还没有可用的声音。<a href={assetPage}>去录制我的声音 →</a>{voices.some((voice) => voice.status === "creating") ? <small>已有声音正在准备中，完成后会自动显示。</small> : null}</div>}
      </section>
      <section className={styles.formSection}><div className={styles.step}><b>3</b><div><h2>填写口播内容</h2><p>请使用最终确认的文案，提交后将按原意制作</p></div><span className={title.trim().length >= 2 && script.trim().length >= 5 ? styles.done : styles.pending}>{title.trim().length >= 2 && script.trim().length >= 5 ? "已填写" : "待填写"}</span></div>
        <label className={styles.field}>视频标题<input ref={titleRef} value={title} maxLength={100} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="例如：家庭保障规划的三个关键点"/></label>
        <label className={styles.field}>定稿口播文案<textarea ref={scriptRef} value={script} maxLength={5000} disabled={busy} onChange={(event) => setScript(event.target.value)} rows={9} placeholder="粘贴已经确认的口播文案…"/></label><div className={styles.scriptFoot}><span>会自动去掉 Markdown 标记，不改写文案意思</span><span>{script.length} / 5000 字</span></div>
        <div className={styles.ratioGroup}><span>成片画幅</span><div role="group" aria-label="成片画幅"><button type="button" disabled={busy} aria-pressed={aspectRatio === "9:16"} className={aspectRatio === "9:16" ? styles.selectedRatio : ""} onClick={() => setAspectRatio("9:16")}>▯ 竖屏 9:16</button><button type="button" disabled={busy} aria-pressed={aspectRatio === "16:9"} className={aspectRatio === "16:9" ? styles.selectedRatio : ""} onClick={() => setAspectRatio("16:9")}>▭ 横屏 16:9</button></div></div>
      </section>
      <section className={styles.formSection}><div className={styles.step}><b>4</b><div><h2>选择制作方式</h2><p>基础版完成专业语义混剪，智能版增加官网证据与导演级镜头设计</p></div></div>
        <div className={styles.modeGrid} role="group" aria-label="视频制作方式">
          <button type="button" aria-pressed={productionMode==="basic"} disabled={busy} className={`${styles.modeCard} ${productionMode==="basic"?styles.selected:""}`} onClick={()=>setProductionMode("basic")}><span><strong>基础版</strong><b>{payload.spokenVideoPrices?.basic??SPOKEN_VIDEO_PRICES.basic} 积分</b></span><small>按语义节点组合人物、真实素材和专业知识图解，完成字幕、混剪与成片检查。</small></button>
          <button type="button" aria-pressed={productionMode==="smart"} disabled={busy} className={`${styles.modeCard} ${productionMode==="smart"?styles.selected:""}`} onClick={()=>setProductionMode("smart")}><span><strong>智能版</strong><b>{payload.spokenVideoPrices?.smart??SPOKEN_VIDEO_PRICES.smart} 积分</b></span><small>优先核对官网和权威原始资料，由 AI 导演设计证据、图解、实景与生成式镜头。</small></button>
        </div>
      </section>
      <div className={styles.submitBar}><div><strong>{busy ? "正在创建任务，请稍候" : `准备生成 · ${productionMode==="smart"?"智能版":"基础版"}`}</strong><span>{selectedPhoto?.name || "待选照片"} · {selectedVoice?.name || "待选声音"} · {aspectRatio === "9:16" ? "竖屏" : "横屏"}</span><small className={styles.priceHint}>{selectedPrice} 积分 / 条 · 成功后扣除</small></div><button className={styles.submit} disabled={!canSubmit} type="submit">{busy ? "正在提交…" : "生成口播视频 →"}</button></div>
    </form>
    <section hidden={view!=="works"} className={styles.works}><div className={styles.jobsTitle}><div><h2>我的作品</h2><p>预览、下载，或按你的想法继续调整。每次修改都会保留为新版本。</p></div></div><div className={styles.jobFilters} role="group" aria-label="筛选作品"><button type="button" className={jobFilter==="all"?styles.activeFilter:""} onClick={()=>setJobFilter("all")}>全部作品</button><button type="button" className={jobFilter==="active"?styles.activeFilter:""} onClick={()=>setJobFilter("active")}>制作中</button><button type="button" className={jobFilter==="completed"?styles.activeFilter:""} onClick={()=>setJobFilter("completed")}>可预览</button></div>
      {loading?<p className={styles.hint}>正在加载作品…</p>:visibleJobs.length?visibleJobs.map(root=><SpokenVideoVersions key={root.id} root={root} versions={family(root)} available={agentReady} onRefresh={()=>load()}/>):<div className={styles.emptyState}><p>{roots.length?"这个分类还没有作品":"从第一条视频开始，把你的想法变成作品。"}</p><button type="button" onClick={()=>setView("create")}>制作新视频 →</button></div>}
    </section></div>
  </main>;
}
