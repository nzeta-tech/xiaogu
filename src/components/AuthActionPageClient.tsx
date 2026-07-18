"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiPath, appPath } from "@/lib/client/url";
import { safeAuthRedirect } from "@/lib/auth/redirect";

export function ForgotPasswordPageClient() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const response = await fetch(apiPath("/api/auth/password-reset/request"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const payload = await response.json() as { message?: string; error?: string };
    setMessage(payload.message ?? payload.error ?? "请求失败"); setBusy(false);
  }
  return <AuthActionShell title="找回密码" description="输入注册邮箱，我们会发送一次性重置链接。"><form className="form" onSubmit={submit}><label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><button className="primaryButton" disabled={busy}>{busy ? "发送中" : "发送重置邮件"}</button>{message ? <div className="subtleText">{message}</div> : null}</form></AuthActionShell>;
}

export function ResetPasswordPageClient({ token }: { token: string }) {
  const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); const response = await fetch(apiPath("/api/auth/password-reset/confirm"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, newPassword: password }) }); const payload = await response.json() as { error?: string }; setMessage(response.ok ? "密码已更新，请重新登录。" : payload.error ?? "重置失败"); setBusy(false); }
  return <AuthActionShell title="设置新密码" description="重置成功后，所有旧登录会话都会失效。"><form className="form" onSubmit={submit}><label>新密码<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primaryButton" disabled={busy || token.length < 20}>{busy ? "更新中" : "更新密码"}</button>{message ? <div className="subtleText">{message}</div> : null}</form></AuthActionShell>;
}

export function VerifyEmailPageClient({ token }: { token: string }) {
  const [message, setMessage] = useState("正在验证邮箱...");
  useEffect(() => { void fetch(apiPath("/api/auth/verify-email"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).then(async (response) => { const payload = await response.json() as { error?: string }; setMessage(response.ok ? "邮箱验证成功，现在可以登录。" : payload.error ?? "验证失败"); }).catch(() => setMessage("验证服务暂不可用")); }, [token]);
  return <AuthActionShell title="邮箱验证" description={message}><a className="primaryButton" href={appPath("/login")}>返回登录</a></AuthActionShell>;
}

export function AcceptTermsPageClient({ nextPath = "" }: { nextPath?: string }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function accept() { setBusy(true); const response = await fetch(apiPath("/api/legal/accept"), { method: "POST" }); if (response.ok) location.href = appPath(safeAuthRedirect(nextPath)); else { const payload = await response.json() as { error?: string }; setError(payload.error ?? "确认失败"); setBusy(false); } }
  return <AuthActionShell title="协议已更新" description="继续使用前，请阅读并确认最新用户协议与隐私政策。"><p><a href={appPath("/terms")} target="_blank">用户协议</a> · <a href={appPath("/privacy")} target="_blank">隐私政策</a></p><button className="primaryButton" disabled={busy} onClick={() => void accept()}>{busy ? "确认中" : "同意并继续"}</button>{error ? <div className="alertPanel">{error}</div> : null}</AuthActionShell>;
}

function AuthActionShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="authActionPage"><section className="panel authCard"><span className="authEyebrow">账号安全</span><h1>{title}</h1><p className="authLead">{description}</p>{children}<p><a href={appPath("/login")}>返回登录</a></p></section></main>;
}
