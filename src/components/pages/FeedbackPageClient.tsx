"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiPath } from "@/lib/client/url";

type FeedbackTicket = {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  priority: string;
  admin_reply: string;
  created_at: string;
  updated_at: string;
};

export function FeedbackPageClient() {
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [form, setForm] = useState({ title: "", content: "", category: "general", priority: "normal" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadTickets() {
    const response = await fetch(apiPath("/api/feedback"));
    const payload = (await response.json()) as { tickets?: FeedbackTicket[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "反馈记录加载失败");
      return;
    }
    setTickets(payload.tickets ?? []);
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const response = await fetch(apiPath("/api/feedback"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "反馈提交失败");
      return;
    }
    setForm({ title: "", content: "", category: "general", priority: "normal" });
    await loadTickets();
    setNotice("反馈已提交，我们会尽快处理。");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTickets();
  }, []);

  return (
    <div className="pageStack">
      <div className="topbar">
        <div>
          <h1>反馈与支持</h1>
          <div>提交使用问题、内容建议或账单疑问，处理进展会在这里更新。</div>
        </div>
      </div>

      {error ? <div className="panel alertPanel">{error}</div> : null}
      {notice ? <div className="panel successPanel">{notice}</div> : null}

      <div className="adminGrid">
        <section className="panel">
          <div className="panelHeader">
            <h2>提交反馈</h2>
          </div>
          <form className="stackForm" onSubmit={submitFeedback}>
            <input value={form.title} placeholder="标题" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
            <textarea value={form.content} placeholder="请描述遇到的问题或建议" onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} />
            <div className="inlineFields">
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                <option value="general">一般问题</option>
                <option value="bug">功能异常</option>
                <option value="billing">账单积分</option>
                <option value="content">内容效果</option>
                <option value="account">账号问题</option>
              </select>
              <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                <option value="normal">普通</option>
                <option value="high">高优先级</option>
                <option value="low">低优先级</option>
              </select>
            </div>
            <button className="primaryButton" type="submit">提交反馈</button>
          </form>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h2>我的反馈</h2>
          </div>
          <div className="tableList">
            {tickets.map((ticket) => (
              <div className="tableRow" key={ticket.id}>
                <div>
                  <strong>{ticket.title}</strong>
                  <span>{ticket.category} · {ticket.priority} · {ticket.status} · {formatDate(ticket.updated_at)}</span>
                  {ticket.admin_reply ? <span>回复：{ticket.admin_reply}</span> : null}
                </div>
                <div className="rowActions">
                  <span className={`statusPill ${ticket.status}`}>{ticket.status}</span>
                </div>
              </div>
            ))}
            {tickets.length === 0 ? <div className="emptyState">暂无反馈记录。</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
