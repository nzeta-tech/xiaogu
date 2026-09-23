"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminField } from "./AdminPrimitives";
import { apiPath } from "@/lib/client/url";
import type { ExclusiveAccessMode, ExclusiveAccessSource } from "@/lib/billing/exclusive-access-rules";
import type { ExclusiveAccessOverride } from "@/lib/billing/exclusive-access-store";

const modeLabels = { auto: "自动判断", granted: "人工开通", blocked: "禁止使用" };
const sourceLabels = { payment: "真实充值解锁", manual: "人工授权解锁", blocked: "已禁止使用", none: "尚未解锁" };
type Data = {
  override: ExclusiveAccessOverride;
  effective: { eligible: boolean; source: ExclusiveAccessSource; expired: boolean };
  paid: boolean;
  history: Array<{ id: string; createdAt: string; operator: string | null; detail: { before: ExclusiveAccessOverride; after: ExclusiveAccessOverride; reason: string } }>;
};
function displayDate(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "永久"; }
function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

async function readPermission(userId: string, signal?: AbortSignal): Promise<Data> {
  const response = await fetch(apiPath(`/api/admin/users/exclusive-access?userId=${encodeURIComponent(userId)}`), { cache: "no-store", signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "权限信息加载失败");
  return payload as Data;
}

export function UserExclusiveAccessPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<ExclusiveAccessMode>("auto");
  const [duration, setDuration] = useState("7");
  const [customExpiry, setCustomExpiry] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const acceptData = useCallback((next: Data) => {
    setData(next); setMode(next.override.mode);
    setDuration(next.override.mode === "granted" ? next.override.expiresAt ? "custom" : "permanent" : "7");
    setCustomExpiry(next.override.expiresAt ? localDate(next.override.expiresAt) : "");
    setReason(""); setError(""); setReady(true);
  }, []);
  const load = useCallback(async () => {
    try { acceptData(await readPermission(userId)); }
    catch (cause) { setReady(false); setError(cause instanceof Error ? cause.message : "权限信息加载失败"); }
  }, [userId, acceptData]);
  useEffect(() => {
    const controller = new AbortController();
    void readPermission(userId, controller.signal).then(next => {
      if (!controller.signal.aborted) acceptData(next);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "权限信息加载失败");
    });
    return () => controller.abort();
  }, [userId, acceptData]);

  async function save() {
    if (!ready || !data || busy) return;
    setError(""); setNotice("");
    if (!reason.trim()) { setError("请填写本次操作原因。"); return; }
    let expiresAt: string | null = null;
    if (mode === "granted" && duration !== "permanent") {
      const date = duration === "custom" ? new Date(customExpiry) : new Date(Date.now() + Number(duration) * 86400000);
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) { setError("请选择晚于当前时间的到期时间。"); return; }
      expiresAt = date.toISOString();
    }
    setBusy(true);
    try {
      const response = await fetch(apiPath("/api/admin/users/exclusive-access"), {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, mode, expiresAt, reason: reason.trim(), expectedRevision: data.override.revision }),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 409) setReady(false);
        setError(payload.error || "保存失败，请刷新后重试。");
        return;
      }
      setNotice("专享应用权限已保存，生成仍需正常扣积分。");
      setReady(false);
      await load();
    } catch { setReady(false); setError("未收到保存结果，请刷新核对当前权限后再操作。"); }
    finally { setBusy(false); }
  }

  return <section className="pageStack" aria-label="专享应用权限">
    <div><h3>专享应用权限</h3><p>适用于全部充值专享应用。人工授权不计入真实充值，不赠送积分，也不产生邀请返利。</p></div>
    {data ? <div role="status"><strong>当前生效：{sourceLabels[data.effective.source]}</strong>{data.effective.expired ? <p>人工授权已到期，当前按真实充值记录自动判断。</p> : null}{data.override.mode === "granted" ? <p>授权期限：{displayDate(data.override.expiresAt)}</p> : null}</div> : null}
    <AdminField label="权限设置"><select aria-label="专享应用权限设置" value={mode} disabled={!ready || busy} onChange={event => setMode(event.target.value as ExclusiveAccessMode)}>
      <option value="auto">自动判断：根据真实充值记录</option>
      <option value="granted">人工开通：允许使用专享应用</option>
      <option value="blocked">禁止使用：充值后也不能使用专享应用</option>
    </select></AdminField>
    {mode === "granted" ? <>
      <AdminField label="有效期"><select aria-label="专享权限有效期" value={duration} disabled={!ready || busy} onChange={event => setDuration(event.target.value)}><option value="7">7 天</option><option value="30">30 天</option><option value="permanent">永久</option><option value="custom">自定义日期</option></select></AdminField>
      {duration === "custom" ? <AdminField label="到期时间（当前设备时区）"><input aria-label="专享权限到期时间" type="datetime-local" value={customExpiry} disabled={!ready || busy} onChange={event => setCustomExpiry(event.target.value)} /></AdminField> : null}
    </> : null}
    {mode === "blocked" ? <p>禁止仅作用于专享应用；普通应用和已有作品查看不受影响。</p> : null}
    <AdminField label="操作原因（必填）"><textarea aria-label="专享权限操作原因" value={reason} maxLength={500} disabled={!ready || busy} placeholder="例如：合作客户体验、内部测试" onChange={event => setReason(event.target.value)} /></AdminField>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <div className="rowActions"><button className="primaryButton" type="button" disabled={!ready || busy} onClick={() => void save()}>{busy ? "保存中…" : "保存专享权限"}</button><button className="secondaryButton" type="button" disabled={busy} onClick={() => { setReady(false); void load(); }}>刷新权限</button></div>
    <details><summary>最近权限变更（{data?.history.length ?? 0}）</summary>
      {data?.history.length ? data.history.map(item => <div key={item.id} className="tableRow"><div><strong>{modeLabels[item.detail.before.mode]} → {modeLabels[item.detail.after.mode]}</strong><p>{item.detail.reason}</p><small>{item.operator || "管理员账号已删除"} · {displayDate(item.createdAt)}{item.detail.after.mode === "granted" ? ` · 到期：${displayDate(item.detail.after.expiresAt)}` : ""}</small></div></div>) : <p>暂无权限变更记录。</p>}
    </details>
  </section>;
}
