"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";
import { safeAuthRedirect } from "@/lib/auth/redirect";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import ReactMarkdown from "react-markdown";

export function AuthForm({
  mode,
  initialReferralCode = "",
  nextPath = "",
  initialEmail = "",
  initialError = "",
}: {
  mode: "login" | "register";
  initialReferralCode?: string;
  nextPath?: string;
  initialEmail?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [referralCode, setReferralCode] = useState(initialReferralCode.trim().toUpperCase());
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [config, setConfig] = useState<{
    site?: { siteName?: string; siteSubtitle?: string; logoUrl?: string };
    auth?: { allowRegistration?: boolean; requireInviteCode?: boolean; passwordHint?: string; passwordResetEnabled?: boolean; turnstileEnabled?: boolean; turnstileSiteKey?: string };
    affiliate?: { enabled?: boolean };
    legal?: { termsEnabled?: boolean; displayMode?: "checkbox" | "modal"; documents?: Array<{ slug: string; title: string; content: string }> };
  } | null>(null);
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreementSlug, setAgreementSlug] = useState("terms");
  const [totpCode, setTotpCode] = useState("");
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpChallenge, setTotpChallenge] = useState("");

  useEffect(() => {
    void fetch(apiPath("/api/system/public-config"))
      .then((response) => response.json())
      .then((payload) => setConfig(payload))
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    if (mode !== "register" || !initialReferralCode) return;
    const key = `affiliate-visit:${initialReferralCode.trim().toUpperCase()}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    void fetch(apiPath("/api/affiliate/visit"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ referralCode: initialReferralCode }) }).catch(() => undefined);
  }, [initialReferralCode, mode]);

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
      referralCode: String(formData.get("referralCode") ?? "").trim(),
      acceptedTerms: config?.legal?.termsEnabled === false || formData.get("acceptedTerms") === "on" || acceptedTerms,
      turnstileToken,
      totpCode: totpCode.trim() || undefined,
      totpChallenge: totpChallenge || undefined,
    };

    const endpoint = mode === "login" ? apiPath("/api/auth/login") : apiPath("/api/auth/register");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payloadBody),
      });

      const payload = (await response.json()) as { error?: string; code?: string; totpChallenge?: string; requiresEmailVerification?: boolean; emailSent?: boolean; requiresTermsAcceptance?: boolean };
      if (response.ok) {
        if (payload.requiresEmailVerification) {
          setError(payload.emailSent === false ? "账号已创建，但验证邮件发送失败，请联系管理员或稍后重发。" : "验证邮件已发送，请完成邮箱验证后登录。");
          return;
        }
        const destination = safeAuthRedirect(nextPath);
        router.push(payload.requiresTermsAcceptance ? `/accept-terms?next=${encodeURIComponent(destination)}` : destination);
        return;
      }

      if (payload.code === "TOTP_REQUIRED" || payload.code === "TOTP_INVALID") { setTotpRequired(true); if (payload.totpChallenge) setTotpChallenge(payload.totpChallenge); }
      setError(payload.error ?? (mode === "login" ? "登录失败" : "注册失败"));
    } catch {
      setError("服务暂不可用，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="authPage">
      <aside className="authBrandPanel">
        <div className="authBrandLockup">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brandMark" src={resolvePublicUrl(config?.site?.logoUrl || "/brand/xiaogu-icon.png")} alt="小谷" />
          <div>
            <strong>{config?.site?.siteName ?? "小谷"}AI</strong>
            <span>保险人的智能工作伙伴</span>
          </div>
        </div>
        <div className="authBrandCopy">
          <span>内容经营工作台</span>
          <h1>让每一次表达，<br />都更像你。</h1>
          <p>{config?.site?.siteSubtitle ?? "从客户问题到可发布内容，把专业经验沉淀成长期资产。"}</p>
        </div>
        <div className="authProductPreview" aria-label="小谷工作台预览">
          <div className="authPreviewTopbar">
            <div><span>今日灵感</span><strong>内容经营状态</strong></div>
            <span className="authPreviewOnline">已同步</span>
          </div>
          <div className="authPreviewBody">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appPath("/examples/image-card-styles/fresh-card.webp")} alt="小谷生成的保险内容卡片示例" />
            <div className="authPreviewActivity">
              <div><span>热点选题</span><strong>今日已更新</strong></div>
              <div><span>创作内容</span><strong>持续沉淀</strong></div>
              <div><span>合规检查</span><strong>发布前复核</strong></div>
            </div>
          </div>
        </div>
        <div className="authTrustStrip">
          <span>个人风格记忆</span>
          <span>保险合规检查</span>
          <span>数字分身辅助</span>
        </div>
      </aside>

      <section className="panel authCard">
        <div className="authMobileBrand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brandMark" src={resolvePublicUrl(config?.site?.logoUrl || "/brand/xiaogu-icon.png")} alt="" />
          <strong>{config?.site?.siteName ?? "小谷"}AI</strong>
        </div>
        <span className="authEyebrow">{mode === "login" ? "欢迎回来" : "开始使用小谷"}</span>
        <h2>{mode === "login" ? "登录你的工作台" : "创建经纪人账号"}</h2>
        <p className="authLead">
          {mode === "login"
            ? "继续今天的内容创作与数字分身管理。"
            : "注册后即可建立你的专属内容空间。"}
        </p>
        <form
          action={`${mode === "login" ? apiPath("/api/auth/login") : apiPath("/api/auth/register")}${nextPath ? `?next=${encodeURIComponent(safeAuthRedirect(nextPath))}` : ""}`}
          className="form"
          method="post"
          onSubmit={submit}
        >
          {mode === "register" ? (
            <label>
              姓名
              <input name="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
          ) : null}
          {config?.auth?.turnstileEnabled && config.auth.turnstileSiteKey ? <TurnstileWidget siteKey={config.auth.turnstileSiteKey} onToken={setTurnstileToken} /> : null}
          {mode === "register" && config?.auth?.requireInviteCode ? (
            <label>
              邀请码
              <input name="inviteCode" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} required />
            </label>
          ) : null}
          {mode === "register" && config?.affiliate?.enabled ? (
            <label>
              返利邀请码 <span className="formHint">选填</span>
              <input name="referralCode" value={referralCode} onChange={(event) => setReferralCode(event.target.value.toUpperCase())} />
              <span className="formHint">通过好友邀请注册时自动填写，与平台注册门槛邀请码不同。</span>
            </label>
          ) : null}
          <label>
            邮箱
            <input name="email" type="email" autoComplete="email" autoFocus={mode === "login"} value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "auth-form-error" : undefined} required />
          </label>
          <div className="authField">
            <span className="authFieldLabel"><label htmlFor="auth-password">密码</label>{mode === "login" && config?.auth?.passwordResetEnabled !== false ? <a href={appPath("/forgot-password")}>忘记密码？</a> : null}</span>
            <span className="authPasswordField">
              <input
                id="auth-password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "auth-form-error" : undefined}
                required
              />
              <button type="button" aria-label={passwordVisible ? "隐藏密码" : "显示密码"} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((current) => !current)}>{passwordVisible ? "隐藏" : "显示"}</button>
            </span>
            {mode === "register" ? <span className="formHint">{config?.auth?.passwordHint ?? "至少 8 位密码"}</span> : null}
          </div>
          {mode === "login" && totpRequired ? <label>二次验证码或恢复码<input autoComplete="one-time-code" inputMode="numeric" value={totpCode} onChange={(event) => setTotpCode(event.target.value)} required /></label> : null}
          {mode === "register" && config?.legal?.termsEnabled !== false && config?.legal?.displayMode !== "modal" ? (
            <label className="checkboxRow authAgreementRow">
              <input name="acceptedTerms" type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required />
              <span>我已阅读并同意 <a href={appPath("/terms")} target="_blank">小谷服务条款</a> 和 <a href={appPath("/privacy")} target="_blank">小谷隐私政策</a></span>
            </label>
          ) : null}
          {mode === "register" && config?.legal?.termsEnabled !== false && config?.legal?.displayMode === "modal" ? (
            <div className="authAgreementModalTrigger">
              <button className="secondaryButton" onClick={() => setAgreementOpen(true)} type="button">{acceptedTerms ? "已同意小谷服务条款与隐私政策" : "阅读小谷服务条款与隐私政策"}</button>
              <span role={acceptedTerms ? "status" : undefined}>{acceptedTerms ? "已阅读并同意" : "注册前需完成阅读"}</span>
            </div>
          ) : null}
          {mode === "register" && config?.auth?.allowRegistration === false ? <div className="alertPanel">当前暂未开放新用户注册。</div> : null}
          {error ? <div className="authFormError" id="auth-form-error" role="alert">{error}</div> : null}
          <button className="primaryButton" disabled={submitting || (mode === "register" && (config?.auth?.allowRegistration === false || (config?.legal?.termsEnabled !== false && !acceptedTerms)))} type="submit">
            {submitting ? (mode === "login" ? "登录中..." : "注册中...") : mode === "login" ? "进入工作台" : "注册并进入"}
          </button>
        </form>
        <p className="authAccountSwitch">
          {mode === "login" ? "还没有账号？" : "已经有账号？"}{" "}
          <a href={appPath(`${mode === "login" ? "/register" : "/login"}${nextPath ? `?next=${encodeURIComponent(safeAuthRedirect(nextPath))}` : ""}`)}>{mode === "login" ? "立即注册" : "去登录"}</a>
        </p>
        <nav className="authLegalLinks" aria-label="小谷服务条款与隐私政策"><a href={appPath("/terms")}>小谷服务条款</a><span>·</span><a href={appPath("/privacy")}>小谷隐私政策</a></nav>
      </section>
      {agreementOpen ? (
        <div className="authAgreementBackdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setAgreementOpen(false); }}>
          <section aria-labelledby="agreement-dialog-title" aria-modal="true" className="authAgreementDialog" role="dialog">
            <header><div><span>注册协议</span><h2 id="agreement-dialog-title">请阅读并确认</h2></div><button aria-label="关闭协议窗口" className="iconButton" onClick={() => setAgreementOpen(false)} type="button">×</button></header>
            <nav aria-label="协议文档" className="authAgreementTabs" role="tablist">
              {(config?.legal?.documents ?? []).map((document) => <button aria-selected={agreementSlug === document.slug} className={agreementSlug === document.slug ? "active" : ""} key={document.slug} onClick={() => setAgreementSlug(document.slug)} role="tab" type="button">{document.title}</button>)}
            </nav>
            <article className="authAgreementContent" role="tabpanel"><ReactMarkdown>{config?.legal?.documents?.find((document) => document.slug === agreementSlug)?.content ?? "正在加载协议内容..."}</ReactMarkdown></article>
            <footer><a href={appPath(agreementSlug === "terms" || agreementSlug === "privacy" ? `/${agreementSlug}` : `/legal/${agreementSlug}`)} target="_blank">在新页面打开</a><button className="primaryButton" onClick={() => { setAcceptedTerms(true); setAgreementOpen(false); }} type="button">同意并继续</button></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function resolvePublicUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : appPath(value.startsWith("/") ? value : `/${value}`);
}
