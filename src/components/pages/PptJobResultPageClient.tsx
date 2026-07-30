"use client";

import { useEffect, useState } from "react";
import { apiPath, appPath } from "@/lib/client/url";

type Job = { id: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; title: string; errorMessage: string | null; pageCount: number | null };

function stageFor(status: Job["status"]) {
  if (status === "queued") return 1;
  if (status === "running") return 2;
  if (status === "succeeded") return 4;
  return 0;
}

export function PptJobResultPageClient({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [message, setMessage] = useState("正在读取任务状态…");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const refresh = async () => {
      try {
        const response = await fetch(apiPath(`/api/creation/ppt/jobs/${jobId}`), { cache: "no-store" });
        const payload = await response.json().catch(() => ({})) as { job?: Job; task?: { status?: string }; error?: string };
        if (!response.ok || !payload.job) throw new Error(payload.error || "未找到这份 PPT 任务");
        setJob(payload.job.status === "queued" && payload.task?.status === "leased" ? { ...payload.job, status: "running" } : payload.job);
        setMessage("");
      } catch (error) { setMessage(error instanceof Error ? error.message : "读取任务失败"); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    const elapsedTimer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => { window.clearInterval(timer); window.clearInterval(elapsedTimer); };
  }, [jobId]);

  const status = job?.status ?? "queued";
  const stage = stageFor(status);
  const isFinished = status === "succeeded" || status === "failed" || status === "cancelled";
  const description = !job ? message : status === "queued" ? "任务已提交，正在连接你的本地 PPT 引擎。" : status === "running" ? `正在设计和排版 · 已用时 ${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒` : status === "succeeded" ? `已完成 · 共 ${job.pageCount ?? ""} 页，可下载后继续编辑。` : job.errorMessage || "本次生成未完成。";
  const statusLabel = status === "succeeded" ? "已完成" : status === "running" ? "制作中" : status === "queued" ? "排队中" : "需要重试";

  return <main className="pptStudio pptResultPage pageStack">
    <section className={`pptResultHero ${status}`}><a className="pptBackLink" href={appPath("/apps/ppt-maker")}>← 返回编辑</a><div className="pptResultHeroGrid"><div><span className="pptEyebrow">PRESENTATION RESULT</span><h1>{status === "succeeded" ? "你的 PPT 已准备好" : status === "failed" || status === "cancelled" ? "这次制作没有完成" : "正在为你制作 PPT"}</h1><p>{description}</p></div><div className="pptResultSeal" aria-label={`当前状态：${statusLabel}`}><span>{status === "succeeded" ? "✓" : status === "failed" || status === "cancelled" ? "!" : "↗"}</span><b>{statusLabel}</b><small>{status === "succeeded" ? "文件已通过检查" : status === "running" ? "请保持此页面打开" : "状态会自动刷新"}</small></div></div></section>
    <div className="pptResultLayout"><section className={`pptJobPanel ${status}`}><div className="pptJobHeader"><div><span className="pptEyebrow">PRESENTATION TASK</span><h2>{job?.title || "正在加载作品信息"}</h2><p>{isFinished ? "任务状态已更新。" : "本页会自动刷新，无需重复提交。"}</p></div><span className={`pptJobStatus ${status}`}>{statusLabel}</span></div>
        <ol className="pptProgress"><li className={stage >= 1 ? "done" : ""}><i>1</i><div><b>接收任务</b><span>整理你的输入</span></div></li><li className={stage >= 2 ? "done" : ""}><i>2</i><div><b>设计内容</b><span>搭建叙事与页结构</span></div></li><li className={stage >= 3 ? "done" : ""}><i>3</i><div><b>生成与检查</b><span>输出可编辑文件</span></div></li><li className={stage >= 4 ? "done" : ""}><i>4</i><div><b>交付下载</b><span>文件已准备就绪</span></div></li></ol>
        {!isFinished ? <div className="pptResultWaiting"><span className="pptPulse" /><div><b>{status === "queued" ? "正在等待本地 Agent 接手" : "正在创作，请稍候"}</b><small>完成后下载按钮会自动出现。</small></div></div> : null}
        {status === "succeeded" && job ? <div className="pptDeliveryCard"><div className="pptFileIcon">P</div><div><b>{job.title || "演示文稿"}.pptx</b><span>{job.pageCount ?? "—"} 页 · 16:9 · 可编辑 PowerPoint 文件</span></div><a className="pptCreateButton" href={apiPath(`/api/creation/ppt/jobs/${job.id}/download`)}>下载 PPTX<span>立即保存</span></a></div> : status === "failed" || status === "cancelled" ? <div className="pptResultFailure"><b>没有产生可下载的文件</b><span>可返回编辑页补充信息或调整表达方式后再试一次。</span><a className="pptCreateButton" href={appPath("/apps/ppt-maker")}>返回编辑<span>重新制作</span></a></div> : null}
      </section><aside className="pptResultAside"><div><span className="pptEyebrow">DELIVERY NOTE</span><b>{status === "succeeded" ? "下载后即可继续编辑" : "你的内容正在安全处理"}</b><p>{status === "succeeded" ? "文件为标准 PPTX 格式，可使用 PowerPoint、Keynote 或 WPS 打开。" : "生成任务在本地 Agent 完成；即使离开页面，也可以在“创作历史”中继续查看。"}</p></div><ul><li><i>✓</i> 仅处理本次提交的资料</li><li><i>✓</i> 输出可编辑的 PPTX 文件</li><li><i>✓</i> 已执行文件完整性检查</li></ul><a href={appPath("/apps/ppt-maker")}>制作另一份 PPT →</a></aside></div>
  </main>;
}
