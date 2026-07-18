"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiPath } from "@/lib/client/url";
import { usePageMeta } from "@/lib/client/page-meta";

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
  usePageMeta({ title: "反馈支持 · 问题与建议", description: "用户中心 / 反馈处理进展" });
  const [tickets, setTickets] = useState<FeedbackTicket[]>([]);
  const [form, setForm] = useState({ title: "", content: "", category: "general", priority: "normal" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadTickets() {
    try {
      const response = await fetch(apiPath("/api/feedback"));
      const payload = (await response.json()) as { tickets?: FeedbackTicket[]; error?: string };
      if (!response.ok) {
        setError(payload.error ?? "反馈记录加载失败");
        return;
      }
      setTickets(payload.tickets ?? []);
    } catch {
      setError("反馈记录加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
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
    } catch {
      setError("反馈提交失败，请检查网络后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTickets();
  }, []);

  return (
    <div className="pageStack feedbackPage">
      <section className="feedbackHero">
        <div>
          <span className="feedbackEyebrow">反馈支持</span>
          <h1>反馈与支持</h1>
          <p>提交使用问题、内容建议或账单疑问，处理进展会在这里更新。</p>
        </div>
        <div className="feedbackHeroStatus">
          <strong>{loading ? "-" : tickets.length}</strong>
          <span>历史反馈</span>
        </div>
      </section>

      <div aria-live="polite">
        {error ? <div className="alertPanel">{error}</div> : null}
        {notice ? <div className="successPanel">{notice}</div> : null}
      </div>

      <div className="feedbackLayout">
        <section className="feedbackFormPanel">
          <div className="feedbackSectionHeader">
            <div>
              <span>新反馈</span>
              <h2>告诉我们遇到的问题</h2>
            </div>
          </div>
          <form className="feedbackForm" onSubmit={submitFeedback}>
            <label>
              <span>反馈主题</span>
              <input
                maxLength={80}
                required
                value={form.title}
                placeholder="简要概括问题或建议"
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label>
              <span>详细描述</span>
              <textarea
                maxLength={2000}
                minLength={10}
                required
                value={form.content}
                placeholder="请说明发生了什么、你期望的结果，以及可以帮助定位问题的信息"
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              />
              <small>{form.content.length} / 2000</small>
            </label>
            <div className="feedbackFormOptions">
              <label>
                <span>问题类型</span>
                <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                  <option value="general">一般问题</option>
                  <option value="bug">功能异常</option>
                  <option value="billing">账单积分</option>
                  <option value="content">内容效果</option>
                  <option value="account">账号问题</option>
                </select>
              </label>
              <label>
                <span>优先级</span>
                <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}>
                  <option value="normal">普通</option>
                  <option value="high">高优先级</option>
                  <option value="low">低优先级</option>
                </select>
              </label>
            </div>
            <button className="primaryButton feedbackSubmitButton" disabled={submitting} type="submit">
              {submitting ? "提交中..." : "提交反馈"}
            </button>
          </form>
        </section>

        <section className="feedbackHistory">
          <div className="feedbackSectionHeader">
            <div>
              <span>处理进度</span>
              <h2>我的反馈</h2>
            </div>
            {!loading && tickets.length > 0 ? <strong>{tickets.length} 条</strong> : null}
          </div>
          <div className="feedbackTicketList">
            {loading ? <div className="feedbackEmptyState">正在同步反馈记录...</div> : null}
            {tickets.map((ticket) => (
              <article className="feedbackTicket" key={ticket.id}>
                <div className="feedbackTicketHeader">
                  <div>
                    <span>{categoryLabel(ticket.category)}</span>
                    <em>{priorityLabel(ticket.priority)}</em>
                  </div>
                  <span className={`feedbackStatus ${ticket.status}`}>{statusLabel(ticket.status)}</span>
                </div>
                <div className="feedbackTicketBody">
                  <strong>{ticket.title}</strong>
                  <p>{ticket.content}</p>
                  <time dateTime={ticket.updated_at}>更新于 {formatDate(ticket.updated_at)}</time>
                </div>
                {ticket.admin_reply ? <div className="feedbackReply"><span>小谷回复</span><p>{ticket.admin_reply}</p></div> : null}
              </article>
            ))}
            {!loading && tickets.length === 0 ? (
              <div className="feedbackEmptyState">
                <span aria-hidden="true">✓</span>
                <strong>暂无反馈记录</strong>
                <p>提交后的反馈和处理进度会显示在这里。</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function categoryLabel(value: string) {
  return ({ general: "一般问题", bug: "功能异常", billing: "账单积分", content: "内容效果", account: "账号问题" } as Record<string, string>)[value] ?? value;
}

function priorityLabel(value: string) {
  return ({ high: "高优先级", normal: "普通", low: "低优先级" } as Record<string, string>)[value] ?? value;
}

function statusLabel(value: string) {
  return ({ open: "待处理", in_progress: "处理中", resolved: "已解决", closed: "已关闭" } as Record<string, string>)[value] ?? value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
