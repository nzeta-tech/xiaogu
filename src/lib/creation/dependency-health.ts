import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "@/lib/db/client";
import { hasModelConfig, isDemoModeEnabled } from "@/lib/config/runtime";

const execFileAsync = promisify(execFile);

export type CreationDependencyCheck = {
  key: string;
  label: string;
  ok: boolean;
  error: string;
};

export async function checkLinkRemixDependencies(): Promise<CreationDependencyCheck[]> {
  const webChecks = [
    check("database", "数据库", async () => { await query("select 1"); }),
    check("model", "文本模型", checkModel),
  ];
  if (process.env.LOCAL_AGENT_ENABLED === "1") return Promise.all(webChecks);
  const checks = await Promise.all([
    ...webChecks,
    check("transcriber", "本地语音转写服务", checkTranscriber),
    check("yt_dlp", "抖音解析下载器", async () => { await execFileAsync(process.env.DOUYIN_YT_DLP_PATH ?? "yt-dlp", ["--version"], { timeout: 8000 }); }),
  ]);
  return checks;
}

export function formatDependencyFailure(checks: CreationDependencyCheck[]) {
  return checks.filter((check) => !check.ok).map((check) => `${check.label}：${check.error}`).join("；");
}

async function checkModel() {
  if (isDemoModeEnabled()) return;
  if (!hasModelConfig()) throw new Error("未配置模型地址或 API Key");
  const provider = process.env.MODEL_PROVIDER ?? "openai";
  if (provider === "google") {
    const base = process.env.MODEL_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
    const key = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) throw new Error("未配置 Google API Key");
    const model = process.env.MODEL_NAME ?? "gemini-2.0-flash";
    const response = await fetch(`${base.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with OK." }] }], generationConfig: { maxOutputTokens: 1 } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`实际生成探针 HTTP ${response.status}`);
    return;
  }
  const base = process.env.MODEL_API_BASE ?? (provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");
  const apiKey = process.env.MODEL_API_KEY ?? process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("未配置模型 API Key");
  const response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.MODEL_NAME ?? (provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini"),
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 1,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`实际生成探针 HTTP ${response.status}`);
}

async function checkTranscriber() {
  const base = process.env.VIRAL_TRANSCRIBE_API_BASE?.trim();
  if (!base) throw new Error("未配置 VIRAL_TRANSCRIBE_API_BASE");
  await checkHttp(`${base.replace(/\/$/, "")}/health`);
}

async function checkHttp(url: string, apiKey?: string) {
  const response = await fetch(url, {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function check(key: string, label: string, action: () => Promise<void>): Promise<CreationDependencyCheck> {
  try {
    await action();
    return { key, label, ok: true, error: "" };
  } catch (error) {
    return { key, label, ok: false, error: error instanceof Error ? error.message.slice(0, 180) : "连接失败" };
  }
}
