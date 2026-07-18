"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiPath, appPath } from "@/lib/client/url";
import { usePageMeta } from "@/lib/client/page-meta";

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

type AffiliateDetail = {
  enabled: boolean;
  settings: { rebateRatePercent: number; freezeHours: number; durationDays: number; perInviteeCap: number };
  account: { referral_code: string; available_credits: number; frozen_credits: number; lifetime_credits: number };
  inviter: { name: string; email: string } | null;
  inviteeCount: number;
  invitees: Array<{ id: string; name: string; email: string; created_at: string; rebate_credits: number }>;
  ledger: Array<{ id: string; action: string; credits: number; frozen_until: string | null; created_at: string; source_email: string | null }>;
};

export function BenefitsPageClient() {
  usePageMeta({ title: "邀请有礼 · 邀请与奖励", description: "邀请好友 / 返利与活动奖励" });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [affiliate, setAffiliate] = useState<AffiliateDetail | null>(null);
  const [affiliateBusy, setAffiliateBusy] = useState(false);
  const [affiliateNotice, setAffiliateNotice] = useState("");

  async function loadAll(signal?: AbortSignal) {
    try {
      const [announcementsResponse, giftsResponse, affiliateResponse] = await Promise.all([
        fetch(apiPath("/api/announcements?placement=benefits"), { signal }),
        fetch(apiPath("/api/gifts"), { signal }),
        fetch(apiPath("/api/affiliate"), { signal }),
      ]);
      const announcementsPayload = (await announcementsResponse.json()) as { announcements?: Announcement[] };
      const giftsPayload = (await giftsResponse.json()) as { gifts?: Gift[] };
      const affiliatePayload = (await affiliateResponse.json()) as { affiliate?: AffiliateDetail };
      setAnnouncements(announcementsPayload.announcements ?? []);
      setGifts(giftsPayload.gifts ?? []);
      setAffiliate(affiliatePayload.affiliate ?? null);
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

  useEffect(() => {
    if (!affiliate || window.location.hash !== "#invite") return;
    window.requestAnimationFrame(() => document.getElementById("invite")?.scrollIntoView({ block: "start" }));
  }, [affiliate]);

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

  async function copyInviteLink() {
    if (!affiliate) return;
    const link = `${window.location.origin}${appPath("/register")}?ref=${encodeURIComponent(affiliate.account.referral_code)}`;
    await navigator.clipboard.writeText(link);
    setAffiliateNotice("邀请链接已复制");
  }

  async function transferAffiliate() {
    setAffiliateBusy(true);
    setAffiliateNotice("");
    const response = await fetch(apiPath("/api/affiliate"), { method: "POST" });
    const payload = (await response.json()) as { transfer?: { credits: number }; error?: string };
    if (!response.ok) {
      setAffiliateNotice(payload.error ?? "返利积分转入失败");
    } else {
      setAffiliateNotice(`已将 ${payload.transfer?.credits ?? 0} 点返利转入可用积分`);
      await loadAll();
      window.dispatchEvent(new Event("ica:conversations-updated"));
    }
    setAffiliateBusy(false);
  }

  return (
    <div className="pageStack">
      <div className="topbar">
        <div>
          <h1 style={{ margin: 0 }}>邀请有礼</h1>
          <div className="subtleText">邀请好友加入小谷，查看返利、赠送记录和活动奖励。</div>
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

      {affiliate ? (
        <section className="panel affiliatePanel" id="invite">
          <div className="panelHeader">
            <div>
              <h2>邀请有礼</h2>
              <p>{affiliate.enabled ? `邀请新用户注册；对方充值后，你按 ${affiliate.settings.rebateRatePercent}% 获得积分返利。` : "邀请活动暂未开放，开放后即可使用你的专属邀请码和邀请链接。"}</p>
            </div>
            <button className="secondaryButton" disabled={!affiliate.enabled} type="button" onClick={() => void copyInviteLink()}>复制邀请链接</button>
          </div>
          <div className="affiliateMetrics">
            <div><span>已邀请</span><strong>{affiliate.inviteeCount} 人</strong></div>
            <div><span>可转入</span><strong>{affiliate.account.available_credits} 点</strong></div>
            <div><span>冻结中</span><strong>{affiliate.account.frozen_credits} 点</strong></div>
            <div><span>累计返利</span><strong>{affiliate.account.lifetime_credits} 点</strong></div>
          </div>
          <div className="affiliateInviteBox">
            <div><span>你的返利邀请码</span><code>{affiliate.account.referral_code}</code></div>
            <button className="primaryButton" disabled={!affiliate.enabled || affiliateBusy || affiliate.account.available_credits <= 0} type="button" onClick={() => void transferAffiliate()}>
              {affiliateBusy ? "转入中" : "转入可用积分"}
            </button>
          </div>
          {affiliate.inviter ? <p className="subtleText">邀请人：{affiliate.inviter.name}（{affiliate.inviter.email}）</p> : null}
          {affiliate.settings.freezeHours > 0 ? <p className="subtleText">新返利冻结 {affiliate.settings.freezeHours} 小时后可转入。</p> : null}
          {affiliateNotice ? <div className="successPanel">{affiliateNotice}</div> : null}
          <div className="tableList affiliateInvitees">
            {affiliate.invitees.map((invitee) => (
              <div className="tableRow" key={invitee.id}>
                <div><strong>{invitee.name}</strong><span>{invitee.email} · {formatDate(invitee.created_at)}</span></div>
                <b>返利 {invitee.rebate_credits} 点</b>
              </div>
            ))}
            {affiliate.invitees.length === 0 ? <div className="emptyState">还没有通过你的链接注册的用户。</div> : null}
          </div>
          {affiliate.ledger.length > 0 ? <div className="tableList affiliateLedgerList">
            {affiliate.ledger.slice(0, 20).map((entry) => (
              <div className="tableRow" key={entry.id}>
                <div><strong>{affiliateActionLabel(entry.action)}</strong><span>{entry.source_email ?? "系统"} · {formatDate(entry.created_at)}</span></div>
                <b>{entry.action === "reverse" ? "-" : "+"}{entry.credits} 点</b>
              </div>
            ))}
          </div> : null}
        </section>
      ) : null}

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

function affiliateActionLabel(action: string) {
  return ({ accrue: "充值返利计提", transfer: "返利转入余额", reverse: "退款返利冲回" } as Record<string, string>)[action] ?? action;
}
