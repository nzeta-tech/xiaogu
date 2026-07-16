"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPath } from "@/lib/client/url";

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
  model?: string | null;
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

export function BillingPageClient() {
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [balance, setBalance] = useState<Balance>({});
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState("");
  const [error, setError] = useState("");
  const [commerceConfig, setCommerceConfig] = useState({
    enableStripe: true,
    displayCreditPackages: true,
    purchaseNotice: "充值成功后积分会自动到账，可在本页查看订单和用量明细。",
  });

  const paidOrders = orders.filter((order) => order.status === "paid");
  const totalPurchased = paidOrders.reduce((sum, order) => sum + order.quota_amount, 0);
  const totalUsed = usage.reduce((sum, item) => sum + item.quota_cost, 0);
  const totalGifted = gifts.reduce((sum, item) => sum + item.quota_amount, 0);
  const balanceLabel = balance.balance && balance.balance >= Number.MAX_SAFE_INTEGER ? "已开通" : `${balance.balance ?? 0} 点`;

  async function loadAll(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const [plansResponse, ordersResponse, usageResponse, balanceResponse, giftsResponse, configResponse] = await Promise.all([
        fetch(apiPath("/api/billing/plans"), { signal }),
        fetch(apiPath("/api/billing/orders"), { signal }),
        fetch(apiPath("/api/usage"), { signal }),
        fetch(apiPath("/api/billing/balance"), { signal }),
        fetch(apiPath("/api/gifts"), { signal }),
        fetch(apiPath("/api/system/public-config"), { signal }),
      ]);
      const plansPayload = (await plansResponse.json()) as { plans?: Plan[] };
      const ordersPayload = (await ordersResponse.json()) as { orders?: Order[] };
      const usagePayload = (await usageResponse.json()) as { usage?: Usage[] };
      const balancePayload = (await balanceResponse.json()) as Balance;
      const giftsPayload = (await giftsResponse.json()) as { gifts?: Gift[] };
      const configPayload = (await configResponse.json()) as { payment?: Partial<typeof commerceConfig> };
      setPlans(plansPayload.plans ?? []);
      setOrders(ordersPayload.orders ?? []);
      setUsage(usagePayload.usage ?? []);
      setBalance(balancePayload);
      setGifts(giftsPayload.gifts ?? []);
      setCommerceConfig((current) => ({ ...current, ...configPayload.payment }));
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") setError("账单数据暂时无法加载，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function buyPlan(plan: Plan) {
    if (!commerceConfig.enableStripe) {
      setError("在线支付暂未开放，请联系平台客服。");
      return;
    }
    setBusyPlan(plan.code);
    setError("");
    try {
      const response = await fetch(apiPath("/api/billing/orders"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planCode: plan.code, provider: "stripe" }),
      });
      const payload = (await response.json()) as { checkout?: { url?: string | null }; error?: string };
      if (payload.checkout?.url) {
        window.location.assign(payload.checkout.url);
        return;
      }
      if (!response.ok) {
        setError(payload.error ?? "暂时无法创建支付订单。");
        return;
      }
      await loadAll();
    } finally {
      setBusyPlan("");
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll(controller.signal);
    return () => controller.abort();
  }, []);

  return (
    <div className="billingPage">
      <section className="billingHero">
        <div>
          <span className="eyebrow">充值中心</span>
          <h1>充值、订单和额度，都放在这里看</h1>
          <p>这个页面同时承担充值入口和经营账本的角色。支付成功后自动入账，也能直接查看订单、用量和赠送记录。</p>
        </div>
        <button className="secondaryButton" onClick={() => void loadAll()} disabled={loading}>
          {loading ? "刷新中" : "刷新账单"}
        </button>
      </section>

      {error ? <div className="alertPanel">{error}</div> : null}
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

        <div className="pricingGrid">
          {plans.map((plan) => (
            <article className={`pricingCard ${plan.recommended ? "featured" : ""}`} key={plan.code}>
              <div className="planTopline">
                <span>{plan.name}</span>
                {plan.recommended ? <em>推荐</em> : null}
              </div>
              <div className="planPrice">
                ¥{(plan.amountCents / 100).toFixed(0)}
                <small>{plan.currency}</small>
              </div>
              <strong>{plan.quotaAmount.toLocaleString("zh-CN")} 点额度</strong>
              <p>{plan.description}</p>
              <ul>
                <li>热点发现与话题拆解</li>
                <li>短视频口播稿生成</li>
                <li>文案改写与合规提示</li>
              </ul>
              <button className={plan.recommended ? "primaryButton" : "secondaryButton"} onClick={() => buyPlan(plan)} disabled={Boolean(busyPlan) || !commerceConfig.enableStripe}>
                {busyPlan === plan.code ? "创建订单中" : "立即充值"}
              </button>
            </article>
          ))}
        </div>
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
          <div className="panelHeader">
            <h2>最近用量</h2>
            <p>每次智能体调用都会记录 quota 成本。</p>
          </div>
          <div className="billingList">
            {usage.length === 0 ? <div className="emptyState">暂无用量流水。</div> : null}
            {usage.slice(0, 8).map((item) => (
              <div className="billingRow" key={item.id}>
                <div>
                  <strong>{formatAction(item.action_type)}</strong>
                  <span>{item.model ?? "未记录模型"} · {formatDate(item.created_at)}</span>
                </div>
                <b>-{item.quota_cost} 点</b>
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

function formatAction(action: string) {
  const labels: Record<string, string> = {
    discover_topics: "热点发现",
    write_script: "文案生成",
    rewrite_script: "文案改写",
    compliance_check: "合规检查",
  };
  return labels[action] ?? action;
}
