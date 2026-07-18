import nodemailer from "nodemailer";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { decryptSettingSecret } from "@/lib/security/secrets";

async function getTransport() {
  const settings = await tryGetSystemSettings();
  const config = settings.email;
  if (!config.enabled) throw new Error("邮件服务未启用");
  if (!config.host || !config.fromEmail) throw new Error("SMTP 主机和发件邮箱未配置");
  const password = config.passwordEncrypted ? decryptSettingSecret(config.passwordEncrypted) : "";
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username ? { user: config.username, pass: password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return { transport, config };
}

export async function testEmailConnection() {
  const { transport } = await getTransport();
  await transport.verify();
  return true;
}

export async function sendSystemEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const { transport, config } = await getTransport();
  const result = await transport.sendMail({
    from: { name: config.fromName || "小谷", address: config.fromEmail },
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return result.messageId;
}

export function systemUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
