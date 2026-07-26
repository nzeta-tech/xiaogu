"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";
import { usePageMeta } from "@/lib/client/page-meta";

type Plan = {
  code: string;
  name: string;
  quotaAmount: number;
  amountCents: number;
  currency: string;
  description: string;
  recommended?: boolean;
};

type Order = {
  id: string;
  provider: string;
  status: string;
  amount_cents: number;
  currency: string;
  quota_amount: number;
  checkout_url?: string | null;
  created_at: string;
};

type Usage = {
  id: string;
  action_type: string;
  quota_cost: number;
  display_name: string;
  work_id?: string | null;
  work_title?: string | null;
  created_at: string;
};

type Balance = {
  balance?: number;
  mode?: string;
};

type Gift = {
  id: string;
  source_type: string;
  source_label: string;
  quota_amount: number;
  status: string;
  created_at: string;
};

type BillingAnnouncement = { id: string; title: string; content: string; link_url?: string | null };

export function BillingPageClient() {
  usePageMeta({ title: "充值中心", description: "选择套餐、完成支付、查看订单" });
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [announcements, setAnnouncements] = useState<BillingAnnouncement[]>([]);
  const [balance, setBalance] = useState<Balance>({});
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState("");
  const [promoError, setPromoError] = useState(false);
  const [promoBusy, setPromoBusy] = useState(false);
  const [showAllUsage, setShowAllUsage] = useState(false);
  const [error, setError] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const [paymentProvider, setPaymentProvider] = useState<"stripe" | "alipay" | "wechat" | "manual">("stripe");
  const [commerceConfig, setCommerceConfig] = useState({
    enableStripe: true,
    enableAlipay: false,
    enableWechat: false,
    enableManualTransfer: false,
    displayCreditPackages: true,
    purchaseNotice: "充值成功后积分会自动到账，可在本页查看订单和用量明细。",
    feeRatePercent: 0,
    productName: "小谷创作积分",
    helpImageUrl: "",
  });

  const paidOrders = orders.filter((order) => order.status === "paid");
  const totalPurchased = paidOrders.reduce((sum, order) => sum + order.quota_amount, 0);
  const totalUsed = usage.reduce((sum, item) => sum + item.quota_cost, 0);
  const totalGifted = gifts.reduce((sum, item) => sum + item.quota_amount, 0);
  const visibleUsage = showAllUsage ? usage : usage.slice(0, 5);
  const balanceLabel = balance.balance && balance.balance >= Number.MAX_SAFE_INTEGER ? "已开通" : `${balance.balance ?? 0} 点`;
  const paymentMethods = [
    commerceConfig.enableAlipay ? { provider: "alipay" as const, label: "支付宝" } : null,
    commerceConfig.enableWechat ? { provider: "wechat" as const, label: "微信支付" } : null,
    commerceConfig.enableStripe ? { provider: "stripe" as const, label: "在线支付" } : null,
    commerceConfig.enableManualTransfer ? { provider: "manual" as const, label: "转账充值" } : null,
  ].filter((method): method is { provider: "stripe" | "alipay" | "wechat" | "manual"; label: string } => method !== null);
  const activePaymentProvider = paymentMethods.some((method) => method.provider === paymentProvider) ? paymentProvider : paymentMethods[0]?.provider;

  async function loadAll(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const [plansResponse, ordersResponse, usageResponse, balanceResponse, giftsResponse, configResponse, announcementsResponse] = await Promise.all([
        fetch(apiPath("/api/billing/plans"), { signal }),
        fetch(apiPath("/api/billing/orders"), { signal }),
        fetch(apiPath("/api/usage"), { signal }),
        fetch(apiPath("/api/billing/balance"), { signal }),
        fetch(apiPath("/api/gifts"), { signal }),
        fetch(apiPath("/api/system/public-config"), { signal }),
        fetch(apiPath("/api/announcements?placement=billing"), { signal }),
      ]);
      const plansPayload = (await plansResponse.json()) as { plans?: Plan[] };
      const ordersPayload = (await ordersResponse.json()) as { orders?: Order[] };
      const usagePayload = (await usageResponse.json()) as { usage?: Usage[] };
      const balancePayload = (await balanceResponse.json()) as Balance;
      const giftsPayload = (await giftsResponse.json()) as { gifts?: Gift[] };
      const configPayload = (await configResponse.json()) as { payment?: Partial<typeof commerceConfig> };
      const announcementsPayload = (await announcementsResponse.json()) as { announcements?: BillingAnnouncement[] };
      setPlans(plansPayload.plans ?? []);
      setOrders(ordersPayload.orders ?? []);
      setUsage(usagePayload.usage ?? []);
      setBalance(balancePayload);
      setGifts(giftsPayload.gifts ?? []);
      setCommerceConfig((current) => ({ ...current, ...configPayload.payment }));
      setAnnouncements(announcementsPayload.announcements ?? []);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") setError("账单数据暂时无法加载，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function buyPlan(plan: Plan) {
    if (!activePaymentProvider) {
      setError("当前暂未开放充值方式，请联系平台客服。");
      return;
    }
    setBusyPlan(plan.code);
    setError("");
    setCheckoutNotice("");
    try {
      const response = await fetch(apiPath("/api/billing/orders"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planCode: plan.code, provider: activePaymentProvider }),
      });
      const payload = (await response.json()) as { checkout?: { url?: string | null; instructions?: string }; error?: string };
      if (payload.checkout?.url) {
        window.location.assign(payload.checkout.url);
        return;
      }
      if (!response.ok) {
        setError(payload.error ?? "暂时无法创建支付订单。");
        return;
      }
      if (payload.checkout?.instructions) setCheckoutNotice(payload.checkout.instructions);
      await loadAll();
    } finally {
      setBusyPlan("");
    }
  }

  async function redeemPromoCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!promoCode.trim()) return;
    setPromoBusy(true);
    setPromoMessage("");
    setPromoError(false);
    try {
      const response = await fetch(apiPath("/api/promo/redeem"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: promoCode }),
      });
      const payload = (await response.json()) as { redemption?: { rewardType?: string; creditAmount?: number; discountPercent?: number; code?: string }; error?: string };
      if (!response.ok) {
        setPromoMessage(payload.error ?? "兑换失败，请检查优惠码后重试。");
        setPromoError(true);
        return;
      }
      const redemption = payload.redemption;
      setPromoMessage(redemption?.rewardType === "discount"
        ? `优惠码已生效：下一笔充值可抵扣 ${redemption.discountPercent ?? 0}%。`
        : `兑换成功：已到账 ${redemption?.creditAmount ?? 0} 点。`);
      setPromoCode("");
      await loadAll();
      window.dispatchEvent(new Event("ica:conversations-updated"));
    } finally {
      setPromoBusy(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll(controller.signal);
    return () => controller.abort();
    // loadAll is intentionally scoped to the initial page load and manual refresh actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="billingPage">
      <section className="billingHero">
        <div>
          <span className="eyebrow">充值中心</span>
          <h1>为创作补充额度</h1>
          <p>选择额度包与支付方式；支付完成后自动到账，订单、用量和赠送记录也会集中保留在这里。</p>
        </div>
        <button className="secondaryButton" onClick={() => void loadAll()} disabled={loading}>
          {loading ? "刷新中" : "刷新账单"}
        </button>
      </section>

      {error ? <div className="alertPanel">{error}</div> : null}
      {checkoutNotice ? <div className="successPanel">订单已创建：{checkoutNotice}</div> : null}
      {announcements.map((item) => <div className="panel" key={item.id}><strong>{item.title}</strong><p>{item.content}</p>{item.link_url ? <a href={item.link_url}>查看详情</a> : null}</div>)}
      {searchParams.get("checkout") === "success" ? <div className="successPanel">支付已完成，积分到账可能需要几秒，点击“刷新账单”即可更新。</div> : null}
      {searchParams.get("checkout") === "cancel" ? <div className="alertPanel">支付已取消，订单仍会保留，可从订单记录继续支付。</div> : null}

      <section className="billingMetrics">
        <Metric label="当前可用额度" value={balanceLabel} detail={balance.mode ?? "quota billing"} />
        <Metric label="累计购买额度" value={`${totalPurchased} 点`} detail={`${paidOrders.length} 笔已支付订单`} />
        <Metric label="累计消耗额度" value={`${totalUsed} 点`} detail={`${usage.length} 条用量流水`} />
        <Metric label="赠送到账额度" value={`${totalGifted} 点`} detail={`${gifts.length} 条权益记录`} />
      </section>

      {commerceConfig.displayCreditPackages ? <section className="billingPlans">
        <div className="billingSectionTitle">
          <div>
            <span className="eyebrow">套餐选择</span>
            <h2>选择适合当前运营强度的额度包</h2>
          </div>
          <p>{commerceConfig.purchaseNotice}</p>
        </div>

        <form className="billingPromoForm" onSubmit={redeemPromoCode}>
          <label htmlFor="billing-promo-code">优惠码</label>
          <input id="billing-promo-code" value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} placeholder="输入优惠码或活动码" />
          <button className="secondaryButton" disabled={promoBusy || !promoCode.trim()} type="submit">{promoBusy ? "兑换中" : "兑换"}</button>
          {promoMessage ? <span className={promoError ? "error" : "success"}>{promoMessage}</span> : null}
        </form>

        <div className="billingPaymentMethods" aria-label="支付方式">
          <span>支付方式</span>
          <div role="radiogroup" aria-label="选择支付方式">
            {paymentMethods.map((method) => <button aria-checked={activePaymentProvider === method.provider} className={activePaymentProvider === method.provider ? "active" : ""} key={method.provider} onClick={() => setPaymentProvider(method.provider)} role="radio" type="button">{method.label}</button>)}
            {paymentMethods.length === 0 ? <small>当前暂未开放在线充值，请联系平台客服。</small> : null}
          </div>
        </div>

        <div className="pricingGrid">
          {plans.map((plan) => (
            <article className={`pricingCard ${plan.recommended ? "featured" : ""}`} key={plan.code}>
              <div className="planTopline">
                <span>{plan.name}</span>
                {plan.recommended ? <em>推荐</em> : null}
              </div>
              <div className="planPrice">
                ¥{((plan.amountCents + Math.ceil(plan.amountCents * commerceConfig.feeRatePercent / 100)) / 100).toFixed(2)}
                <small>{plan.currency}</small>
              </div>
              <strong>{plan.quotaAmount.toLocaleString("zh-CN")} 点额度</strong>
              <p>{plan.description}</p>
              {commerceConfig.feeRatePercent > 0 ? <small>含 {commerceConfig.feeRatePercent}% 支付服务费</small> : null}
              <ul>
                <li>热点发现与话题拆解</li>
                <li>短视频口播稿生成</li>
                <li>文案改写与合规提示</li>
              </ul>
              <button className={plan.recommended ? "primaryButton" : "secondaryButton"} onClick={() => void buyPlan(plan)} disabled={Boolean(busyPlan) || !activePaymentProvider}>
                {busyPlan === plan.code ? "创建订单中" : "立即充值"}
              </button>
            </article>
          ))}
        </div>
        {commerceConfig.helpImageUrl ? (
          <div className="billingHelpMedia">
            {/* CMS-configured external image; keep native img for flexible runtime URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={commerceConfig.helpImageUrl} alt="支付帮助" />
            <p>{commerceConfig.purchaseNotice}</p>
          </div>
        ) : null}
      </section> : null}

      <div className="billingTwoColumn">
        <section className="panel">
          <div className="panelHeader">
            <h2>订单记录</h2>
            <p>展示当前账号的充值订单和支付状态。</p>
          </div>
          <div className="billingList">
            {orders.length === 0 ? <div className="emptyState">暂无订单记录。</div> : null}
            {orders.map((order) => (
              <div className="billingRow" key={order.id}>
                <div>
                  <strong>{formatMoney(order.amount_cents, order.currency)}</strong>
                  <span>{order.quota_amount.toLocaleString("zh-CN")} 点 · {formatDate(order.created_at)}</span>
                </div>
                <StatusPill status={order.status} />
                {order.status === "pending" && order.checkout_url ? <a className="secondaryButton linkButton" href={order.checkout_url}>继续支付</a> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelHeader billingUsageHeader">
            <div>
              <h2>账单明细</h2>
              <p>记录每次创作与内容服务的额度消耗。</p>
            </div>
            {usage.length > 5 ? <button className="billingUsageToggle" onClick={() => setShowAllUsage((current) => !current)} type="button">{showAllUsage ? "收起" : `查看全部 (${usage.length})`}</button> : null}
          </div>
          <div className={`billingList billingUsageList ${showAllUsage ? "expanded" : ""}`}>
            {usage.length === 0 ? <div className="emptyState">暂无用量流水。</div> : null}
            {visibleUsage.map((item) => (
              <div className="billingRow" key={item.id}>
                <div>
                  <strong>{item.display_name}</strong>
                  <span>{item.work_title ? `${item.work_title} · ` : ""}{formatDate(item.created_at)}</span>
                </div>
                <div className="billingUsageAmount"><b>-{item.quota_cost} 点</b>{item.work_id ? <a href={appPath(`/works/${item.work_id}?from=billing&entry=billing`)}>查看作品</a> : null}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panelHeader">
          <h2>赠送与活动到账</h2>
          <p>展示优惠码兑换、管理员赠送和活动发放的点数。</p>
        </div>
        <div className="billingList">
          {gifts.length === 0 ? <div className="emptyState">暂无赠送到账记录。</div> : null}
          {gifts.slice(0, 8).map((gift) => (
            <div className="billingRow" key={gift.id}>
              <div>
                <strong>{gift.source_label}</strong>
                <span>{gift.source_type} · {formatDate(gift.created_at)}</span>
              </div>
              <b>+{gift.quota_amount} 点</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="billingMetric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const labelMap: Record<string, string> = {
    paid: "已支付",
    pending: "待支付",
    failed: "失败",
    canceled: "已取消",
    cancelled: "已取消",
    refunded: "已退款",
  };
  return <span className={`statusPill ${status}`}>{labelMap[status] ?? status}</span>;
}

function formatMoney(amountCents: number, currency: string) {
  const symbol = currency === "CNY" ? "¥" : "$";
  return `${symbol}${(amountCents / 100).toFixed(0)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
