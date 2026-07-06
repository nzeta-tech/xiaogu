"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [name, setName] = useState("张经纪");
  const [email, setEmail] = useState("broker@example.com");
  const [password, setPassword] = useState("broker123");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const endpoint = mode === "login" ? apiPath("/api/auth/login") : apiPath("/api/auth/register");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password }),
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
    }
  }

  return (
    <div className="authPage">
      <section className="panel authCard">
        <div className="brand" style={{ color: "var(--text)", marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brandMark" src={appPath("/brand/xiaogu-icon.png")} alt="小谷" />
          <span>小谷</span>
        </div>
        <h1 style={{ margin: "0 0 8px" }}>{mode === "login" ? "经纪人登录" : "创建经纪人账号"}</h1>
        <p style={{ margin: "0 0 18px", color: "var(--muted)" }}>
          {mode === "login"
            ? "测试账号：broker@example.com / broker123。登录后会进入真实数据库工作台。"
            : "注册后会创建经纪人账号、机构空间，后续通过思维设定生成个人画像。"}
        </p>
        <form className="form" onSubmit={submit}>
          {mode === "register" ? (
            <label>
              姓名
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
          ) : null}
          <label>
            邮箱
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}
          <button className="primaryButton" type="submit">
            {mode === "login" ? "进入工作台" : "注册并进入"}
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
