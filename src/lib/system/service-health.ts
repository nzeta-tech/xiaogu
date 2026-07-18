import { query } from "@/lib/db/client";
import { testEmailConnection } from "@/lib/email/mailer";
import { getStripe } from "@/lib/payments/stripe";
import { tryGetSystemSettings } from "@/lib/db/repositories";

export async function checkServiceHealth() {
  const settings = await tryGetSystemSettings();
  const checks = await Promise.all([
    timedCheck("database", "PostgreSQL", async () => { await query("select 1"); }),
    timedCheck("model", "文本模型", async () => checkHttp(process.env.MODEL_API_BASE, process.env.MODEL_API_KEY, "/models")),
    timedCheck("image", "图片模型", async () => checkHttp(process.env.OPENAI_IMAGE_API_BASE ?? process.env.IMAGE_MODEL_API_BASE, process.env.OPENAI_IMAGE_API_KEY ?? process.env.IMAGE_MODEL_API_KEY, "/models"), settings.features.imageGenerationEnabled),
    timedCheck("topics", "热点数据源", async () => checkHttp(process.env.DAILY_HOT_API_BASE ?? process.env.SEARCH_API_BASE, process.env.DAILY_HOT_API_KEY ?? process.env.SEARCH_API_KEY), settings.features.hotTopicsEnabled),
    timedCheck("openmeter", "OpenMeter 遥测", async () => checkHttp(process.env.OPENMETER_BASE_URL, process.env.OPENMETER_API_KEY, "/customers?limit=1"), false),
    timedCheck("stripe", "Stripe", async () => { await getStripe().balance.retrieve(); }, settings.payment.enableStripe),
    timedCheck("email", "SMTP 邮件", async () => { await testEmailConnection(); }, settings.email.enabled),
  ]);
  const paymentHealth = await query<{ setting_value: { lastWebhookAt?: string; lastEventType?: string } }>("select setting_value from system_settings where setting_key='payment_health'").catch(() => ({ rows: [] }));
  return { checks, lastStripeWebhook: paymentHealth.rows[0]?.setting_value ?? null, checkedAt: new Date().toISOString() };
}

async function timedCheck(key: string, label: string, action: () => Promise<void>, required = true) {
  const started = Date.now();
  try {
    await action();
    return { key, label, ok: true, required, latencyMs: Date.now() - started, error: "" };
  } catch (error) {
    return { key, label, ok: false, required, latencyMs: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 240) : "连接失败" };
  }
}

async function checkHttp(baseUrl?: string, apiKey?: string, suffix = "") {
  if (!baseUrl) throw new Error("未配置服务地址");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${suffix}`, {
    method: suffix ? "GET" : "HEAD",
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
