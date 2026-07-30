"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";

const scenarios = ["客户方案讲解", "内部培训", "销售汇报", "活动分享"];
const audiences = ["客户沟通", "团队主管", "保险代理人", "管理层"];
const styles = [
  { value: "professional", name: "专业商务", hint: "清晰、克制、适合正式沟通", swatches: ["#12314a", "#13a69a", "#e6f5f2"] },
  { value: "simple", name: "简洁科普", hint: "信息直观，适合讲清复杂问题", swatches: ["#2364aa", "#f5b841", "#f4f8ff"] },
  { value: "training", name: "培训讲解", hint: "步骤明确，方便跟讲与复盘", swatches: ["#5947b2", "#f06d5d", "#f7f5ff"] },
  { value: "brand", name: "品牌宣传", hint: "强化主题印象与叙事节奏", swatches: ["#1c6159", "#f1a84a", "#eff7f4"] },
];
const starters = [
  { title: "客户保障沟通", text: "为 30—45 岁已婚家庭讲清家庭现金流、医疗费用和保障缺口，面向线下客户沟通。" },
  { title: "新人培训课件", text: "为新加入团队的保险顾问制作一份客户需求访谈培训课件，强调合规表达与可执行动作。" },
  { title: "季度经营复盘", text: "围绕本季度客户服务、内容触达和团队协作，向管理层汇报成果、问题与下一步计划。" },
];

export function PptMakerPageClient() {
  const router = useRouter();
  const [topic, setTopic] = useState(""); const [source, setSource] = useState(""); const [audience, setAudience] = useState("客户沟通");
  const [scenario, setScenario] = useState("客户方案讲解"); const [style, setStyle] = useState("professional"); const [pageCount, setPageCount] = useState(8);
  const [uploading, setUploading] = useState(false); const [submitting, setSubmitting] = useState(false); const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState(""); const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedStyle = styles.find((item) => item.value === style) ?? styles[0];
  const inputReady = Boolean(topic.trim() || source.trim());
  const contentSummary = useMemo(() => source.trim() ? `${Math.min(source.trim().length, 99999).toLocaleString()} 字资料已准备` : "尚未添加资料", [source]);

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
      const response = await fetch(apiPath("/api/creation/ppt/jobs"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, source, audience, scenario, style, pageCount }) });
      const payload = await response.json() as { job?: { jobId: string }; error?: string };
      if (!response.ok || !payload.job) throw new Error(payload.error || "任务创建失败");
      router.push(appPath(`/apps/ppt-maker/result/${payload.job.jobId}`));
    } catch (error) { setMessage(error instanceof Error ? error.message : "任务创建失败"); } finally { setSubmitting(false); }
  }

  function applyStarter(text: string) { setTopic(text); setMessage("已填入示例方向，可按你的实际场景修改。"); }

  return <main className="pptStudio pageStack">
    <section className="pptHero"><a className="pptBackLink" href={appPath("/create")}>← 返回轻松创作</a><div className="pptHeroGrid"><div><span className="pptEyebrow">PRESENTATION STUDIO</span><h1>把真实资料，变成一份<br />拿得出手的 PPT</h1><p>本地 Agent 会调用 Codex CLI 完成结构、版式与文件检查。生成后可直接下载并继续编辑。</p><div className="pptTrustRow"><span>✓ 资料仅用于本次任务</span><span>✓ 可编辑 PPTX</span><span>✓ 自动结构检查</span></div></div><div className="pptHeroPreview" aria-hidden="true"><div className="pptPreviewTop">YOUR PRESENTATION <span>01</span></div><strong>先把复杂问题<br />讲清楚</strong><div className="pptPreviewLines"><i /><i /><i /></div><div className="pptPreviewDot" /></div></div></section>

    <div className="pptStudioGrid"><section className="pptComposer"><div className="pptSectionHeading"><div><span>01 · 内容</span><h2>先给我一个清晰的方向</h2><p>主题和资料至少填写一项。资料越完整，内容越贴近真实沟通。</p></div><span className={`pptReadiness ${inputReady ? "isReady" : ""}`}>{inputReady ? "内容已就绪" : "等待输入"}</span></div>
      <div className="pptStarters">{starters.map((item) => <button key={item.title} type="button" onClick={() => applyStarter(item.text)}><b>{item.title}</b><span>一键带入方向</span></button>)}</div>
      <label className="pptField"><span>主题或核心要求 <em>推荐填写</em></span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：为 30—45 岁已婚家庭讲清重疾险保障缺口，面向线下客户沟通" rows={4} /><small>{topic.trim().length}/120 · 说清对象、场景和希望讲透的问题即可</small></label>
      <label className="pptField"><span>补充资料 <em>可选</em></span><textarea value={source} onChange={(event) => setSource(event.target.value)} placeholder="可粘贴文章、口播稿、方案要点或会议纪要。不要提供客户身份证号、保单号等敏感信息。" rows={8} /><small>{contentSummary} · 支持继续编辑或清空</small></label>
      <input ref={fileInputRef} className="pptFileInput" type="file" accept=".txt,.md,.docx,.pdf" onChange={(event) => void importFile(event.target.files?.[0])} />
      <div className={`pptDropzone ${dragging ? "isDragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void importFile(event.dataTransfer.files?.[0]); }}><div className="pptDropIcon">↥</div><div><b>{uploading ? "正在读取资料…" : fileName ? `已添加：${fileName}` : "上传资料，让结构更完整"}</b><span>TXT、MD、DOCX、PDF · 最大 10MB</span></div><button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{fileName ? "更换文件" : "选择文件"}</button></div>
      {message ? <div className="pptMessage" role="status">{message}</div> : null}

      <div className="pptDivider" /><div className="pptSectionHeading compact"><div><span>02 · 呈现</span><h2>选择最适合的表达方式</h2></div></div>
      <div className="pptOptionRow"><label>使用场景<select value={scenario} onChange={(event) => setScenario(event.target.value)}>{scenarios.map((item) => <option key={item}>{item}</option>)}</select></label><label>目标受众<select value={audience} onChange={(event) => setAudience(event.target.value)}>{audiences.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <div className="pptStyleGrid">{styles.map((item) => <button key={item.value} type="button" className={style === item.value ? "selected" : ""} onClick={() => setStyle(item.value)}><span className="pptPalette">{item.swatches.map((swatch) => <i key={swatch} style={{ background: swatch }} />)}</span><b>{item.name}</b><small>{item.hint}</small></button>)}</div>
      <div className="pptLengthSelector"><div><b>预计页数</b><span>按讲述深度自动安排信息密度</span></div><div>{[5, 8, 12].map((count) => <button key={count} type="button" className={pageCount === count ? "selected" : ""} onClick={() => setPageCount(count)}>{count}<small>页</small></button>)}</div></div>
    </section>

    <aside className="pptReview"><div className="pptReviewCard"><span className="pptEyebrow">READY TO CREATE</span><h2>这次会生成</h2><div className="pptReviewTitle">{topic.trim() || "等待你的主题"}</div><dl><div><dt>使用场景</dt><dd>{scenario}</dd></div><div><dt>目标受众</dt><dd>{audience}</dd></div><div><dt>视觉风格</dt><dd><i style={{ background: selectedStyle.swatches[0] }} />{selectedStyle.name}</dd></div><div><dt>输出规格</dt><dd>{pageCount} 页 · 16:9 · PPTX</dd></div></dl><div className="pptEstimate"><span>预计生成时间</span><b>约 2–5 分钟</b></div><button className="pptCreateButton" type="button" onClick={() => void submit()} disabled={submitting || uploading || !inputReady}>{submitting ? "正在创建任务…" : "开始制作 PPT"}<span>12 积分</span></button><p>提交后可离开页面，任务会继续在本地完成。</p></div>
      <div className="pptTipCard"><b>做得更好的小建议</b><p>写清“给谁讲、要解决什么、最终想让对方做什么”，比堆很多材料更有效。</p></div></aside>
    </div>

  </main>;
}
