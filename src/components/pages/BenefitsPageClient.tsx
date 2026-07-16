"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiPath } from "@/lib/client/url";

type Announcement = {
  id: string;
  title: string;
  content: string;
  kind: string;
};

type Gift = {
  id: string;
  source_type: string;
  source_label: string;
  quota_amount: number;
  status: string;
  created_at: string;
};

export function BenefitsPageClient() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAll(signal?: AbortSignal) {
    try {
      const [announcementsResponse, giftsResponse] = await Promise.all([
        fetch(apiPath("/api/announcements?placement=benefits"), { signal }),
        fetch(apiPath("/api/gifts"), { signal }),
      ]);
      const announcementsPayload = (await announcementsResponse.json()) as { announcements?: Announcement[] };
      const giftsPayload = (await giftsResponse.json()) as { gifts?: Gift[] };
      setAnnouncements(announcementsPayload.announcements ?? []);
      setGifts(giftsPayload.gifts ?? []);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll(controller.signal);
    return () => controller.abort();
  }, []);

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(apiPath("/api/promo/redeem"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const payload = (await response.json()) as { redemption?: { rewardType?: string; creditAmount?: number; discountPercent?: number; code?: string }; error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "兑换失败");
      setBusy(false);
      return;
    }
    const redemption = payload.redemption;
    setMessage(
      redemption?.rewardType === "discount"
        ? `兑换成功：${redemption.code ?? code} 可在下一笔充值中抵扣 ${redemption.discountPercent ?? 0}%。`
        : `兑换成功：${redemption?.code ?? code} 已到账 ${redemption?.creditAmount ?? 0} 点。`,
    );
    setCode("");
    await loadAll();
    setBusy(false);
  }

  return (
    <div className="pageStack">
      <div className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>活动权益</h1>
          <div className="subtleText">兑换优惠码、查看赠送记录和最近活动公告。</div>
        </div>
      </div>

      <div className="adminGrid">
        <section className="panel">
          <div className="panelHeader">
            <h2>优惠码兑换</h2>
          </div>
          <form className="stackForm" onSubmit={redeem}>
            <input
              value={code}
              placeholder="输入优惠码或活动码"
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
            <button className="primaryButton" type="submit" disabled={busy || !code.trim()}>
              {busy ? "兑换中" : "立即兑换"}
            </button>
            {message ? <div className="subtleText">{message}</div> : null}
          </form>
        </section>

        <section className="panel">
          <div className="panelHeader">
            <h2>最新公告</h2>
          </div>
          <div className="sideBody">
            {announcements.map((item) => (
              <div className="topic" key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.content}</p>
              </div>
            ))}
            {announcements.length === 0 ? <div className="emptyState">暂无活动公告。</div> : null}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panelHeader">
          <h2>赠送记录</h2>
        </div>
        <div className="tableList">
          {gifts.map((gift) => (
            <div className="tableRow" key={gift.id}>
              <div>
                <strong>{gift.source_label}</strong>
                <span>{gift.source_type} · {formatDate(gift.created_at)}</span>
              </div>
              <b>+{gift.quota_amount} 点</b>
            </div>
          ))}
          {gifts.length === 0 ? <div className="emptyState">暂无赠送记录。</div> : null}
        </div>
      </section>
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
