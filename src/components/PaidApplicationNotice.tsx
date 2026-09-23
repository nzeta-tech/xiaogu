"use client";

import { useEffect, useState } from "react";
import styles from "./paid-application-notice.module.css";
import { apiPath, appPath } from "@/lib/client/url";
import { EXCLUSIVE_ACCESS_BLOCKED_MESSAGE } from "@/lib/billing/exclusive-access-rules";
import { PAID_CUSTOMER_MESSAGE } from "@/lib/billing/paid-access-rules";

type Access = { eligible: boolean; blocked: boolean; policy: "credits" | "paid_customer" };

/** Billing opens in another tab so even file inputs and unsaved drafts survive. */
export function PaidApplicationNotice({ appSlug }: { appSlug: string }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(apiPath(`/api/billing/access-status?app=${encodeURIComponent(appSlug)}`), { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("access unavailable");
        const value = await response.json() as Access;
        if (!controller.signal.aborted) { setAccess(value); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [appSlug]);
  if (error) return <div role="status" className="emptyState">暂时无法核验应用使用资格，提交时将重新检查。</div>;
  if (access?.policy !== "paid_customer") return null;
  return <aside className={styles.notice} aria-label="充值用户专享">
    <div>
    <strong>充值用户专享{access.eligible ? " · 已解锁" : access.blocked ? " · 已暂停" : ""}</strong>
    <p>{access.eligible ? "已解锁专享应用，生成仍需消耗积分，可使用全部可用积分。" : access.blocked ? EXCLUSIVE_ACCESS_BLOCKED_MESSAGE : PAID_CUSTOMER_MESSAGE}</p>
    </div>
    {!access.eligible && !access.blocked ? <a className="primaryButton" href={appPath("/billing")} target="_blank" rel="noopener noreferrer">去充值解锁 ↗</a> : null}
  </aside>;
}
