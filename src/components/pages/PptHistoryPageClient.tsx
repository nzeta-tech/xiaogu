"use client";

import { useEffect, useState } from "react";
import { appPath } from "@/lib/client/url";

type Job = { id: string; status: "queued" | "running" | "succeeded" | "failed" | "cancelled"; title: string; pageCount: number | null; createdAt: string };

export function PptHistoryPageClient() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void fetch(appPath("/api/creation/ppt/jobs"), { cache: "no-store" }).then(async (response) => {
    const payload = await response.json().catch(() => ({})) as { jobs?: Job[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "作品历史读取失败");
    setJobs(payload.jobs ?? []);
  }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "作品历史读取失败")); }, []);

  return <main className="pptStudio pptResultPage pageStack"><section className="pptResultHero"><div className="pptResultNav"><a className="pptBackLink" href={appPath("/apps/ppt-maker")}>← 制作新 PPT</a></div><span className="pptEyebrow">PRESENTATION LIBRARY</span><h1>我的 PPT 作品</h1><p>已生成、制作中和未完成的演示文稿都会保留在这里。</p></section><section className="pptHistoryList">{error ? <p className="pptMessage">{error}</p> : jobs === null ? <p className="pptHistoryEmpty">正在读取作品历史…</p> : jobs.length === 0 ? <div className="pptHistoryEmpty"><b>还没有 PPT 作品</b><span>完成第一份 PPT 后，它会出现在这里。</span><a className="pptCreateButton" href={appPath("/apps/ppt-maker")}>开始制作 PPT</a></div> : jobs.map((job) => <a className="pptHistoryItem" key={job.id} href={appPath(`/apps/ppt-maker/result/${job.id}`)}><div><span className={`pptJobStatus ${job.status}`}>{job.status === "succeeded" ? "已完成" : job.status === "running" ? "制作中" : job.status === "queued" ? "排队中" : "未完成"}</span><b>{job.title}</b><small>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(job.createdAt))}{job.pageCount ? ` · ${job.pageCount} 页` : ""}</small></div><span>查看详情 →</span></a>)}</section></main>;
}
