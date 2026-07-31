"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";

const styles = [
  { value: "professional", name: "专业商务", hint: "清晰、克制、适合正式沟通", swatches: ["#12314a", "#13a69a", "#e6f5f2"] },
  { value: "simple", name: "简洁科普", hint: "信息直观，适合讲清复杂问题", swatches: ["#2364aa", "#f5b841", "#f4f8ff"] },
  { value: "training", name: "培训讲解", hint: "步骤明确，方便跟讲与复盘", swatches: ["#5947b2", "#f06d5d", "#f7f5ff"] },
  { value: "brand", name: "品牌宣传", hint: "强化主题印象与叙事节奏", swatches: ["#1c6159", "#f1a84a", "#eff7f4"] },
];
type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<ArrayLike<SpeechRecognitionAlternative>> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  const browserWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

export function PptMakerPageClient() {
  const router = useRouter();
  const [topic, setTopic] = useState(""); const [source, setSource] = useState(""); const [style, setStyle] = useState("professional"); const [pageCount, setPageCount] = useState(8);
  const [uploading, setUploading] = useState(false); const [submitting, setSubmitting] = useState(false); const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState(""); const [dragging, setDragging] = useState(false);
  const [listeningField, setListeningField] = useState<"topic" | "source" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const selectedStyle = styles.find((item) => item.value === style) ?? styles[0];
  const inputReady = Boolean(topic.trim() || source.trim());
  const contentSummary = useMemo(() => source.trim() ? `${Math.min(source.trim().length, 99999).toLocaleString()} 字资料已准备` : "尚未添加资料", [source]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  async function importFile(file: File | undefined) {
    if (!file) return; setUploading(true); setMessage(""); setFileName(file.name);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch(apiPath("/api/creation/import-text"), { method: "POST", body: form });
      const payload = await response.json() as { text?: string; error?: string };
      if (!response.ok || !payload.text) throw new Error(payload.error || "资料解析失败");
      setSource(payload.text); setMessage(`已提取《${file.name}》的内容。你可以继续编辑，或直接开始生成。`);
    } catch (error) { setFileName(""); setMessage(error instanceof Error ? error.message : "资料解析失败"); } finally { setUploading(false); }
  }

  async function submit() {
    setMessage(""); if (!inputReady) { setMessage("先填写主题，或添加一份资料。 "); return; }
    setSubmitting(true);
    try {
      const response = await fetch(apiPath("/api/creation/ppt/jobs"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, source, style, pageCount }) });
      const payload = await response.json() as { job?: { jobId: string }; error?: string };
      if (!response.ok || !payload.job) throw new Error(payload.error || "任务创建失败");
      router.push(appPath(`/apps/ppt-maker/result/${payload.job.jobId}`));
    } catch (error) { setMessage(error instanceof Error ? error.message : "任务创建失败"); } finally { setSubmitting(false); }
  }

  function toggleVoiceInput(field: "topic" | "source") {
    if (listeningField) { recognitionRef.current?.stop(); return; }
    const Recognition = getSpeechRecognition();
    if (!Recognition) { setMessage("当前浏览器不支持语音输入，请使用最新版 Chrome 或 Safari。 "); return; }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).slice(event.resultIndex).map((result) => result[0]?.transcript ?? "").join("").trim();
      if (!transcript) return;
      if (field === "topic") setTopic((value) => `${value}${value ? " " : ""}${transcript}`.slice(0, 120));
      else setSource((value) => `${value}${value ? "\n" : ""}${transcript}`.slice(0, 60000));
    };
    recognition.onerror = () => { setMessage("语音识别未能完成，请检查麦克风权限后重试。"); };
    recognition.onend = () => { recognitionRef.current = null; setListeningField(null); };
    recognitionRef.current = recognition;
    setListeningField(field);
    try { recognition.start(); } catch { setListeningField(null); setMessage("语音输入暂时无法启动，请稍后重试。"); }
  }

  return <main className="pptStudio pageStack">
    <section className="pptHero"><a className="pptBackLink" href={appPath("/create")}>← 返回创作广场</a><div className="pptHeroGrid"><div><span className="pptEyebrow">PRESENTATION STUDIO</span><h1>把真实资料，变成一份<br />拿得出手的 PPT</h1><p>输入想法或上传资料，轻松生成一份可下载、可编辑的专业 PPT。</p><div className="pptTrustRow"><span>✓ 资料仅用于本次任务</span><span>✓ 可编辑 PPTX</span><span>✓ 自动结构检查</span></div></div><div className="pptHeroPreview" aria-hidden="true"><div className="pptPreviewTop">YOUR PRESENTATION <span>01</span></div><strong>先把复杂问题<br />讲清楚</strong><div className="pptPreviewLines"><i /><i /><i /></div><div className="pptPreviewDot" /></div></div></section>

    <div className="pptStudioGrid"><section className="pptComposer"><div className="pptSectionHeading"><div><span>01 · 内容</span><h2>先给我一个清晰的方向</h2><p>主题和资料至少填写一项。资料越完整，内容越贴近真实沟通。</p></div><span className={`pptReadiness ${inputReady ? "isReady" : ""}`}>{inputReady ? "内容已就绪" : "等待输入"}</span></div>
      <label className="pptField"><span>主题或核心要求 <em>推荐填写</em></span><div className="pptVoiceField"><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：为 30—45 岁已婚家庭讲清重疾险保障缺口，面向线下客户沟通" rows={4} /><button className={listeningField === "topic" ? "isListening" : ""} type="button" onClick={() => toggleVoiceInput("topic")} aria-label="语音输入主题">{listeningField === "topic" ? "■ 停止" : "◉ 语音输入"}</button></div><small>{listeningField === "topic" ? "正在聆听，请开始说话…" : `${topic.trim().length}/120 · 也可点击语音输入，说清对象、场景和希望讲透的问题`}</small></label>
      <label className="pptField"><span>补充资料 <em>可选</em></span><div className="pptVoiceField"><textarea value={source} onChange={(event) => setSource(event.target.value)} placeholder="可粘贴文章、口播稿、方案要点或会议纪要。不要提供客户身份证号、保单号等敏感信息。" rows={8} /><button className={listeningField === "source" ? "isListening" : ""} type="button" onClick={() => toggleVoiceInput("source")} aria-label="语音输入补充资料">{listeningField === "source" ? "■ 停止" : "◉ 语音输入"}</button></div><small>{listeningField === "source" ? "正在聆听，请开始说话…" : `${contentSummary} · 支持继续编辑、清空或语音补充`}</small></label>
      <input ref={fileInputRef} className="pptFileInput" type="file" accept=".txt,.md,.docx,.pdf" onChange={(event) => void importFile(event.target.files?.[0])} />
      <div className={`pptDropzone ${dragging ? "isDragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void importFile(event.dataTransfer.files?.[0]); }}><div className="pptDropIcon">↥</div><div><b>{uploading ? "正在读取资料…" : fileName ? `已添加：${fileName}` : "上传资料，让结构更完整"}</b><span>TXT、MD、DOCX、PDF · 最大 10MB</span></div><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{fileName ? "更换文件" : "选择文件"}</button></div>
      {message ? <div className="pptMessage" role="status">{message}</div> : null}

      <div className="pptDivider" /><div className="pptSectionHeading compact"><div><span>02 · 呈现</span><h2>选择最适合的表达方式</h2></div></div>
      <div className="pptStyleGrid">{styles.map((item) => <button key={item.value} type="button" className={style === item.value ? "selected" : ""} onClick={() => setStyle(item.value)}><span className="pptPalette">{item.swatches.map((swatch) => <i key={swatch} style={{ background: swatch }} />)}</span><b>{item.name}</b><small>{item.hint}</small></button>)}</div>
      <div className="pptLengthSelector"><div><b>预计页数</b><span>按讲述深度自动安排信息密度</span></div><div>{[5, 8, 12].map((count) => <button key={count} type="button" className={pageCount === count ? "selected" : ""} onClick={() => setPageCount(count)}>{count}<small>页</small></button>)}</div></div>
    </section>

    <aside className="pptReview"><div className="pptReviewCard"><span className="pptEyebrow">READY TO CREATE</span><h2>这次会生成</h2><div className="pptReviewTitle">{topic.trim() || "等待你的主题"}</div><dl><div><dt>视觉风格</dt><dd><i style={{ background: selectedStyle.swatches[0] }} />{selectedStyle.name}</dd></div><div><dt>输出规格</dt><dd>{pageCount} 页 · 16:9 · PPTX</dd></div></dl><div className="pptEstimate"><span>预计生成时间</span><b>约 2–5 分钟</b></div><button className="pptCreateButton" type="button" onClick={() => void submit()} disabled={submitting || uploading || !inputReady}>{submitting ? "正在创建任务…" : "开始制作 PPT"}<span>12 积分</span></button><p>提交后可离开页面，任务会继续在本地完成。</p></div>
      <div className="pptTipCard"><b>做得更好的小建议</b><p>写清“给谁讲、要解决什么、最终想让对方做什么”，比堆很多材料更有效。</p></div></aside>
    </div>

  </main>;
}
