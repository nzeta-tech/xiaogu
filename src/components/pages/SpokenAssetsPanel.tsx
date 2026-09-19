"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { apiPath, appPath } from "@/lib/client/url";
import { SpokenVoicesPanel, type SpokenVoice } from "./SpokenVoicesPanel";
import styles from "./spoken-assets.module.css";

type Photo = { id: string; name: string; url: string; source_type: string };
type PortraitTemplate = { id: string; name: string; description: string; category: string; figureType: string; imageUrl: string };
function useFilePreview(file: File | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) { setUrl(""); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function SpokenAssetsPanel() {
  const [tab, setTab] = useState<"photos" | "voices">("photos");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [templates, setTemplates] = useState<PortraitTemplate[]>([]);
  const [voices, setVoices] = useState<SpokenVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [photoToDelete, setPhotoToDelete] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [directFile, setDirectFile] = useState<File | null>(null);
  const [directName, setDirectName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [resultName, setResultName] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [visibleCount, setVisibleCount] = useState(12);
  const savedPhotosRef = useRef<HTMLDivElement | null>(null);
  const directPreview = useFilePreview(directFile);
  const facePreview = useFilePreview(faceFile);
  const selectedTemplate = templates.find((item) => item.id === selectedId);
  const categories = useMemo(() => ["全部", ...new Set(templates.map((item) => item.category).filter(Boolean))], [templates]);
  const filtered = useMemo(() => templates.filter((item) => {
    if (category !== "全部" && item.category !== category) return false;
    return `${item.name} ${item.description} ${item.category}`.toLocaleLowerCase("zh-CN").includes(query.trim().toLocaleLowerCase("zh-CN"));
  }), [templates, category, query]);

  const load = useCallback(async () => {
    const [photoResponse, voiceResponse] = await Promise.all([fetch(apiPath("/api/spoken-photos"), { cache: "no-store" }), fetch(apiPath("/api/spoken-voices"), { cache: "no-store" })]);
    if (!photoResponse.ok || !voiceResponse.ok) throw new Error("资产加载失败，请刷新重试");
    const [photoData, voiceData] = await Promise.all([photoResponse.json(), voiceResponse.json()]);
    setPhotos(photoData.photos || []);
    setTemplates(photoData.templates || []);
    setVoices(voiceData.voices || []);
    setLoading(false);
  }, []);
  useEffect(() => { void load().catch((cause) => { setLoading(false); setError(cause instanceof Error ? cause.message : "资产加载失败"); }); }, [load]);
  useEffect(() => { if (!voices.some((voice) => voice.status === "creating")) return; const timer = window.setInterval(() => void load().catch(() => {}), 5000); return () => window.clearInterval(timer); }, [voices, load]);
  useEffect(() => { setVisibleCount(12); }, [query, category]);

  async function savePhoto(action: "upload" | "swap") {
    setBusy(action); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.append("action", action);
      form.append("consent", "true");
      if (action === "upload") {
        if (!directFile) throw new Error("请先选择照片");
        form.append("name", directName.trim() || directFile.name.replace(/\.[^.]+$/, "") || "我的口播照片");
        form.append("file", directFile);
      } else {
        if (!selectedTemplate) throw new Error("请先选择口播模板");
        form.append("name", resultName.trim() || `${selectedTemplate.name}换脸`);
        form.append("templateId", selectedTemplate.id);
        if (!faceFile) throw new Error("请先上传换脸照片");
        form.append("facePhoto", faceFile);
      }
      const response = await fetch(apiPath("/api/spoken-photos"), { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "照片保存失败");
      await load();
      if (action === "upload") { setDirectFile(null); setDirectName(""); }
      else { setFaceFile(null); setResultName(""); }
      setNotice(action === "swap" ? "换脸已完成，照片已保存到我的口播照片" : "照片已保存到我的口播照片");
      window.setTimeout(() => savedPhotosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "照片保存失败"); }
    finally { setBusy(""); }
  }

  async function deletePhoto(id: string) {
    setBusy(`delete:${id}`); setError(""); setNotice("");
    try {
      const response = await fetch(apiPath("/api/spoken-photos"), { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除照片失败");
      await load(); setPhotoToDelete(""); setNotice("照片已从我的口播照片移除");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除照片失败"); }
    finally { setBusy(""); }
  }

  return <section className={styles.panel}>
    <div className={styles.topBar}><nav className={styles.tabs} aria-label="口播资产分类"><button type="button" className={tab === "photos" ? styles.active : ""} onClick={() => setTab("photos")}>我的口播照片</button><button type="button" className={tab === "voices" ? styles.active : ""} onClick={() => setTab("voices")}>我的声音库</button></nav><a className={styles.videoLink} href={appPath("/apps/digital-human-video")}>去生成口播视频 →</a></div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {loading ? <div className={styles.empty}>正在加载口播资产…</div> : tab === "photos" ? <>
      <div className={styles.sectionHeading} ref={savedPhotosRef}><div><h4>已保存的口播照片</h4><p>这些照片可在“口播视频生成”的第一步直接选择。</p></div><span>{photos.length} 张</span></div>
      {photos.length ? <div className={styles.savedGrid}>{photos.map((item) => <article key={item.id}><img loading="lazy" src={item.url} alt={item.name}/><strong>{item.name}</strong><small>{item.source_type === "face_swap" ? "换脸生成" : item.source_type === "template" ? "人物模板" : item.source_type === "chanjing" ? "历史禅境照片" : "上传照片"}</small>{photoToDelete === item.id ? <div className={styles.deleteConfirm}><span>从照片库移除？</span><button type="button" className={styles.danger} disabled={!!busy} onClick={() => void deletePhoto(item.id)}>{busy === `delete:${item.id}` ? "删除中…" : "确认删除"}</button><button type="button" disabled={!!busy} onClick={() => setPhotoToDelete("")}>取消</button></div> : <button type="button" className={styles.deleteTrigger} disabled={!!busy} onClick={() => setPhotoToDelete(item.id)}>删除</button>}</article>)}</div> : <p className={styles.empty}>还没有口播照片。上传现有照片，或从右侧人物封面创建一张。</p>}
      <div className={styles.sectionHeading}><div><h4>创建口播照片</h4><p>上传已有照片，或从小谷的人物封面库选一张换脸。</p></div></div>
      <div className={styles.columns}>
        <section className={styles.creationCard}><div className={styles.cardHead}><span className={styles.stepNumber}>1</span><div><h4>上传现有口播照片</h4><p>已有满意的正面口播照片，可直接保存使用。</p></div></div>
          <label className={styles.uploadZone}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => { setDirectFile(event.target.files?.[0] || null); event.target.value = ""; }}/>{directPreview ? <img src={directPreview} alt="待上传照片预览"/> : <span>＋<strong>选择照片</strong><small>JPG、PNG、WebP，最大 15 MB</small></span>}</label>
          {directFile ? <p className={styles.fileName}>{directFile.name}</p> : null}
          <label className={styles.field}>照片名称<input value={directName} maxLength={80} onChange={(event) => setDirectName(event.target.value)} placeholder="不填则使用文件名"/></label>
          <button className={styles.primary} type="button" disabled={!directFile || !!busy} onClick={() => void savePhoto("upload")}>{busy === "upload" ? "正在保存…" : "保存口播照片"}</button>
        </section>
        <section className={styles.creationCard}><div className={styles.cardHead}><span className={styles.stepNumber}>2</span><div><h4>从口播模板换脸</h4><p>选人物封面，上传本人的脸部照片，生成新的口播照片。</p></div></div>
          <div className={styles.templateTools}><input aria-label="搜索人物模板" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索人物、风格"/><select aria-label="筛选人物分类" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
          <p className={styles.resultCount}>人物封面 {filtered.length} 张 · 已选 {selectedTemplate ? selectedTemplate.name : "无"}</p>
          <div className={styles.templateGrid}>{filtered.slice(0, visibleCount).map((item) => <button type="button" key={item.id} aria-pressed={selectedId === item.id} className={`${styles.templateCard} ${selectedId === item.id ? styles.selected : ""}`} onClick={() => { setSelectedId(item.id); setResultName(""); }}><img loading="lazy" src={item.imageUrl} alt={item.name}/><strong>{item.name}</strong><small>{item.category}</small></button>)}</div>
          {filtered.length === 0 ? <p className={styles.empty}>没有找到匹配的人物封面。</p> : null}
          {filtered.length > visibleCount ? <button type="button" className={styles.more} onClick={() => setVisibleCount((count) => count + 12)}>查看更多人物</button> : null}
          {selectedTemplate ? <div className={styles.selectedInfo}><strong>已选择：{selectedTemplate.name}</strong><span>{selectedTemplate.description || selectedTemplate.category}</span></div> : null}
          <div className={styles.swapInputs}><label className={styles.uploadZone}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setFaceFile(event.target.files?.[0] || null); event.target.value = ""; }}/>{facePreview ? <img src={facePreview} alt="换脸照片预览"/> : <span>＋<strong>上传换脸照片</strong><small>清晰正面照效果更好</small></span>}</label>{selectedTemplate && facePreview ? <div className={styles.sourcePreview}><img src={selectedTemplate.imageUrl} alt="模板原照片"/><small>模板原照片</small></div> : null}</div>
          <label className={styles.field}>生成后名称<input value={resultName} maxLength={80} onChange={(event) => setResultName(event.target.value)} placeholder={selectedTemplate ? `${selectedTemplate.name}换脸` : "选择模板后填写"}/></label>
          <div className={styles.actions}><button type="button" className={styles.primary} disabled={!selectedTemplate || !faceFile || !!busy} onClick={() => void savePhoto("swap")}>{busy === "swap" ? "正在换脸…" : "换脸并保存"}</button></div>
        </section>
      </div>
    </> : <SpokenVoicesPanel voices={voices} onRefresh={load}/> }
  </section>;
}
