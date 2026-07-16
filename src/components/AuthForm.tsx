"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [config, setConfig] = useState<{
    site?: { siteName?: string; siteSubtitle?: string };
    auth?: { allowRegistration?: boolean; requireInviteCode?: boolean; passwordHint?: string };
  } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch(apiPath("/api/system/public-config"))
      .then((response) => response.json())
      .then((payload) => setConfig(payload))
      .catch(() => setConfig(null));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payloadBody = {
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      inviteCode: String(formData.get("inviteCode") ?? "").trim(),
      acceptedTerms: formData.get("acceptedTerms") === "on",
    };

    const endpoint = mode === "login" ? apiPath("/api/auth/login") : apiPath("/api/auth/register");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payloadBody),
      });

      if (response.ok) {
        await response.json();
        router.push("/dashboard");
        return;
      }

      const payload = (await response.json()) as { error?: string };
      setError(payload.error ?? (mode === "login" ? "登录失败" : "注册失败"));
    } catch {
      setError("服务暂不可用，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authPage">
      <section className="panel authCard">
        <div className="brand" style={{ color: "var(--text)", marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brandMark" src={appPath("/brand/xiaogu-icon.png")} alt="小谷" />
          <span>{config?.site?.siteName ?? "小谷"}</span>
        </div>
        <h1 style={{ margin: "0 0 8px" }}>{mode === "login" ? "经纪人登录" : "创建经纪人账号"}</h1>
        <p style={{ margin: "0 0 18px", color: "var(--muted)" }}>
          {mode === "login"
            ? "登录后进入你的真实数据库工作台。"
            : "注册后会创建经纪人账号、机构空间，后续通过思维设定生成个人画像。"}
        </p>
        <form className="form" onSubmit={submit}>
          {mode === "register" ? (
            <label>
              姓名
              <input name="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
          ) : null}
          {mode === "register" && config?.auth?.requireInviteCode ? (
            <label>
              邀请码
              <input name="inviteCode" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required />
            </label>
          ) : null}
          <label>
            邮箱
            <input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              value={password}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {mode === "register" ? <span className="formHint">{config?.auth?.passwordHint ?? "至少 8 位密码"}</span> : null}
          </label>
          {mode === "register" ? (
            <label className="checkboxRow authAgreementRow">
              <input name="acceptedTerms" type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required />
              <span>我已阅读并同意 <a href={appPath("/terms")} target="_blank">用户协议</a> 和 <a href={appPath("/privacy")} target="_blank">隐私政策</a></span>
            </label>
          ) : null}
          {mode === "register" && config?.auth?.allowRegistration === false ? <div className="alertPanel">当前暂未开放新用户注册。</div> : null}
          {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
          <button className="primaryButton" disabled={submitting || (mode === "register" && (config?.auth?.allowRegistration === false || !acceptedTerms))} type="submit">
            {submitting ? (mode === "login" ? "登录中..." : "注册中...") : mode === "login" ? "进入工作台" : "注册并进入"}
          </button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          {mode === "login" ? "还没有账号？" : "已经有账号？"}{" "}
          <a href={appPath(mode === "login" ? "/register" : "/login")}>{mode === "login" ? "立即注册" : "去登录"}</a>
        </p>
      </section>
    </div>
  );
}
