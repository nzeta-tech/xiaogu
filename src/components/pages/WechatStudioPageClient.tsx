"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { apiPath, appPath } from "@/lib/client/url";
import { articleDocx } from "@/lib/client/docx";
import { getCreationAppBySlug, type CreationApp } from "@/lib/apps/catalog";

type GeneratedImage = { id: string; url: string; sectionIndex?: number; sectionTitle?: string };

const styles = (getCreationAppBySlug("wechat-images")?.fields.find((field) => field.id === "style")?.options ?? []).map((option, index) => ({
  value: option.value,
  label: option.label,
  description: getWechatStyleDescription(option.value),
  preview: option.previewUrl ?? "/examples/image-card-styles/business.webp",
  recommended: index < 3,
}));

const layouts = [
  { value: "clean", label: "清爽阅读", description: "留白充足，适合专业长文", preview: "/examples/image-card-styles/fresh-card.webp" },
  { value: "magazine", label: "杂志专题", description: "标题突出，图片更有存在感", preview: "/examples/image-card-styles/magazine.webp" },
  { value: "card", label: "卡片分段", description: "章节边界清晰，适合知识内容", preview: "/examples/image-card-styles/flat-knowledge.webp" },
  { value: "notebook", label: "手记叙事", description: "更轻松，适合故事和个人表达", preview: "/examples/image-card-styles/handwritten-notes.webp" },
  { value: "minimal", label: "极简留白", description: "克制安静，适合深度观点", preview: "/examples/image-card-styles/zen.webp" },
  { value: "newspaper", label: "报刊评论", description: "适合行业观察和时事解读", preview: "/examples/image-card-styles/daily.webp" },
  { value: "warm", label: "温暖故事", description: "适合家庭、成长与关系内容", preview: "/examples/image-card-styles/illustration.webp" },
  { value: "dark", label: "深色质感", description: "适合品牌专题和重要观点", preview: "/examples/image-card-styles/dark-pro.webp" },
] as const;

const STYLE_USAGE_KEY = "wechat-studio:style-usage";

export function WechatStudioPageClient({ app }: { app: CreationApp }) {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("young-family");
  const [tone, setTone] = useState("professional");
  const [lengthMode, setLengthMode] = useState<"minimal" | "standard" | "long">("minimal");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [style, setStyle] = useState(styles[0]?.value ?? "documentary");
  const [layout, setLayout] = useState<(typeof layouts)[number]["value"]>("clean");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [uploadedImages, setUploadedImages] = useState<GeneratedImage[]>([]);
  const [cover, setCover] = useState<GeneratedImage | null>(null);
  const [loading, setLoading] = useState<"article" | "assets" | "publish" | "" >("");
  const [activeTab, setActiveTab] = useState<"write" | "article" | "visual" | "layout" | "draft">("write");
  const [styleUsage, setStyleUsage] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [publishState, setPublishState] = useState<"" | "draft" | "published">("");
  const [account, setAccount] = useState<{ connected: boolean; accountName?: string } | null>(null);
  const [workId, setWorkId] = useState("");
  const [saveStatus, setSaveStatus] = useState<"" | "saving" | "saved" | "error">("");
  const [restoring, setRestoring] = useState(true);
  const [copyNotice, setCopyNotice] = useState("");
  const [fullImage, setFullImage] = useState<{ url: string; label: string } | null>(null);

  const wordCount = useMemo(() => content.replace(/\s/g, "").length, [content]);
  const allImages = useMemo(() => [...images, ...uploadedImages], [images, uploadedImages]);
  const orderedStyles = useMemo(() => [...styles].sort((left, right) => (styleUsage[right.value] ?? 0) - (styleUsage[left.value] ?? 0)), [styleUsage]);

  useEffect(() => {
    void fetch(apiPath("/api/wechat/connection"))
      .then((response) => response.ok ? response.json() as Promise<{ connected: boolean; accountName?: string }> : null)
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    if (!fullImage) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFullImage(null); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [fullImage]);

  useEffect(() => {
    const restoredId = new URLSearchParams(window.location.search).get("workId")?.trim() ?? "";
    if (!restoredId) {
      const frame = window.requestAnimationFrame(() => setRestoring(false));
      return () => window.cancelAnimationFrame(frame);
    }
    const controller = new AbortController();
    void fetch(apiPath(`/api/works/${restoredId}`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("草稿读取失败");
        return response.json() as Promise<{ work?: { title?: string; content?: string; content_json?: { wechatStudioState?: Record<string, unknown> } } }>;
      })
      .then((payload) => {
        const work = payload.work; const state = work?.content_json?.wechatStudioState;
        setWorkId(restoredId);
        if (state) {
          if (typeof state.topic === "string") setTopic(state.topic);
          if (typeof state.audience === "string") setAudience(state.audience);
          if (typeof state.tone === "string") setTone(state.tone);
          if (state.lengthMode === "minimal" || state.lengthMode === "standard" || state.lengthMode === "long") setLengthMode(state.lengthMode);
          if (typeof state.title === "string") setTitle(state.title);
          if (typeof state.content === "string") setContent(state.content);
          if (typeof state.style === "string") setStyle(state.style);
          if (typeof state.layout === "string" && layouts.some((item) => item.value === state.layout)) setLayout(state.layout as (typeof layouts)[number]["value"]);
          if (Array.isArray(state.images)) setImages(state.images as GeneratedImage[]);
          if (Array.isArray(state.uploadedImages)) setUploadedImages(state.uploadedImages as GeneratedImage[]);
          if (state.cover && typeof state.cover === "object") setCover(state.cover as GeneratedImage);
          if (typeof state.activeTab === "string" && ["write", "article", "visual", "layout", "draft"].includes(state.activeTab)) setActiveTab(state.activeTab as typeof activeTab);
        } else if (work?.content) {
          setTitle(work.title?.replace(/\s*[｜|].*$/, "") || "公众号文章"); setContent(work.content); setActiveTab("article");
        }
        setSaveStatus("saved");
      })
      .catch((error) => { if (!(error instanceof DOMException && error.name === "AbortError")) setSaveStatus("error"); })
      .finally(() => { if (!controller.signal.aborted) setRestoring(false); });
    return () => controller.abort();
  // The work id is fixed for the lifetime of this mounted workspace.
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setStyleUsage(JSON.parse(window.localStorage.getItem(STYLE_USAGE_KEY) ?? "{}") as Record<string, number>); } catch { setStyleUsage({}); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleMove = (event: Event) => {
      const detail = (event as CustomEvent<{ imageId?: string; sectionIndex?: number }>).detail;
      if (!detail?.imageId) return;
      const update = (items: GeneratedImage[]) => items.map((image) => image.id === detail.imageId ? { ...image, sectionIndex: detail.sectionIndex } : image);
      setImages(update); setUploadedImages(update);
      setMessage(detail.sectionIndex === -1 ? "图片已移动到文章开头。 " : detail.sectionIndex === 999 ? "图片已移动到文章末尾。 " : "图片已移动到指定章节。 ");
      setCopyNotice("图片已移动");
      window.setTimeout(() => setCopyNotice(""), 1800);
    };
    window.addEventListener("wechat-studio:image-move", handleMove);
    return () => window.removeEventListener("wechat-studio:image-move", handleMove);
  }, []);

  async function generateArticle() {
    if (!topic.trim()) { setMessage("先写下这篇文章想讲的内容。 "); return; }
    setLoading("article"); setMessage(""); setPublishState(""); setActiveTab("article");
    try {
      const resolvedWorkId = await ensureStudioWork();
      const response = await fetch(apiPath("/api/creation/apps/wechat-studio/stream"), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { topic, audience, tone, lengthMode }, workId: resolvedWorkId }),
      });
      if (!response.ok || !response.body) throw new Error("文章生成失败，请稍后再试。");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let raw = ""; let buffer = "";
      setTitle(""); setContent("");
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n"); buffer = events.pop() ?? "";
        for (const event of events) {
          const line = event.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6)) as { type?: string; content?: string; result?: string };
          if (payload.type === "error") throw new Error(payload.content || "文章生成失败，请稍后再试。");
          if (payload.type === "delta" && payload.content) { raw += payload.content; const next = splitArticle(raw); setTitle(next.title); setContent(next.content); }
          if (payload.type === "done" && payload.result) { raw = payload.result; const next = splitArticle(raw); setTitle(next.title); setContent(next.content); }
        }
      }
      if (!raw.trim()) throw new Error("文章生成失败，请稍后再试。");
      setActiveTab("article"); setMessage("文章初稿已生成，可以预览并编辑。 ");
      await saveStudioProgress(resolvedWorkId, "article", { title: splitArticle(raw).title, content: splitArticle(raw).content });
    } catch (error) { setMessage(error instanceof Error ? error.message : "网络连接失败，请重试。"); if (!content) setActiveTab("write"); }
    finally { setLoading(""); }
  }

  async function generateImages() {
    if (!content.trim()) { setMessage("请先生成或粘贴文章内容。 "); return; }
    setLoading("assets"); setMessage("");
    try {
      const resolvedWorkId = workId || await ensureStudioWork();
      const [imagesResponse, coverResponse] = await Promise.all([fetch(apiPath("/api/creation/apps/wechat-images"), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { article: `${title}\n\n${content}`, style, studio_parent: "wechat-studio", studio_work_id: resolvedWorkId } }),
      }), fetch(apiPath("/api/creation/apps/wechat-cover"), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { title, summary: content.slice(0, 1600), style, ratio: "2.35:1", studio_parent: "wechat-studio", studio_work_id: resolvedWorkId } }),
      })]);
      const [payload, coverPayload] = await Promise.all([imagesResponse.json() as Promise<{ images?: GeneratedImage[]; imageSections?: Array<{ index: number; title: string }>; error?: string }>, coverResponse.json() as Promise<{ images?: GeneratedImage[]; error?: string }>]);
      if (!imagesResponse.ok || !payload.images?.length || !coverResponse.ok || !coverPayload.images?.[0]) throw new Error(payload.error || coverPayload.error || "视觉素材生成失败，请稍后再试。");
      const nextImages = payload.images.map((image, index) => ({ ...image, sectionIndex: payload.imageSections?.[index]?.index ?? index, sectionTitle: payload.imageSections?.[index]?.title }));
      const nextCover = coverPayload.images[0];
      setImages(nextImages); setCover(nextCover);
      await saveStudioProgress(resolvedWorkId, "visual", {}, { images: nextImages, cover: nextCover });
      setStyleUsage((current) => { const next = { ...current, [style]: (current[style] ?? 0) + 1 }; window.localStorage.setItem(STYLE_USAGE_KEY, JSON.stringify(next)); return next; });
      setMessage("AI 封面与正文配图已生成；你可以继续上传自己的图片，或进入发布预览。 ");
    } catch (error) { setMessage(error instanceof Error ? error.message : "网络连接失败，请重试。"); }
    finally { setLoading(""); }
  }


  async function publish(mode: "draft" | "publish") {
    if (!title.trim() || !content.trim()) { setMessage("请先完成文章标题和正文。 "); return; }
    setLoading("publish"); setMessage("");
    try {
      const resolvedWorkId = workId || await ensureStudioWork();
      await saveStudioProgress(resolvedWorkId, "draft");
      const response = await fetch(apiPath("/api/wechat/publish"), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, content, cover: cover?.url, images: allImages.map((image) => ({ url: image.url, sectionIndex: image.sectionIndex })), layout, publish: mode === "publish" }),
      });
      const payload = await response.json() as { error?: string; message?: string; status?: "draft" | "published" };
      if (!response.ok) throw new Error(payload.error || "提交公众号失败。");
      setPublishState(payload.status ?? (mode === "publish" ? "published" : "draft")); setMessage(payload.message || (mode === "publish" ? "已提交发布，请到公众号后台确认。" : "已保存到公众号草稿箱。"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "网络连接失败，请重试。"); }
    finally { setLoading(""); }
  }

  function studioState(tab = activeTab, overrides: { title?: string; content?: string } = {}, stateOverrides: { images?: GeneratedImage[]; uploadedImages?: GeneratedImage[]; cover?: GeneratedImage | null } = {}) {
    return { topic, audience, tone, lengthMode, title: overrides.title ?? title, content: overrides.content ?? content, style, layout, images: stateOverrides.images ?? images, uploadedImages: stateOverrides.uploadedImages ?? uploadedImages, cover: stateOverrides.cover === undefined ? cover : stateOverrides.cover, activeTab: tab, updatedAt: new Date().toISOString() };
  }

  async function ensureStudioWork() {
    if (workId) return workId;
    setSaveStatus("saving");
    const response = await fetch(apiPath("/api/wechat/studio"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title || "公众号文章创作｜未完成", content, state: studioState("article") }) });
    const payload = await response.json() as { work?: { id?: string }; error?: string };
    if (!response.ok || !payload.work?.id) { setSaveStatus("error"); throw new Error(payload.error || "草稿创建失败"); }
    const id = payload.work.id; setWorkId(id); setSaveStatus("saved");
    const url = new URL(window.location.href); url.searchParams.set("workId", id); window.history.replaceState({}, "", url);
    return id;
  }

  async function saveStudioProgress(id = workId, tab = activeTab, overrides: { title?: string; content?: string } = {}, stateOverrides: { images?: GeneratedImage[]; uploadedImages?: GeneratedImage[]; cover?: GeneratedImage | null } = {}) {
    if (!id) return;
    setSaveStatus("saving");
    const nextTitle = overrides.title ?? title;
    const nextContent = overrides.content ?? content;
    const response = await fetch(apiPath(`/api/works/${id}`), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "draft", title: nextTitle || "公众号文章创作｜未完成", content: nextContent, contentJson: { batches: [], wechatStudioState: studioState(tab, overrides, stateOverrides) } }) });
    setSaveStatus(response.ok ? "saved" : "error");
  }

  async function moveToTab(tab: typeof activeTab) {
    const id = workId || (topic.trim() ? await ensureStudioWork() : "");
    if (id) await saveStudioProgress(id, tab);
    setActiveTab(tab);
  }

  async function uploadArticleImages(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/") && file.size <= 10 * 1024 * 1024).slice(0, Math.max(0, 8 - uploadedImages.length));
    const next = await Promise.all(selected.map(async (file, index) => ({ id: `upload-${Date.now()}-${index}`, url: await readImageFile(file) })));
    setUploadedImages((current) => [...current, ...next].slice(0, 8));
    if (!cover && next[0]) setCover(next[0]);
    setMessage(`已上传 ${next.length} 张配图；你仍可以继续生成 AI 配图。`);
  }

  async function uploadCover(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setCover({ id: `cover-upload-${Date.now()}`, url: await readImageFile(file) });
    setMessage("已使用你上传的图片作为公众号封面。 ");
  }

  async function downloadImage(image: GeneratedImage, label: string) {
    try {
      const response = await fetch(image.url);
      if (!response.ok) throw new Error("图片读取失败");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${safeFileName(title || "公众号文章")}-${safeFileName(label)}.${imageExtension(blob.type)}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setMessage("图片下载失败，请稍后重试。 ");
    }
  }

  async function copyArticle() {
    try {
      const source = activeTab === "draft"
        ? document.querySelector(".studioDraftPreview .studioMarkdownArticle")
        : document.querySelector(".studioLiveArticle .studioMarkdownArticle");
      const html = source ? richArticleHtml(source) : `<p>${escapeClipboardHtml(content).replace(/\n/g, "<br>")}</p>`;
      const plainText = content.trim();
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        })]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
      showCopyHint("✓ 已复制");
    } catch { showCopyHint("复制失败", true); }
  }

  function showCopyHint(text: string, error = false) {
    const actions = document.querySelector(activeTab === "draft" ? ".studioDraftPreview .studioDocumentActions" : ".studioLiveArticle .studioDocumentActions");
    if (!actions) return;
    actions.querySelector(".studioInlineCopyHint")?.remove();
    const hint = document.createElement("span");
    hint.className = `studioInlineCopyHint${error ? " error" : ""}`; hint.textContent = text;
    actions.appendChild(hint);
    window.setTimeout(() => hint.remove(), 1800);
  }

  async function downloadArticle() {
    const source = activeTab === "draft"
      ? document.querySelector(".studioDraftPreview .studioMarkdownArticle")
      : document.querySelector(".studioLiveArticle .studioMarkdownArticle");
    const blob = await articleDocx(title, source, content);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${safeFileName(title || "公众号文章")}.docx`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setMessage("富文本文章已下载为 Word 文档。 ");
  }

  if (restoring) return <div className="wechatStudioPage page-content"><p className="studioMessage">正在恢复未完成的公众号文章…</p></div>;

  return <div className="wechatStudioPage page-content">
    <div className="page-back-bar pageBackBar"><a className="back-btn backLink" href={appPath("/create")}>← 返回创作广场</a><span className="subpageBreadcrumb">创作广场 / 公众号文章创作</span></div>
    <section className="wechatStudioHero">
      <div><span>微信公众号创作工作台</span><h1>一篇好文章，从想法到发布</h1><p>先把真实想法说清楚，剩下的文案、配图与发布流程交给我们。</p></div>
      <div className="wechatStudioSteps" role="tablist"><button className={activeTab === "write" ? "active" : ""} onClick={() => void moveToTab("write")} type="button"><i>1</i>填写内容</button><b>→</b><button className={activeTab === "article" ? "active" : ""} onClick={() => void moveToTab("article")} disabled={!content} type="button"><i>2</i>预览文章</button><b>→</b><button className={activeTab === "visual" ? "active" : ""} onClick={() => void moveToTab("visual")} disabled={!content} type="button"><i>3</i>选择配图</button><b>→</b><button className={activeTab === "layout" ? "active" : ""} onClick={() => void moveToTab("layout")} disabled={!cover} type="button"><i>4</i>整体版式</button><b>→</b><button className={activeTab === "draft" ? "active" : ""} onClick={() => void moveToTab("draft")} disabled={!cover} type="button"><i>5</i>预览发布</button></div>
      {workId ? <small className={`studioSaveStatus ${saveStatus}`}>{saveStatus === "saving" ? "正在保存…" : saveStatus === "error" ? "保存失败，请重试" : "已保存到作品历史"}</small> : null}
    </section>
    {activeTab === "write" && <main className="wechatStudioLayout">
      <section className="wechatStudioComposer">
        <div className="studioSectionTitle"><div><span>文章创作</span><h2>从一个真实想法开始</h2></div><em>{app.points} 积分 / 篇</em></div>
        <label className="studioTopic"><span>这篇文章想讲什么</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="写下主题、真实经历、读者的问题，或必须保留的观点。越具体，文章越像你。" maxLength={6000} /></label>
        <div className="studioChoices"><fieldset><legend>写给谁看</legend>{app.fields.find((field) => field.id === "audience")?.options?.map((option) => <button type="button" className={audience === option.value ? "active" : ""} onClick={() => setAudience(option.value)} key={option.value}>{option.label}</button>)}</fieldset><fieldset><legend>文章写作风格 <small>只影响文字，不影响配图</small></legend>{app.fields.find((field) => field.id === "tone")?.options?.map((option) => <button type="button" className={tone === option.value ? "active" : ""} onClick={() => setTone(option.value)} key={option.value}>{option.label}</button>)}</fieldset></div>
        <fieldset className="studioLengthChoices"><legend>正文篇幅</legend>{([['minimal', '极简', '约 600 字 · 推荐'], ['standard', '常规', '约 1200 字'], ['long', '长文', '约 1800 字']] as const).map(([value, label, description]) => <button type="button" className={lengthMode === value ? "active" : ""} onClick={() => setLengthMode(value)} key={value}><strong>{label}</strong><span>{description}</span></button>)}</fieldset>
        <div className="studioStepActions"><span />{content ? <><button className="studioSecondary" type="button" onClick={generateArticle} disabled={Boolean(loading)}>{loading === "article" ? "正在重新生成…" : "重新生成"}</button><button className="studioPrimary" type="button" onClick={() => void moveToTab("article")}>继续使用已有文章 →</button></> : <button className="studioPrimary" type="button" onClick={generateArticle} disabled={Boolean(loading)}>{loading === "article" ? "正在写文章…" : "生成文章初稿 →"}</button>}</div>
      </section>
      <aside className="wechatStudioAside"><span>本次会帮你完成</span><strong>标题、开场、正文结构、收尾行动和阅读节奏</strong><p>所有涉及数据、案例、产品规则的内容，都建议在发布前再核对一次。</p></aside>
    </main>}
    {activeTab === "article" && (content || loading === "article") && <section className="wechatStudioEditor studioLiveArticle"><div className="studioSectionTitle studioArticleTitleBar"><div><span>{loading === "article" ? "正在流式创作" : "文章预览与编辑"}</span><h2>{title || "正在生成标题…"}</h2></div>{loading !== "article" ? <div className="studioDocumentActions"><button type="button" onClick={() => void copyArticle()}>复制</button><button type="button" onClick={downloadArticle}>下载</button></div> : null}</div><p className="studioArticleMeta">{wordCount.toLocaleString("zh-CN")} 字</p>{loading === "article" && !content ? <div className="studioStreamingPlaceholder"><i /><span>正在组织公众号文章结构…</span></div> : null}<label><span>文章标题</span><input className="studioCenteredTitleInput" value={title} onChange={(event) => setTitle(event.target.value)} /></label><article className="studioMarkdownArticle studioArticlePreview"><ReactMarkdown>{content}</ReactMarkdown>{loading === "article" ? <span className="studioStreamCursor" aria-label="正在生成" /> : null}</article>{loading !== "article" ? <details className="studioRenderedPreview"><summary>编辑正文</summary><label><span className="srOnly">正文 Markdown</span><textarea className="studioArticleBody" value={content} onChange={(event) => setContent(event.target.value)} /></label></details> : null}<div className="studioStepActions"><button className="studioSecondary" type="button" onClick={() => void moveToTab("write")} disabled={loading === "article"}>← 上一步</button><button className="studioPrimary" type="button" onClick={() => void moveToTab("visual")} disabled={loading === "article"}>下一步：选择配图 →</button></div></section>}
    {activeTab === "visual" && content && <section className="wechatStudioEditor">
      <div className="studioSectionTitle"><div><span>文章配图</span><h2>选择配图风格</h2></div><b className="studioSelectedStyle">已选：{styles.find((item) => item.value === style)?.label}</b></div>
      <div className="studioVisualStyle"><div className="studioVisualStyleHead"><div><p>封面与正文配图会沿用同一视觉方向。真实样例可横向滑动查看。</p></div></div><div className="studioStyleGallery" aria-label="配图风格">{orderedStyles.map((item) => <button aria-pressed={style === item.value} className={`studioStyleCard ${style === item.value ? "active" : ""}`} type="button" onClick={() => setStyle(item.value)} key={item.value}><img src={item.preview} alt={`${item.label}样例`} /><div className="studioStyleCardTitle"><strong>{item.label}</strong>{styleUsage[item.value] ? <em>你常用</em> : item.recommended ? <em>推荐</em> : null}{style === item.value ? <i className="studioStyleCheck" aria-hidden="true">✓</i> : null}</div><span>{item.description}</span></button>)}</div></div>
      <div className="studioAssetSources"><section><span>AI 生成（可选）</span><strong>固定生成 1 张横版封面；正文按大章节生成，每章 1 张、最多 5 张</strong><button className="studioPrimary" type="button" onClick={generateImages} disabled={Boolean(loading)}>{loading === "assets" ? "正在按章节生成…" : images.length ? "重新生成 AI 配图" : "生成封面与配图"}</button></section><section><span>上传自己的图片（可选）</span><strong>最多上传 8 张，可与 AI 配图一起使用</strong><label className="studioUploadButton">上传正文配图<input accept="image/*" multiple type="file" onChange={(event) => void uploadArticleImages(event.target.files)} /></label><label className="studioUploadButton">上传文章封面<input accept="image/*" type="file" onChange={(event) => void uploadCover(event.target.files?.[0])} /></label></section></div>
      {cover ? <div className="studioGeneratedCover"><span>文章封面</span><div className="studioCoverPreview"><img src={cover.url} alt="公众号文章封面" /><div className="studioImageActions"><button type="button" onClick={() => setFullImage({ url: cover.url, label: "文章封面" })}>查看全图</button><button type="button" onClick={() => void downloadImage(cover, "文章封面")}>下载</button><button type="button" onClick={() => setCover(null)}>移除</button></div></div></div> : null}
      {allImages.length > 0 ? <div className="studioGeneratedImages"><span>正文配图 · {allImages.length} 张</span><div className="studioImageGrid">{allImages.map((image, index) => <figure key={image.id}><img src={image.url} alt="文章配图" />{image.sectionTitle ? <figcaption>对应章节：{image.sectionTitle}</figcaption> : <figcaption>用户上传配图</figcaption>}<div className="studioImageActions"><button type="button" onClick={() => setFullImage({ url: image.url, label: image.sectionTitle || `正文配图 ${index + 1}` })}>查看全图</button><button type="button" onClick={() => void downloadImage(image, image.sectionTitle || `正文配图-${index + 1}`)}>下载</button><button type="button" onClick={() => image.id.startsWith("upload-") ? setUploadedImages((current) => current.filter((item) => item.id !== image.id)) : setImages((current) => current.filter((item) => item.id !== image.id))}>移除</button></div></figure>)}</div></div> : <p className="studioAssetEmpty">还没有配图。你可以上传自己的图片、使用 AI 生成，或者两种方式一起用。</p>}
      <div className="studioStepActions studioVisualNext"><button className="studioSecondary" type="button" onClick={() => void moveToTab("article")}>← 上一步</button><div><small className={cover ? "ready" : "missing"}>{cover ? allImages.length ? "封面和正文配图已准备好" : "封面已准备好，正文配图可选" : "还缺少文章封面：请生成封面或上传一张封面"}</small><button className="studioPrimary" type="button" onClick={() => void moveToTab("layout")} disabled={!cover}>下一步：选择整体版式 →</button></div></div>
    </section>}
    {activeTab === "layout" && content && <section className="wechatStudioEditor"><div className="studioSectionTitle"><div><span>整体版式</span><h2>选择文章排版</h2></div><b className="studioSelectedStyle">已选：{layouts.find((item) => item.value === layout)?.label}</b></div><p className="studioLayoutHint">左侧选择模板，右侧会立即呈现你的真实文章效果；只改变排版，不改变内容。</p><div className="studioLayoutWorkspace"><div className="studioLayoutGrid">{layouts.map((item) => <button aria-pressed={layout === item.value} className={`studioLayoutCard layout-${item.value} ${layout === item.value ? "active" : ""}`} key={item.value} onClick={() => setLayout(item.value)} type="button"><i><img src={item.preview} alt={`${item.label}模板样例`} /></i><div className="studioLayoutCardTitle"><strong>{item.label}</strong>{layout === item.value ? <u>✓ 已选</u> : null}</div><small>{item.description}</small></button>)}</div><aside className={`studioLayoutLive studioLayout-${layout}`}><div className="studioLayoutLiveHead"><span>实时预览</span><em>{layouts.find((item) => item.value === layout)?.label}</em></div>{cover ? <div className="studioLayoutLiveCover"><img src={cover.url} alt="文章封面预览" /></div> : null}<h1>{title}</h1><ArticleWithImages content={content} images={allImages} /></aside></div><div className="studioStepActions"><button className="studioSecondary" type="button" onClick={() => void moveToTab("visual")}>← 上一步</button><button className="studioPrimary" type="button" onClick={() => void moveToTab("draft")}>下一步：预览发布 →</button></div></section>}
    {activeTab === "draft" && content && <section className={`wechatStudioEditor studioDraftPreview studioLayout-${layout}`}><div className="studioSectionTitle"><div><span>草稿预览与编辑</span><h2>确认文章发布效果</h2></div><div className="studioDocumentActions"><button type="button" onClick={() => void copyArticle()}>复制</button><button type="button" onClick={downloadArticle}>下载</button><button className="studioSecondary" type="button" onClick={() => void moveToTab("layout")}>返回版式</button></div></div>{cover && <div className="studioCoverPreview"><img src={cover.url} alt="公众号文章封面" /><button type="button" onClick={() => setCover(null)}>移除封面</button></div>}<label><span>文章标题</span><input className="studioCenteredTitleInput" value={title} onChange={(event) => setTitle(event.target.value)} /></label><ArticleWithImages content={content} images={allImages} /><div className="studioPublishBar"><div><span>{publishState === "published" ? "已提交发布" : publishState === "draft" ? "已进入草稿箱" : account?.connected ? `已连接 · ${account.accountName || "公众号"}` : "尚未连接公众号"}</span><strong>{account?.connected ? "确认无误后，一键送到你的公众号" : "连接公众号后，即可将文章一键送入草稿箱"}</strong></div><div><button className="studioDraft" type="button" onClick={() => publish("draft")} disabled={Boolean(loading) || !account?.connected}>存入草稿箱</button><button className="studioPrimary" type="button" onClick={() => publish("publish")} disabled={Boolean(loading) || !account?.connected}>{loading === "publish" ? "提交中…" : "一键发布到公众号"}</button></div></div></section>}
    {message && <p className={`studioMessage ${message.includes("失败") || message.includes("请先") ? "error" : ""}`}>{message}</p>}
    {copyNotice ? <div className={`studioCopyToast ${copyNotice.includes("失败") ? "error" : ""}`} role="status"><b>{copyNotice.includes("失败") ? "!" : "✓"}</b>{copyNotice}</div> : null}
    {fullImage ? createPortal(<div className="studioFullImageBackdrop" role="presentation" onMouseDown={() => setFullImage(null)}><section className="studioFullImageDialog" role="dialog" aria-modal="true" aria-label={`${fullImage.label}全图预览`} onMouseDown={(event) => event.stopPropagation()}><header><strong>{fullImage.label}</strong><button type="button" aria-label="关闭全图预览" onClick={() => setFullImage(null)}>×</button></header><div><img src={fullImage.url} alt={`${fullImage.label}全图`} /></div></section></div>, document.body) : null}
  </div>;
}

function ArticleWithImages({ content, images }: { content: string; images: GeneratedImage[] }) {
  const [draggingImageId, setDraggingImageId] = useState("");
  const sections = splitRenderedSections(content);
  const usedIds = new Set<string>();
  const before = images.filter((image) => image.sectionIndex === -1);
  const after = sections.map((_, index) => {
    const assigned = images.filter((image) => image.sectionIndex === index);
    assigned.forEach((image) => usedIds.add(image.id));
    if (!assigned.length) {
      const automatic = images.find((image) => image.sectionIndex === undefined && !usedIds.has(image.id));
      if (automatic) { usedIds.add(automatic.id); return [automatic]; }
    }
    return assigned;
  });
  before.forEach((image) => usedIds.add(image.id));
  const remaining = images.filter((image) => !usedIds.has(image.id));
  const completeMove = (sectionIndex: number) => {
    const imageId = draggingImageId;
    if (!imageId) return;
    setDraggingImageId("");
    document.querySelectorAll(".studioDraggableFigure.moving,.studioArticleDropZone.dragOver").forEach((element) => element.classList.remove("moving", "dragOver"));
    window.dispatchEvent(new CustomEvent("wechat-studio:image-move", { detail: { imageId, sectionIndex } }));
  };
  const figures = (items: GeneratedImage[], prefix: string) => items.map((image, index) => <figure className={`studioDraggableFigure ${draggingImageId === image.id ? "moving" : ""}`} draggable={false} onPointerDown={(event) => { event.preventDefault(); setDraggingImageId(image.id); }} key={image.id}><img draggable={false} src={image.url} alt={`${prefix} ${index + 1}`} /><figcaption>按住拖动，或点击后再点目标位置</figcaption></figure>);
  const dropZone = (sectionIndex: number, label: string) => <div className="studioArticleDropZone" onPointerEnter={(event) => { if (draggingImageId) event.currentTarget.classList.add("dragOver"); }} onPointerLeave={(event) => event.currentTarget.classList.remove("dragOver")} onPointerUp={(event) => { event.preventDefault(); completeMove(sectionIndex); }} onClick={() => completeMove(sectionIndex)}><span>放到这里 · {label}</span></div>;
  return <article className="studioMarkdownArticle studioArticlePreview">{dropZone(-1, "文章开头")}{figures(before, "文首配图")}{sections.map((section, index) => <div className="studioArticleSection" key={`${index}-${section.content.slice(0, 18)}`}><ReactMarkdown>{section.content}</ReactMarkdown>{dropZone(index, `${section.title}之后`)}{figures(after[index], `${section.title}配图`)}</div>)}{dropZone(999, "文章末尾")}{figures(remaining, "文末配图")}</article>;
}

function splitRenderedSections(content: string) {
  return content.split(/(?=^##\s+)/m).filter((section) => section.trim()).map((section, index) => ({ content: section, title: section.match(/^##\s+(.+)$/m)?.[1]?.trim() || (index === 0 ? "开篇" : `第 ${index + 1} 部分`) }));
}

function getWechatStyleDescription(value: string) {
  const descriptions: Record<string, string> = {
    documentary: "行业解读与真实场景",
    abstract: "知识结构与复杂概念",
    "warm-drawing": "家庭、关系与温暖故事",
    "cinematic-light": "人物故事与情绪转折",
    landscape: "城市、职场与生活观察",
    "eastern-line": "理念表达与东方留白",
    "simple-story": "轻量观点与日常说明",
    "loose-sketch": "手绘导读与知识科普",
    "playful-collage": "生活方式与轻松话题",
    painted: "品牌专题与质感表达",
    watercolor: "温柔观点与治愈内容",
    "colored-pencil": "个人手记与顾问经验",
    "fine-line": "专业要点与理性说明",
    ink: "东方理念与深度思考",
    "paper-story": "亲子、成长与故事叙述",
    "city-detail": "城市细节与生活观察",
    "quiet-drama": "深度观点与专题长文",
    "city-sunset": "城市故事与情绪收束",
    "soft-healing": "关系表达与温暖陪伴",
    "retro-print": "复古专题与品牌故事",
    "vivid-illustration": "明快话题与传播内容",
  };
  return descriptions[value] ?? "公众号文章统一配图";
}

function splitArticle(result: string) {
  const cleaned = result.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/, "").trim();
  const heading = cleaned.match(/^(?:#\s*|标题[：:]\s*)(.+)$/m);
  const title = heading?.[1]?.trim() || cleaned.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "") || "未命名文章";
  const content = heading ? cleaned.replace(heading[0], "").trim() : cleaned.replace(title, "").trim();
  return { title, content };
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("图片读取失败"));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 60) || "图片";
}

function imageExtension(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

function richArticleHtml(source: Element) {
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...Array.from(source.querySelectorAll("*"))];
  const clones = [clone, ...Array.from(clone.querySelectorAll("*"))];
  const properties = ["color", "background-color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "padding-left", "padding-right", "border-left", "border-bottom", "border-radius"];
  originals.forEach((element, index) => {
    const target = clones[index] as HTMLElement | undefined;
    if (!target) return;
    const computed = window.getComputedStyle(element);
    target.setAttribute("style", properties.map((property) => `${property}:${computed.getPropertyValue(property)}`).join(";"));
    if (element.matches("p,h1,h2,h3,li,blockquote")) {
      const background = effectiveClipboardBackground(element, source);
      const top = computed.marginTop === "0px" ? "0" : computed.marginTop;
      const bottom = computed.marginBottom === "0px" ? "14px" : computed.marginBottom;
      const isHeading = element.matches("h1,h2,h3");
      target.style.margin = isHeading ? `${top} 0 ${bottom}` : "0";
      target.style.paddingTop = isHeading ? "0" : top;
      target.style.paddingBottom = isHeading ? "0" : bottom;
      target.style.boxSizing = "border-box";
      target.style.display = "block";
      target.style.width = "100%";
      target.style.maxWidth = "100%";
      target.style.height = "auto";
      target.style.minHeight = "0";
      if (background) target.style.backgroundColor = background;
    }
  });
  clone.querySelectorAll("button,.studioImageActions,.studioStreamCursor,.studioArticleDropZone,.studioDraggableFigure figcaption").forEach((element) => element.remove());
  clone.querySelectorAll("[class]").forEach((element) => element.removeAttribute("class"));
  clone.querySelectorAll("div,section,article,ul,ol,figure").forEach((element) => {
    const target = element as HTMLElement;
    target.style.boxSizing = "border-box";
    target.style.width = "100%";
    target.style.maxWidth = "100%";
    target.style.height = "auto";
  });
  clone.querySelectorAll("h1,h2,h3").forEach((heading) => {
    const paragraph = document.createElement("p");
    paragraph.innerHTML = heading.innerHTML;
    paragraph.setAttribute("style", heading.getAttribute("style") ?? "");
    paragraph.setAttribute("data-wechat-heading", heading.tagName.toLowerCase());
    heading.replaceWith(paragraph);
  });
  clone.querySelectorAll("figure").forEach((element) => { (element as HTMLElement).style.margin = "22px 0"; });
  clone.querySelectorAll("img").forEach((image) => { image.setAttribute("style", `${image.getAttribute("style") ?? ""};display:block;width:100%;height:auto;margin:20px auto;`); });
  const surface = effectiveClipboardBackground(source, source) || "#ffffff";
  return `<section style="box-sizing:border-box;max-width:677px;margin:0 auto;padding:20px 18px;background-color:${surface};">${clone.outerHTML}</section>`;
}

function effectiveClipboardBackground(element: Element, boundary: Element) {
  let current: Element | null = element;
  while (current) {
    const value = window.getComputedStyle(current).backgroundColor;
    if (value && value !== "transparent" && value !== "rgba(0, 0, 0, 0)") return value;
    if (current === boundary.parentElement) break;
    current = current.parentElement;
  }
  return "";
}

function escapeClipboardHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
