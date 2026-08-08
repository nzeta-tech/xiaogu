"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { apiPath, appPath } from "@/lib/client/url";
import { streamCreationImages } from "@/lib/client/creation-image-stream";
import { type CreationApp } from "@/lib/apps/catalog";

type Card = { id: string; url: string; sectionTitle?: string };
type Tab = "write" | "note" | "cards" | "preview";
const visualStyles = [
  { value: "daily-sign", label: "生活共鸣", note: "用真实日常场景承接情绪和判断" },
  { value: "study", label: "清单干货", note: "把选择条件、步骤和结论讲清楚" },
  { value: "scrapbook", label: "轻手账故事", note: "更适合经验分享和温和叙事" },
  { value: "large-sign", label: "温柔观点", note: "一句有共鸣的判断吸引停留" },
  { value: "fresh-card", label: "温和专业", note: "低饱和信息卡，适合收藏与决策" },
] as const;

export function XiaohongshuStudioPageClient({ app }: { app: CreationApp }) {
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState(""); const [creationMode, setCreationMode] = useState("rewrite"); const [lengthMode, setLengthMode] = useState("standard");
  const [content, setContent] = useState(""); const [cards, setCards] = useState<Card[]>([]); const [coverId, setCoverId] = useState(""); const [headImage, setHeadImage] = useState<Card | null>(null); const [style, setStyle] = useState<(typeof visualStyles)[number]["value"]>("daily-sign");
  const [tab, setTab] = useState<Tab>("write"); const [loading, setLoading] = useState<"note" | "cards" | "">(""); const [message, setMessage] = useState(""); const [workId, setWorkId] = useState(""); const [saveStatus, setSaveStatus] = useState<"" | "saving" | "saved" | "error">(""); const [previewMode, setPreviewMode] = useState<"long" | "album">("long"); const [activeSlide, setActiveSlide] = useState(0); const [restoring, setRestoring] = useState(() => Boolean(searchParams.get("workId")?.trim())); const [fullImage, setFullImage] = useState<{ url: string; label: string } | null>(null); const [copyNotice, setCopyNotice] = useState("");
  const [mobileDownloadQueue, setMobileDownloadQueue] = useState<Card[] | null>(null); const [mobileDownloadIndex, setMobileDownloadIndex] = useState(0);
  const editorRef = useRef<HTMLTextAreaElement>(null); const previousLoading = useRef("");
  const title = useMemo(() => content.split("\n").find(Boolean)?.replace(/^#\s*/, "") || "未命名笔记", [content]);
  const body = useMemo(() => content.replace(/^#?\s*[^\n]+\n?/, "").trim(), [content]);
  const tags = useMemo(() => body.match(/#[^\s#]+/g) ?? [], [body]);
  const cover = headImage ?? cards.find((card) => card.id === coverId) ?? cards[0] ?? null;
  const assetsReady = Boolean(headImage && cards.length);
  const completedStep = tab === "preview" && assetsReady ? 4 : content ? cards.length || headImage ? 3 : 2 : 1;
  const busy = Boolean(loading);
  const canOpenNote = Boolean(content) || loading === "note";
  const canOpenCards = Boolean(content);

  useEffect(() => { if (!fullImage) return; const previousOverflow = document.body.style.overflow; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setFullImage(null); }; document.body.style.overflow = "hidden"; window.addEventListener("keydown", close); return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", close); }; }, [fullImage]);

  useEffect(() => {
    const restoredId = searchParams.get("workId")?.trim() ?? "";
    if (!restoredId || restoredId === workId) { setRestoring(false); return; }
    setRestoring(true);
    const controller = new AbortController();
    void fetch(apiPath(`/api/works/${restoredId}`), { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("草稿读取失败"); return response.json() as Promise<{ work?: { content?: string; content_json?: { xiaohongshuStudioState?: Record<string, unknown> } } }>; })
      .then((payload) => {
        const work = payload.work; const state = work?.content_json?.xiaohongshuStudioState;
        setWorkId(restoredId);
        if (state) {
          if (typeof state.topic === "string") setTopic(state.topic);
          if (typeof state.creationMode === "string") setCreationMode(state.creationMode);
          if (typeof state.lengthMode === "string") setLengthMode(state.lengthMode === "long" ? "long" : "standard");
          if (typeof state.content === "string") setContent(state.content);
          if (Array.isArray(state.cards)) setCards(state.cards as Card[]);
          if (typeof state.coverId === "string") setCoverId(state.coverId);
          if (state.headImage && typeof state.headImage === "object") setHeadImage(state.headImage as Card);
          if (visualStyles.some((item) => item.value === String(state.style))) setStyle(state.style as typeof style);
          if (["write", "note", "cards", "preview"].includes(String(state.tab))) setTab(state.tab as Tab);
          if (state.previewMode === "long" || state.previewMode === "album") setPreviewMode(state.previewMode);
          if (typeof state.activeSlide === "number") setActiveSlide(state.activeSlide);
        } else if (work?.content) { setContent(work.content); setTab("note"); }
        setSaveStatus("saved");
      })
      .catch((error) => { if (!(error instanceof DOMException && error.name === "AbortError")) { setSaveStatus("error"); setMessage("作品读取失败，请稍后重试。"); } })
      .finally(() => { if (!controller.signal.aborted) setRestoring(false); });
    return () => controller.abort();
  }, [searchParams, workId]);

  const saveProgress = useCallback(async () => {
    if (!workId) return;
    setSaveStatus("saving");
    try {
      const response = await fetch(apiPath(`/api/works/${workId}`), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "draft", title: title || "小红书笔记创作｜未完成", content, contentJson: { batches: [], xiaohongshuStudioState: { topic, creationMode, lengthMode, content, cards, coverId, headImage, style, tab, previewMode, activeSlide } } }) });
      setSaveStatus(response.ok ? "saved" : "error");
    } catch { setSaveStatus("error"); }
  }, [activeSlide, cards, content, coverId, creationMode, headImage, lengthMode, previewMode, style, tab, title, topic, workId]);

  function studioState() { return { topic, creationMode, lengthMode, content, cards, coverId, headImage, style, tab, previewMode, activeSlide, updatedAt: new Date().toISOString() }; }
  async function ensureStudioWork() {
    if (workId) return workId;
    setSaveStatus("saving");
    const response = await fetch(apiPath("/api/xiaohongshu/studio"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title || "小红书笔记创作｜未完成", content, state: studioState() }) });
    const payload = await response.json() as { work?: { id?: string }; error?: string };
    if (!response.ok || !payload.work?.id) { setSaveStatus("error"); throw new Error(payload.error || "草稿创建失败"); }
    setWorkId(payload.work.id); setSaveStatus("saved");
    const url = new URL(window.location.href); url.searchParams.set("workId", payload.work.id); window.history.replaceState({}, "", url);
    return payload.work.id;
  }

  useEffect(() => {
    if (!workId || !content.trim() || loading) return;
    const timer = window.setTimeout(() => void saveProgress(), 900);
    return () => window.clearTimeout(timer);
  }, [content, cards, coverId, headImage, tab, previewMode, activeSlide, workId, loading, saveProgress]);

  useEffect(() => {
    if (loading === "note" && editorRef.current) editorRef.current.scrollTop = editorRef.current.scrollHeight;
    if (loading === "note") document.querySelectorAll<HTMLElement>(".xhsPhoneLongScroll").forEach((element) => { element.scrollTop = element.scrollHeight; });
    if (previousLoading.current === "note" && !loading && editorRef.current) editorRef.current.scrollTop = 0;
    if (previousLoading.current === "note" && !loading) document.querySelectorAll<HTMLElement>(".xhsPhoneLongScroll").forEach((element) => { element.scrollTop = 0; });
    previousLoading.current = loading;
  }, [content, loading]);

  async function generateNote() {
    if (!topic.trim()) return setMessage("先写下想分享的真实内容，至少包含一个具体场景或观点。");
    setLoading("note"); setMessage(""); setTab("note");
    try {
      const resolvedWorkId = await ensureStudioWork(); setContent(""); setCards([]); setCoverId("");
      const response = await fetch(apiPath("/api/creation/apps/xiaohongshu-studio/stream"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: { topic, creation_mode: creationMode, length_mode: lengthMode }, workId: resolvedWorkId }) });
      if (!response.ok || !response.body) throw new Error("笔记生成失败，请稍后再试。");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let result = "";
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split("\n\n"); buffer = events.pop() ?? ""; for (const event of events) { const line = event.split("\n").find((item) => item.startsWith("data: ")); if (!line) continue; const data = JSON.parse(line.slice(6)) as { type?: string; content?: string; result?: string; work?: { id?: string } | null }; if (data.type === "error") throw new Error(data.content || "笔记生成失败"); if (data.type === "delta" && data.content) { result += data.content; setContent(result); } if (data.type === "done") { if (data.result) { result = data.result; setContent(result); } if (data.work?.id) setWorkId(data.work.id); } } }
      if (!result.trim()) throw new Error("笔记生成失败，请稍后再试。");
      setMessage("初稿已生成。先在手机预览里确认读感和事实，再继续做配图。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "网络连接失败，请重试。"); setTab("write"); } finally { setLoading(""); }
  }

  async function generateImages() {
    if (!content.trim()) return setMessage("请先完成笔记文案。");
    setLoading("cards"); setMessage("");
    try {
      const resolvedWorkId = await ensureStudioWork();
      const [sectionImages, headerImages] = await Promise.all([
        streamCreationImages("wechat-images", { article: `${title}\n\n${body}`, style, ratio: "3:4", studio_parent: "xiaohongshu-studio", studio_work_id: resolvedWorkId }, resolvedWorkId),
        streamCreationImages("wechat-cover", { title, summary: body.slice(0, 1600), style, ratio: "3:4", studio_parent: "xiaohongshu-studio", studio_work_id: resolvedWorkId }, resolvedWorkId),
      ]);
      const sectionTitles = Array.from(body.matchAll(/^##\s+(.+)$/gm)).map((match) => match[1].trim());
      const next = sectionImages.map((card, index) => ({ ...card, sectionTitle: sectionTitles[index] || `正文第 ${index + 1} 部分` }));
      if (!next.length || !headerImages[0]) throw new Error("图文包生成失败，请稍后再试。");
      setCards(next); setCoverId(next[0].id); setHeadImage(headerImages[0]); setActiveSlide(0); setMessage("完整图文包已生成：包含 1 张头图和按段落生成的章节配图。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "网络连接失败，请重试。"); } finally { setLoading(""); }
  }

  function moveCard(index: number, direction: -1 | 1) { const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= cards.length) return; setCards((current) => { const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next; }); }
  function removeCard(id: string) { setCards((current) => current.filter((card) => card.id !== id)); if (id === coverId) setCoverId(cards.find((card) => card.id !== id)?.id ?? ""); }
  function showCopyNotice(label: string) { setCopyNotice(label); window.setTimeout(() => setCopyNotice((current) => current === label ? "" : current), 1800); }
  function copy(value: string, label: string) { void navigator.clipboard.writeText(value).then(() => showCopyNotice(label)).catch(() => setMessage("复制失败，请手动选择文字复制。")); }
  async function copyPackage() { const publishBody = body.split("\n").filter((line) => !/^(#[^\s#]+\s*)+$/.test(line.trim())).join("\n").trim(); const tagText = tags.join(" "); const html = `<article style="max-width:680px;color:#1f2937;font-family:Arial,'PingFang SC',sans-serif;line-height:1.8"><h1 style="display:block;margin:0 0 22px;font-size:28px;font-weight:800;line-height:1.35">${escapeHtml(title)}</h1>${renderRichText(publishBody)}${tagText ? `<p style="margin:18px 0 0;color:#d53a55">${escapeHtml(tagText)}</p>` : ""}</article>`; const plainText = `${title}\n\n${markdownToPlainText(publishBody)}${tagText ? `\n\n${tagText}` : ""}`; try { await writeRichTextToClipboard(html, plainText); showCopyNotice("package"); } catch { setMessage("发布文案复制失败，请重试。 "); } }
  async function download(card: Card, index: number) { try { const source = card.url.startsWith("/") || card.url.startsWith("data:") || card.url.startsWith("blob:") || card.url.startsWith(window.location.origin) ? card.url : apiPath(`/api/assets/image-proxy?url=${encodeURIComponent(card.url)}`); const response = await fetch(source); if (!response.ok) throw new Error("图片下载失败"); const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${title}-小红书${index === 0 ? "头图" : `章节配图-${index}`}.png`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch { setMessage("图片下载失败，请稍后重试。"); } }
  async function downloadImagePack() { const images = [headImage, ...cards].filter((item): item is Card => Boolean(item)); if (!images.length) return; setMessage(""); if (isMobileDownloadDevice()) { if (!mobileDownloadQueue) { await download(images[0], 0); if (images.length === 1) return setMessage("图片已开始下载。"); setMobileDownloadQueue(images); setMobileDownloadIndex(1); setMessage(`第 1 张已开始下载，请点击“下载下一张”继续。`); return; } const index = mobileDownloadIndex; await download(mobileDownloadQueue[index], index); const nextIndex = index + 1; if (nextIndex >= mobileDownloadQueue.length) { setMobileDownloadQueue(null); setMobileDownloadIndex(0); setMessage("全部图片已逐张开始下载。"); } else { setMobileDownloadIndex(nextIndex); setMessage(`第 ${index + 1} 张已开始下载，请点击“下载下一张”继续。`); } return; } await Promise.all(images.map((image, index) => download(image, index))); setMessage(`已开始下载 ${images.length} 张图片。`); }
  const imagePackDownloadLabel = mobileDownloadQueue ? `下载下一张（${mobileDownloadIndex + 1}/${mobileDownloadQueue.length}）` : `下载图片包（${cards.length + 1}）`;
  function changeTab(next: Tab) { if (busy && next !== tab) return setMessage("当前内容正在生成，请等待完成后再进入下一步。"); if (next !== "write" && !content) return setMessage("请先生成笔记初稿。"); if (next === "preview" && !assetsReady) return setMessage("请先生成完整图文包，再查看整体预览。"); setTab(next); }

  if (restoring) return <div className="xhsStudioPage page-content"><p className="studioMessage">正在恢复未完成的小红书笔记…</p></div>;
  return <div className="xhsStudioPage page-content">
    <div className="page-back-bar pageBackBar"><a className="back-btn backLink" href={appPath("/create")}>← 返回创作广场</a><span className="subpageBreadcrumb">创作广场 / 小红书笔记创作</span>{workId ? <small className={`xhsSaveStatus ${saveStatus}`}>{saveStatus === "saving" ? "正在保存" : saveStatus === "error" ? "保存失败" : "已保存"}</small> : null}</div>
    <section className="xhsStudioHero"><div><span>小红书图文创作工作台</span><h1>把一个真实想法，做成可发布的图文笔记</h1><p>从素材到图文发布包，用四步完成；任一步都可返回修改。</p></div><div className="xhsProgressWrap"><ol className="xhsProgress">{(["填写素材", "编辑笔记", "生成配图", "整体预览"] as const).map((label, index) => { const step = (["write", "note", "cards", "preview"] as const)[index]; const unavailable = step === "note" ? !canOpenNote : step === "cards" ? !canOpenCards : step === "preview" ? !assetsReady : false; return <li key={label} className={index + 1 <= completedStep ? "done" : ""}><button disabled={unavailable || (busy && tab !== step)} className={tab === step ? "active" : ""} onClick={() => changeTab(step)}><i>{index + 1}</i>{label}</button></li>; })}</ol></div></section>
    {tab === "write" && <section className="xhsStudioPanel xhsComposer"><header><div><span>01 · 确定方向</span><h2>选择创作方式，再交给 AI 完成</h2><p>受众、结构、语气和表达形式均由模型自动判断；你只需要确定素材来源与长度。</p></div><em>{app.points} 积分 / 篇</em></header><label className="xhsTopic">{creationMode === "rewrite" ? "粘贴准备重写的原文" : "写下创作想法"} <small>{topic.length}/6000</small><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={creationMode === "rewrite" ? "粘贴完整原文。系统只会重组表达，不会补造或改变其中事实。" : "例如：年轻家庭如何安排应急现金和基础保障；系统会检索公开资料补足可核验事实。"} maxLength={6000} /></label><div className="xhsChoiceGrid"><Choice label="创作方式" value={creationMode} onChange={setCreationMode} options={app.fields.find((field) => field.id === "creation_mode")?.options ?? []} /><Choice label="笔记长度" value={lengthMode} onChange={setLengthMode} options={app.fields.find((field) => field.id === "length_mode")?.options ?? []} /></div><div className="xhsComposerFooter"><span>{loading === "note" ? <b className="xhsGenerating"><i />{creationMode === "idea" ? "正在检索并创作，请稍候" : "正在重写，请稍候"}</b> : creationMode === "idea" ? "会先检索公开资料，再生成标题、正文、标签和互动结尾" : "会保持原文事实，重组为更适合小红书阅读的笔记"}</span><div className="xhsNextAction">{!topic.trim() ? <small>还差：填写原文或创作想法</small> : null}<button className="studioPrimary" disabled={busy || !topic.trim()} onClick={generateNote}>{loading === "note" ? "正在生成…" : "生成笔记初稿 →"}</button></div></div></section>}
    {tab === "note" && <section className="xhsWorkspace"><section className="xhsStudioPanel xhsEditor"><header><div><span>02 · 编辑笔记</span><h2>{loading === "note" ? <b className="xhsGenerating"><i />正在生成初稿</b> : "先把内容改成你的表达"}</h2></div><button disabled={busy || !content.trim()} onClick={() => copy(content, "笔记")}>复制全文</button></header><textarea ref={editorRef} className="xhsNoteEditor" value={content} onChange={(event) => setContent(event.target.value)} aria-label="编辑小红书笔记" readOnly={loading === "note"} /><div className="xhsEditorMeta"><span>{content.replace(/\s/g, "").length} 字</span><span>{tags.length ? `${tags.length} 个标签` : "尚未识别到标签"}</span><span>{loading === "note" ? "正在自动续写，请稍候" : "涉及案例、数据、规则时请核验"}</span></div><div className="studioStepActions"><button className="studioSecondary" disabled={busy} onClick={() => changeTab("write")}>← 返回方向</button><button className="studioPrimary" disabled={busy || !content.trim()} onClick={() => changeTab("cards")}>{loading === "note" ? "正在生成，暂不能继续" : !content.trim() ? "还未生成笔记" : "继续生成配图 →"}</button></div></section><PhonePreview title={title} body={body} cover={cover} cards={cards} mode={previewMode} onModeChange={setPreviewMode} activeSlide={activeSlide} onSlideChange={setActiveSlide} /></section>}
    {tab === "cards" && <section className="xhsStudioPanel"><header className="xhsCardsHead"><div><span>03 · 图文配图</span><h2>一键生成完整图文包</h2><p>按小红书图文阅读场景生成 3:4 头图与章节配图，保持笔记视觉一致。</p></div></header><div className="xhsStylePicker xhsStyleGallery">{visualStyles.map((item) => <button disabled={busy} key={item.value} className={style === item.value ? "active" : ""} onClick={() => setStyle(item.value)}><strong>{item.label}</strong><span>{item.note}</span></button>)}</div><div className="xhsGeneratePackage"><div><span>AI 图文包</span><strong>1 张 3:4 头图 + 最多 5 张章节配图</strong><p>一次生成，结果区会分别标识头图与章节配图。</p></div><div className="xhsPackageActions"><button className="studioPrimary" disabled={busy} onClick={generateImages}>{loading === "cards" ? <b className="xhsGenerating"><i />正在生成完整图文包…</b> : assetsReady ? "重新生成完整图文包" : "生成完整图文包"}</button>{assetsReady ? <button className="studioSecondary" disabled={busy} onClick={() => void downloadImagePack()}>{imagePackDownloadLabel}</button> : null}</div></div>{headImage ? <div className="xhsGeneratedHead"><div><span>头图 · 首屏封面</span><img src={headImage.url} alt="小红书头图" /><div className="studioImageActions"><button disabled={busy} onClick={() => setFullImage({ url: headImage.url, label: "小红书头图" })}>查看全图</button><button disabled={busy} onClick={() => void download(headImage, 0)}>下载头图</button></div></div></div> : null}{cards.length ? <div className="xhsGeneratedSections"><span>章节配图 · {cards.length} 张</span><div className="xhsCardGrid">{cards.map((card, index) => <figure key={card.id}><img src={card.url} alt={`章节配图 ${index + 1}`} /><figcaption><strong>第 {index + 1} 张</strong><span>{card.sectionTitle || "章节配图"}</span></figcaption><div><button disabled={busy} onClick={() => setFullImage({ url: card.url, label: card.sectionTitle || `章节配图 ${index + 1}` })}>查看全图</button><button disabled={busy} className="danger" onClick={() => removeCard(card.id)}>移除</button><button disabled={busy} onClick={() => void download(card, index + 1)}>下载</button></div></figure>)}</div></div> : <div className="xhsEmpty"><b>{loading === "cards" ? <span className="xhsGenerating"><i />正在分析段落并绘制图文包</span> : "还没有生成图文包"}</b><span>{loading === "cards" ? "头图和章节配图会并行生成，请稍候。" : "先选择视觉风格，再一键生成头图与章节配图。"}</span></div>}<div className="studioStepActions"><button className="studioSecondary" disabled={busy} onClick={() => changeTab("note")}>← 返回编辑</button><button className="studioPrimary" disabled={busy || !assetsReady} onClick={() => changeTab("preview")}>{!assetsReady ? "图文包尚未完成" : "下一步：整体预览 →"}</button></div></section>}
    {tab === "preview" && <section className={`xhsStudioPanel xhsFinalPreview ${previewMode === "album" ? "albumPreview" : "longPreview"}`}><header className="xhsCardsHead"><div><span>04 · 整体预览</span><h2>确认这篇笔记的完整发布效果</h2><p>选择长文时查看插图后的阅读流；选择图文卡片时，页面与手机同步切换为卡片流。</p></div></header><div className="xhsFinalPreviewGrid"><PhonePreview title={title} body={body} cover={cover} cards={cards} mode={previewMode} onModeChange={setPreviewMode} activeSlide={activeSlide} onSlideChange={setActiveSlide} />{previewMode === "long" ? <XhsArticleWithImages title={title} body={body} cards={cards} /> : <XhsCardDeck title={title} body={body} cover={cover} cards={cards} activeSlide={activeSlide} onSlideChange={setActiveSlide} />}</div><div className="xhsPublishActions"><CopyControl label="title" notice={copyNotice} onClick={() => copy(title, "title")}>复制标题</CopyControl><CopyControl label="tags" notice={copyNotice} onClick={() => copy(tags.join(" "), "tags")}>复制标签</CopyControl><CopyControl label="package" notice={copyNotice} onClick={() => void copyPackage()}>整体复制</CopyControl><button disabled={busy || !assetsReady} onClick={() => void downloadImagePack()}>{mobileDownloadQueue ? `下载下一张（${mobileDownloadIndex + 1}/${mobileDownloadQueue.length}）` : "下载全部图"}</button><span>整体复制会复制渲染后的标题、正文和标签；图片请使用“下载全部图”。</span></div><div className="studioStepActions"><button className="studioSecondary" onClick={() => changeTab("cards")}>← 上一步：修改配图</button><button className="studioPrimary" onClick={() => copyPackage()}>复制并准备发布</button></div></section>}
    {message && <p className={`studioMessage ${message.includes("失败") || message.includes("请先") ? "error" : ""}`}>{message}</p>}
    {fullImage ? createPortal(<div className="studioFullImageBackdrop" role="presentation" onMouseDown={() => setFullImage(null)}><section className="studioFullImageDialog" role="dialog" aria-modal="true" aria-label={`${fullImage.label}全图预览`} onMouseDown={(event) => event.stopPropagation()}><header><strong>{fullImage.label}</strong><button type="button" aria-label="关闭全图预览" onClick={() => setFullImage(null)}>×</button></header><div><img src={fullImage.url} alt={`${fullImage.label}全图`} /></div></section></div>, document.body) : null}
  </div>;
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) { return <fieldset className="xhsChoices"><legend>{label}</legend><div>{options.map((option) => <button type="button" className={value === option.value ? "active" : ""} onClick={() => onChange(option.value)} key={option.value}>{option.label}</button>)}</div></fieldset>; }
function isMobileDownloadDevice() { return typeof window !== "undefined" && window.matchMedia("(max-width: 760px), (pointer: coarse)").matches; }
function CopyControl({ label, notice, onClick, children }: { label: string; notice: string; onClick: () => void; children: React.ReactNode }) { return <span className="xhsCopyControl"><button onClick={onClick}>{children}</button>{notice === label ? <i className="xhsCopyBubble">已复制</i> : null}</span>; }
function XhsArticleWithImages({ title, body, cards }: { title: string; body: string; cards: Card[] }) { const paragraphs = body.split(/\n\s*\n/).filter(Boolean); return <article className="xhsInlineArticle"><h1>{title}</h1>{paragraphs.map((paragraph, index) => <div key={`${index}-${paragraph.slice(0, 12)}`}><ReactMarkdown>{paragraph}</ReactMarkdown>{cards.filter((_, cardIndex) => Math.floor((cardIndex + 1) * (paragraphs.length + 1) / (cards.length + 1)) === index + 1).map((card) => <figure key={card.id}><img src={card.url} alt={card.sectionTitle || "章节配图"} /><figcaption>{card.sectionTitle || "章节配图"}</figcaption></figure>)}</div>)}</article>; }
function XhsCardDeck({ title, body, cover, cards = [], activeSlide, onSlideChange }: { title: string; body: string; cover: Card | null; cards?: Card[]; activeSlide: number; onSlideChange: (index: number) => void }) { const slides = buildContentSlides(body, cards, cover); const index = Math.min(activeSlide, Math.max(0, slides.length - 1)); const slide = slides[index]; return <section className="xhsPreviewDeck">{slides.length ? <><div className="xhsPreviewDeckCard"><div>{index === 0 ? <h3>{title}</h3> : null}{slide?.map((block, blockIndex) => block.type === "image" ? <img className="xhsTextSlideImage" key={block.card.id} src={block.card.url} alt={block.card.sectionTitle || "笔记头图"} /> : <p key={blockIndex}>{block.text}</p>)}</div></div><nav><button disabled={index === 0} onClick={() => onSlideChange(index - 1)}>←</button><span>{index + 1} / {slides.length}</span><button disabled={index === slides.length - 1} onClick={() => onSlideChange(index + 1)}>→</button></nav></> : null}</section>; }
function PhonePreview({ title, body, cover, cards = [], mode, onModeChange, activeSlide, onSlideChange }: { title: string; body: string; cover: Card | null; cards?: Card[]; mode: "long" | "album"; onModeChange: (mode: "long" | "album") => void; activeSlide: number; onSlideChange: (index: number) => void }) { const slides = buildContentSlides(body, cards, cover); const visibleIndex = Math.min(activeSlide, Math.max(slides.length - 1, 0)); const slide = slides[visibleIndex]; return <div className="xhsPhonePreview"><div className="xhsPreviewModes"><button className={mode === "long" ? "active" : ""} onClick={() => onModeChange("long")}>长文模式</button><button className={mode === "album" ? "active" : ""} onClick={() => onModeChange("album")}>图文卡片模式</button></div><aside className={`xhsPhone ${mode === "long" ? "long" : "album"}`}><div className="xhsPhoneTop"><i /> <span>小红书预览</span><i /></div>{mode === "long" ? <div className="xhsPhoneLongScroll">{cover ? <img src={cover.url} alt="笔记封面预览" /> : <div className="xhsPhoneCover">封面将在配图生成后显示</div>}<div className="xhsPhoneContent"><h3>{title}</h3><ReactMarkdown>{body}</ReactMarkdown></div></div> : <div className="xhsAlbum"><div className="xhsAlbumSlide xhsTextSlide"><div>{visibleIndex === 0 ? <strong>{title}</strong> : null}{slide?.map((block, index) => block.type === "image" ? <img className="xhsTextSlideImage" key={block.card.id} src={block.card.url} alt={block.card.sectionTitle || "笔记头图"} /> : <p key={index}>{block.text}</p>)}</div></div><div className="xhsAlbumControls"><button disabled={visibleIndex <= 0} onClick={() => onSlideChange(visibleIndex - 1)}>←</button><span>{slides.length ? `${visibleIndex + 1} / ${slides.length}` : "0 / 0"}</span><button disabled={visibleIndex >= slides.length - 1} onClick={() => onSlideChange(visibleIndex + 1)}>→</button></div></div>}</aside></div>; }

function splitForCardPreview(body: string) { const limit = 130; const paragraphs = body.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean); const slides: string[] = []; let current = ""; const append = (text: string) => { if (current && current.length + text.length + 2 > limit) { slides.push(current); current = text; } else current = current ? `${current}\n\n${text}` : text; }; for (const paragraph of paragraphs) { let remainder = paragraph; while (remainder.length > limit) { const cut = Math.max(remainder.lastIndexOf("。", limit), remainder.lastIndexOf("！", limit), remainder.lastIndexOf("？", limit), remainder.lastIndexOf("，", limit), limit); append(remainder.slice(0, cut + 1).trim()); remainder = remainder.slice(cut + 1).trim(); } if (remainder) append(remainder); } if (current) slides.push(current); return slides.slice(0, 30); }
function buildContentSlides(body: string, cards: Card[], cover: Card | null = null) { const texts = splitForCardPreview(body); const images = cover ? [cover, ...cards] : cards; const blocks: Array<{ type: "text"; text: string } | { type: "image"; card: Card }> = []; if (!texts.length) images.forEach((card) => blocks.push({ type: "image", card })); texts.forEach((text, index) => { blocks.push({ type: "text", text }); const from = Math.floor(index * images.length / texts.length); const to = Math.floor((index + 1) * images.length / texts.length); images.slice(from, to).forEach((card) => blocks.push({ type: "image", card })); }); const pages: typeof blocks[] = []; let page: typeof blocks = []; let size = 0; for (const block of blocks) { const cost = block.type === "image" ? 4 : Math.max(1, Math.ceil(block.text.length / 130)); if (page.length && size + cost > 6) { pages.push(page); page = []; size = 0; } page.push(block); size += cost; } if (page.length) pages.push(page); return pages; }
function markdownToPlainText(value: string) { return value.replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/\*\*|__/g, "").replace(/`/g, "").replace(/^\s*[-*+]\s+/gm, "• ").replace(/^\s*\d+[.)]\s+/gm, "").trim(); }
function renderRichText(value: string) { const inline = (text: string) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/__(.+?)__/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>"); const output: string[] = []; let paragraph: string[] = []; let list: { ordered: boolean; items: string[] } | null = null; const flushParagraph = () => { if (paragraph.length) output.push(`<p style="margin:0 0 14px">${paragraph.map(inline).join("<br />")}</p>`); paragraph = []; }; const flushList = () => { if (!list) return; const tag = list.ordered ? "ol" : "ul"; output.push(`<${tag} style="margin:10px 0 14px;padding-left:22px">${list.items.map((item) => `<li style="margin:5px 0">${inline(item)}</li>`).join("")}</${tag}>`); list = null; }; for (const rawLine of value.split("\n")) { const line = rawLine.trim(); const heading = line.match(/^#{1,6}\s+(.+)$/); const bullet = line.match(/^[-*+]\s+(.+)$/); const ordered = line.match(/^\d+[.)]\s+(.+)$/); if (heading) { flushParagraph(); flushList(); output.push(`<h2 style="display:block;margin:22px 0 8px;font-size:20px;font-weight:750;line-height:1.45">${inline(heading[1])}</h2>`); continue; } if (bullet || ordered) { flushParagraph(); const isOrdered = Boolean(ordered); if (!list || list.ordered !== isOrdered) { flushList(); list = { ordered: isOrdered, items: [] }; } list.items.push((bullet?.[1] ?? ordered?.[1] ?? "").trim()); continue; } if (!line) { flushParagraph(); flushList(); continue; } flushList(); paragraph.push(line); } flushParagraph(); flushList(); return output.join(""); }
async function writeRichTextToClipboard(html: string, plainText: string) { if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") { await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plainText], { type: "text/plain" }) })]); return; } const holder = document.createElement("div"); holder.contentEditable = "true"; holder.style.cssText = "position:fixed;left:-9999px;top:0"; holder.innerHTML = html; document.body.appendChild(holder); const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(holder); selection?.removeAllRanges(); selection?.addRange(range); const copied = document.execCommand("copy"); selection?.removeAllRanges(); holder.remove(); if (!copied) throw new Error("复制失败"); }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character); }
