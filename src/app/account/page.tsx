"use client";

import { FormEvent, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { apiPath } from "@/lib/client/url";

export default function AccountPage() {
  return <AuthGuard><AppShell><AccountSettings /></AppShell></AuthGuard>;
}

function AccountSettings() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(apiPath("/api/account/password"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }),
    });
    const payload = await response.json() as { error?: string };
    setError(response.ok ? "" : payload.error ?? "密码修改失败");
    setMessage(response.ok ? "密码已更新。" : "");
    if (response.ok) event.currentTarget.reset();
  }

  async function closeAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(apiPath("/api/account/close"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: form.get("password"), confirmation: form.get("confirmation") }),
    });
    const payload = await response.json() as { error?: string };
    if (response.ok) location.href = "/login";
    else setError(payload.error ?? "账号注销失败");
  }

  return (
    <div className="pageStack accountSettingsPage">
      <div className="topbar"><div><h1>账号与安全</h1><div>修改登录密码或停用当前账号。</div></div></div>
      {error ? <div className="alertPanel">{error}</div> : null}
      {message ? <div className="successPanel">{message}</div> : null}
      <section className="panel"><div className="panelHeader"><h2>修改密码</h2></div><form className="stackForm" onSubmit={submitPassword}><input name="currentPassword" type="password" placeholder="当前密码" required /><input name="newPassword" type="password" minLength={8} placeholder="新密码，至少 8 位" required /><button className="primaryButton" type="submit">更新密码</button></form></section>
      <section className="panel dangerZone"><div className="panelHeader"><h2>注销账号</h2><p>注销后无法再次登录。订单和依法需要保留的财务记录仍会保存。</p></div><form className="stackForm" onSubmit={closeAccount}><input name="password" type="password" placeholder="当前密码" required /><input name="confirmation" placeholder="输入：注销账号" required /><button className="secondaryButton" type="submit">确认注销</button></form></section>
    </div>
  );
}
