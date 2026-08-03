"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { apiPath, appPath } from "@/lib/client/url";
import { type CreationApp } from "@/lib/apps/catalog";

type Card = { id: string; url: string; sectionTitle?: string };
type Tab = "write" | "note" | "cards" | "preview";
const visualStyles = [
  { value: "daily-sign", label: "日常氛围", note: "像一篇有生活感的高收藏笔记", preview: "/examples/image-card-styles/fresh-card.webp" },
  { value: "study", label: "干货笔记", note: "重点、步骤和结论一眼看清", preview: "/examples/image-card-styles/flat-knowledge.webp" },
  { value: "scrapbook", label: "手账拼贴", note: "适合经验分享与轻松表达", preview: "/examples/image-card-styles/handwritten-notes.webp" },
  { value: "large-sign", label: "观点大字", note: "适合一句核心判断与首屏吸引", preview: "/examples/image-card-styles/magazine.webp" },
  { value: "fresh-card", label: "清透卡片", note: "适合清单、对比与知识收藏", preview: "/examples/image-card-styles/fresh-card.webp" },
] as const;

export function XiaohongshuStudioPageClient({ app }: { app: CreationApp }) {
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState(""); const [creationMode, setCreationMode] = useState("idea"); const [lengthMode, setLengthMode] = useState("standard");
  const [content, setContent] = useState(""); const [cards, setCards] = useState<Card[]>([]); const [coverId, setCoverId] = useState(""); const [headImage, setHeadImage] = useState<Card | null>(null); const [style, setStyle] = useState<(typeof visualStyles)[number]["value"]>("daily-sign");
  const [tab, setTab] = useState<Tab>("write"); const [loading, setLoading] = useState<"note" | "cards" | "">(""); const [message, setMessage] = useState(""); const [workId, setWorkId] = useState(""); const [saveStatus, setSaveStatus] = useState<"" | "saving" | "saved" | "error">(""); const [previewMode, setPreviewMode] = useState<"long" | "album">("long"); const [activeSlide, setActiveSlide] = useState(0); const [restoring, setRestoring] = useState(() => Boolean(searchParams.get("workId")?.trim())); const [fullImage, setFullImage] = useState<{ url: string; label: string } | null>(null); const [copyNotice, setCopyNotice] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null); const previousLoading = useRef(""); const restoreHandled = useRef(false);
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
    if (restoreHandled.current) return;
    restoreHandled.current = true;
    const restoredId = searchParams.get("workId")?.trim() ?? "";
    if (!restoredId) return;
    const controller = new AbortController();
    void fetch(apiPath(`/api/works/${restoredId}`), { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("草稿读取失败"); return response.json() as Promise<{ work?: { content?: string; content_json?: { xiaohongshuStudioState?: Record<string, unknown> } } }>; })
      .then((payload) => {
        const work = payload.work; const state = work?.content_json?.xiaohongshuStudioState;
        setWorkId(restoredId);
        if (state) {
          if (typeof state.topic === "string") setTopic(state.topic);
          if (typeof state.creationMode === "string") setCreationMode(state.creationMode);
          if (typeof state.lengthMode === "string") setLengthMode(state.lengthMode);
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
  }, [searchParams]);

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
      const [response, headResponse] = await Promise.all([
        fetch(apiPath("/api/creation/apps/wechat-images"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: { article: `${title}\n\n${body}`, style, ratio: "3:4", studio_parent: "xiaohongshu-studio", studio_work_id: resolvedWorkId } }) }),
        fetch(apiPath("/api/creation/apps/wechat-cover"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: { title, summary: body.slice(0, 1600), style, ratio: "3:4", studio_parent: "xiaohongshu-studio", studio_work_id: resolvedWorkId } }) }),
      ]);
      const [payload, headPayload] = await Promise.all([response.json() as Promise<{ images?: Card[]; imageSections?: Array<{ title: string }>; error?: string }>, headResponse.json() as Promise<{ images?: Card[]; error?: string }>]);
      const next = (payload.images ?? []).map((card, index) => ({ ...card, sectionTitle: payload.imageSections?.[index]?.title }));
      if (!response.ok || !next.length || !headResponse.ok || !headPayload.images?.[0]) throw new Error(payload.error || headPayload.error || "图文包生成失败，请稍后再试。");
      setCards(next); setCoverId(next[0].id); setHeadImage(headPayload.images[0]); setActiveSlide(0); setMessage("完整图文包已生成：包含 1 张头图和按段落生成的章节配图。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "网络连接失败，请重试。"); } finally { setLoading(""); }
  }

  function moveCard(index: number, direction: -1 | 1) { const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= cards.length) return; setCards((current) => { const next = [...current]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; return next; }); }
  function removeCard(id: string) { setCards((current) => current.filter((card) => card.id !== id)); if (id === coverId) setCoverId(cards.find((card) => card.id !== id)?.id ?? ""); }
  function showCopyNotice(label: string) { setCopyNotice(label); window.setTimeout(() => setCopyNotice((current) => current === label ? "" : current), 1800); }
  function copy(value: string, label: string) { void navigator.clipboard.writeText(value).then(() => showCopyNotice(label)).catch(() => setMessage("复制失败，请手动选择文字复制。")); }
  async function copyPackage() { const imageMarkup = [headImage, ...cards].filter((item): item is Card => Boolean(item)).map((image) => `<figure style="margin:18px 0"><img src="${escapeHtml(image.url)}" style="display:block;max-width:100%;border-radius:12px" /><figcaption style="margin-top:6px;color:#64748b;font-size:12px">${escapeHtml(image.sectionTitle || (image.id === headImage?.id ? "小红书头图" : "章节配图"))}</figcaption></figure>`).join(""); const html = `<article style="max-width:680px;color:#1f2937;font-family:Arial,'PingFang SC',sans-serif;line-height:1.8"><h1 style="font-size:28px;line-height:1.35">${escapeHtml(title)}</h1><div style="white-space:pre-wrap">${escapeHtml(body)}</div>${imageMarkup}</article>`; try { if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([`${title}\n\n${body}\n\n${[headImage, ...cards].filter(Boolean).map((image) => (image as Card).url).join("\n")}`], { type: "text/plain" }) })]); else await navigator.clipboard.writeText(`${title}\n\n${body}\n\n${[headImage, ...cards].filter(Boolean).map((image) => (image as Card).url).join("\n")}`); showCopyNotice("package"); } catch { setMessage("完整图文复制失败，请使用下载按钮保存图片。 "); } }
  function download(card: Card, index: number) { const anchor = document.createElement("a"); anchor.href = card.url; anchor.download = `${title}-小红书配图-${index + 1}.png`; anchor.click(); }
  function changeTab(next: Tab) { if (busy && next !== tab) return setMessage("当前内容正在生成，请等待完成后再进入下一步。"); if (next !== "write" && !content) return setMessage("请先生成笔记初稿。"); if (next === "preview" && !assetsReady) return setMessage("请先生成完整图文包，再查看整体预览。"); setTab(next); }

  if (restoring) return <div className="xhsStudioPage page-content"><p className="studioMessage">正在恢复未完成的小红书笔记…</p></div>;
  return <div className="xhsStudioPage page-content">
    <div className="page-back-bar pageBackBar"><a className="back-btn backLink" href={appPath("/create")}>← 返回创作广场</a><span className="subpageBreadcrumb">创作广场 / 小红书笔记创作</span>{workId ? <small className={`xhsSaveStatus ${saveStatus}`}>{saveStatus === "saving" ? "正在保存" : saveStatus === "error" ? "保存失败" : "已保存"}</small> : null}</div>
    <section className="xhsStudioHero"><div><span>小红书图文创作工作台</span><h1>把一个真实想法，做成可发布的图文笔记</h1><p>从素材到图文发布包，用四步完成；任一步都可返回修改。</p></div><div className="xhsProgressWrap"><ol className="xhsProgress">{(["填写素材", "编辑笔记", "生成配图", "整体预览"] as const).map((label, index) => { const step = (["write", "note", "cards", "preview"] as const)[index]; const unavailable = step === "note" ? !canOpenNote : step === "cards" ? !canOpenCards : step === "preview" ? !assetsReady : false; return <li key={label} className={index + 1 <= completedStep ? "done" : ""}><button disabled={unavailable || (busy && tab !== step)} className={tab === step ? "active" : ""} onClick={() => changeTab(step)}><i>{index + 1}</i>{label}</button></li>; })}</ol></div></section>
    {tab === "write" && <section className="xhsStudioPanel xhsComposer"><header><div><span>01 · 确定方向</span><h2>选择创作方式，再交给 AI 完成</h2><p>受众、结构、语气和表达形式均由模型自动判断；你只需要确定素材来源与长度。</p></div><em>{app.points} 积分 / 篇</em></header><label className="xhsTopic">{creationMode === "rewrite" ? "粘贴准备重写的原文" : "写下创作想法"} <small>{topic.length}/6000</small><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={creationMode === "rewrite" ? "粘贴完整原文。系统只会重组表达，不会补造或改变其中事实。" : "例如：年轻家庭如何安排应急现金和基础保障；系统会检索公开资料补足可核验事实。"} maxLength={6000} /></label><div className="xhsChoiceGrid"><Choice label="创作方式" value={creationMode} onChange={setCreationMode} options={app.fields.find((field) => field.id === "creation_mode")?.options ?? []} /><Choice label="笔记长度" value={lengthMode} onChange={setLengthMode} options={app.fields.find((field) => field.id === "length_mode")?.options ?? []} /></div><div className="xhsComposerFooter"><span>{loading === "note" ? <b className="xhsGenerating"><i />{creationMode === "idea" ? "正在检索并创作，请稍候" : "正在重写，请稍候"}</b> : creationMode === "idea" ? "会先检索公开资料，再生成标题、正文、标签和互动结尾" : "会保持原文事实，重组为更适合小红书阅读的笔记"}</span><div className="xhsNextAction">{!topic.trim() ? <small>还差：填写原文或创作想法</small> : null}<button className="studioPrimary" disabled={busy || !topic.trim()} onClick={generateNote}>{loading === "note" ? "正在生成…" : "生成笔记初稿 →"}</button></div></div></section>}
    {tab === "note" && <section className="xhsWorkspace"><section className="xhsStudioPanel xhsEditor"><header><div><span>02 · 编辑笔记</span><h2>{loading === "note" ? <b className="xhsGenerating"><i />正在生成初稿</b> : "先把内容改成你的表达"}</h2></div><button disabled={busy || !content.trim()} onClick={() => copy(content, "笔记")}>复制全文</button></header><textarea ref={editorRef} className="xhsNoteEditor" value={content} onChange={(event) => setContent(event.target.value)} aria-label="编辑小红书笔记" readOnly={loading === "note"} /><div className="xhsEditorMeta"><span>{content.replace(/\s/g, "").length} 字</span><span>{tags.length ? `${tags.length} 个标签` : "尚未识别到标签"}</span><span>{loading === "note" ? "正在自动续写，请稍候" : "涉及案例、数据、规则时请核验"}</span></div><div className="studioStepActions"><button className="studioSecondary" disabled={busy} onClick={() => changeTab("write")}>← 返回方向</button><button className="studioPrimary" disabled={busy || !content.trim()} onClick={() => changeTab("cards")}>{loading === "note" ? "正在生成，暂不能继续" : !content.trim() ? "还未生成笔记" : "继续生成配图 →"}</button></div></section><PhonePreview title={title} body={body} cover={cover} cards={cards} mode={previewMode} onModeChange={setPreviewMode} activeSlide={activeSlide} onSlideChange={setActiveSlide} /></section>}
    {tab === "cards" && <section className="xhsStudioPanel"><header className="xhsCardsHead"><div><span>03 · 图文配图</span><h2>一键生成完整图文包</h2><p>复用公众号文章配图策略：封面与章节图使用同一风格，一次并行生成；章节按正文结构拆分，最多 5 张。</p></div></header><div className="xhsStylePicker xhsStyleGallery">{visualStyles.map((item) => <button disabled={busy} key={item.value} className={style === item.value ? "active" : ""} onClick={() => setStyle(item.value)}><img src={item.preview} alt="" /><strong>{item.label}</strong><span>{item.note}</span></button>)}</div><div className="xhsGeneratePackage"><div><span>AI 图文包</span><strong>1 张 3:4 头图 + 最多 5 张章节配图</strong><p>一次生成，结果区会分别标识头图与章节配图。</p></div><button className="studioPrimary" disabled={busy} onClick={generateImages}>{loading === "cards" ? <b className="xhsGenerating"><i />正在生成完整图文包…</b> : assetsReady ? "重新生成完整图文包" : "生成完整图文包"}</button></div>{headImage ? <div className="xhsGeneratedHead"><div><span>头图 · 首屏封面</span><img src={headImage.url} alt="小红书头图" /><div className="studioImageActions"><button disabled={busy} onClick={() => setFullImage({ url: headImage.url, label: "小红书头图" })}>查看全图</button><button disabled={busy} onClick={() => download(headImage, 0)}>下载</button></div></div></div> : null}{cards.length ? <div className="xhsGeneratedSections"><span>章节配图 · {cards.length} 张</span><div className="xhsCardGrid">{cards.map((card, index) => <figure key={card.id}><img src={card.url} alt={`章节配图 ${index + 1}`} /><figcaption><strong>第 {index + 1} 张</strong><span>{card.sectionTitle || "章节配图"}</span></figcaption><div><button disabled={busy} onClick={() => setFullImage({ url: card.url, label: card.sectionTitle || `章节配图 ${index + 1}` })}>查看全图</button><button disabled={busy || index === 0} onClick={() => moveCard(index, -1)}>←</button><button disabled={busy || index === cards.length - 1} onClick={() => moveCard(index, 1)}>→</button><button disabled={busy} className="danger" onClick={() => removeCard(card.id)}>移除</button><button disabled={busy} onClick={() => download(card, index + 1)}>下载</button></div></figure>)}</div></div> : <div className="xhsEmpty"><b>{loading === "cards" ? <span className="xhsGenerating"><i />正在分析段落并绘制图文包</span> : "还没有生成图文包"}</b><span>{loading === "cards" ? "头图和章节配图会并行生成，请稍候。" : "先选择视觉风格，再一键生成头图与章节配图。"}</span></div>}<div className="studioStepActions"><button className="studioSecondary" disabled={busy} onClick={() => changeTab("note")}>← 返回编辑</button><button className="studioPrimary" disabled={busy || !assetsReady} onClick={() => changeTab("preview")}>{!assetsReady ? "图文包尚未完成" : "下一步：整体预览 →"}</button></div></section>}
    {tab === "preview" && <section className={`xhsStudioPanel xhsFinalPreview ${previewMode === "album" ? "albumPreview" : "longPreview"}`}><header className="xhsCardsHead"><div><span>04 · 整体预览</span><h2>确认这篇笔记的完整发布效果</h2><p>选择长文时查看插图后的阅读流；选择图文卡片时，页面与手机同步切换为卡片流。</p></div></header><div className="xhsFinalPreviewGrid"><PhonePreview title={title} body={body} cover={cover} cards={cards} mode={previewMode} onModeChange={setPreviewMode} activeSlide={activeSlide} onSlideChange={setActiveSlide} />{previewMode === "long" ? <XhsArticleWithImages title={title} body={body} cards={cards} /> : <XhsCardDeck title={title} body={body} cards={cards} activeSlide={activeSlide} onSlideChange={setActiveSlide} />}</div><div className="xhsPublishActions"><CopyControl label="title" notice={copyNotice} onClick={() => copy(title, "title")}>复制标题</CopyControl><CopyControl label="body" notice={copyNotice} onClick={() => copy(body, "body")}>复制正文与标签</CopyControl><CopyControl label="package" notice={copyNotice} onClick={() => void copyPackage()}>复制完整图文</CopyControl><span>已复制完整图文时，会一并带入排版和图片。</span></div><div className="studioStepActions"><button className="studioSecondary" onClick={() => changeTab("cards")}>← 上一步：修改配图</button><button className="studioPrimary" onClick={() => copyPackage()}>复制并准备发布</button></div></section>}
    {message && <p className={`studioMessage ${message.includes("失败") || message.includes("请先") ? "error" : ""}`}>{message}</p>}
    {fullImage ? createPortal(<div className="studioFullImageBackdrop" role="presentation" onMouseDown={() => setFullImage(null)}><section className="studioFullImageDialog" role="dialog" aria-modal="true" aria-label={`${fullImage.label}全图预览`} onMouseDown={(event) => event.stopPropagation()}><header><strong>{fullImage.label}</strong><button type="button" aria-label="关闭全图预览" onClick={() => setFullImage(null)}>×</button></header><div><img src={fullImage.url} alt={`${fullImage.label}全图`} /></div></section></div>, document.body) : null}
  </div>;
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) { return <fieldset className="xhsChoices"><legend>{label}</legend><div>{options.map((option) => <button type="button" className={value === option.value ? "active" : ""} onClick={() => onChange(option.value)} key={option.value}>{option.label}</button>)}</div></fieldset>; }
function CopyControl({ label, notice, onClick, children }: { label: string; notice: string; onClick: () => void; children: React.ReactNode }) { return <span className="xhsCopyControl"><button onClick={onClick}>{children}</button>{notice === label ? <i className="xhsCopyBubble">已复制</i> : null}</span>; }
function XhsArticleWithImages({ title, body, cards }: { title: string; body: string; cards: Card[] }) { const paragraphs = body.split(/\n\s*\n/).filter(Boolean); return <article className="xhsInlineArticle"><h1>{title}</h1>{paragraphs.map((paragraph, index) => <div key={`${index}-${paragraph.slice(0, 12)}`}><ReactMarkdown>{paragraph}</ReactMarkdown>{cards.filter((_, cardIndex) => Math.floor((cardIndex + 1) * (paragraphs.length + 1) / (cards.length + 1)) === index + 1).map((card) => <figure key={card.id}><img src={card.url} alt={card.sectionTitle || "章节配图"} /><figcaption>{card.sectionTitle || "章节配图"}</figcaption></figure>)}</div>)}</article>; }
function XhsCardDeck({ title, body, cards, activeSlide, onSlideChange }: { title: string; body: string; cards: Card[]; activeSlide: number; onSlideChange: (index: number) => void }) { const texts = splitForCardPreview(body); const slides = cards.map((card, index) => ({ ...card, text: texts[index] || card.sectionTitle || "笔记配图" })); const index = Math.min(activeSlide, Math.max(0, slides.length - 1)); const slide = slides[index]; return <section className="xhsPreviewDeck">{slide ? <><div className="xhsPreviewDeckCard"><img src={slide.url} alt="图文卡片预览" /><div>{index === 0 ? <h3>{title}</h3> : null}<p>{slide.text}</p></div></div><nav><button disabled={index === 0} onClick={() => onSlideChange(index - 1)}>←</button><span>{index + 1} / {slides.length}</span><button disabled={index === slides.length - 1} onClick={() => onSlideChange(index + 1)}>→</button></nav></> : null}</section>; }
function PhonePreview({ title, body, cover, cards, mode, onModeChange, activeSlide, onSlideChange }: { title: string; body: string; cover: Card | null; cards: Card[]; mode: "long" | "album"; onModeChange: (mode: "long" | "album") => void; activeSlide: number; onSlideChange: (index: number) => void }) { const textSlides = splitForCardPreview(body); const slides: Array<{ image?: string; text: string }> = cards.length ? cards.map((card, index) => ({ image: card.url, text: textSlides[index] || card.sectionTitle || "笔记配图" })) : textSlides.map((text) => ({ text })); const visibleIndex = Math.min(activeSlide, Math.max(slides.length - 1, 0)); const current = slides[visibleIndex]; return <div className="xhsPhonePreview"><div className="xhsPreviewModes"><button className={mode === "long" ? "active" : ""} onClick={() => onModeChange("long")}>长文模式</button><button className={mode === "album" ? "active" : ""} onClick={() => onModeChange("album")}>图文卡片模式</button></div><aside className={`xhsPhone ${mode === "long" ? "long" : "album"}`}><div className="xhsPhoneTop"><i /> <span>小红书预览</span><i /></div>{mode === "long" ? <div className="xhsPhoneLongScroll">{cover ? <img src={cover.url} alt="笔记封面预览" /> : <div className="xhsPhoneCover">封面将在配图生成后显示</div>}<div className="xhsPhoneContent"><h3>{title}</h3><ReactMarkdown>{body}</ReactMarkdown></div></div> : <div className="xhsAlbum"><div className="xhsAlbumSlide">{current?.image ? <><img src={current.image} alt={`图文卡片 ${visibleIndex + 1}`} /><div className="xhsAlbumImageCopy">{visibleIndex === 0 ? <strong>{title}</strong> : null}<p>{current.text}</p></div></> : <div>{visibleIndex === 0 ? <strong>{title}</strong> : null}<p>{current?.text || "将笔记拆成一组可左右滑动的图文卡片"}</p></div>}</div><div className="xhsAlbumControls"><button disabled={visibleIndex <= 0} onClick={() => onSlideChange(visibleIndex - 1)}>←</button><span>{slides.length ? `${visibleIndex + 1} / ${slides.length}` : "0 / 0"}</span><button disabled={visibleIndex >= slides.length - 1} onClick={() => onSlideChange(visibleIndex + 1)}>→</button></div></div>}</aside></div>; }

function splitForCardPreview(body: string) { const limit = 250; const paragraphs = body.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean); const slides: string[] = []; let current = ""; for (const paragraph of paragraphs) { if (current && current.length + paragraph.length + 2 > limit) { slides.push(current); current = paragraph; } else current = current ? `${current}\n\n${paragraph}` : paragraph; } if (current) slides.push(current); return slides.slice(0, 5); }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character); }
