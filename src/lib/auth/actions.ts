import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db/client";
import { sendSystemEmail, systemUrl } from "@/lib/email/mailer";
import { tryGetSystemSettings } from "@/lib/db/repositories";

type TokenType = "verify_email" | "reset_password";

export async function createAndSendAuthToken(input: { userId: string; email: string; name: string; type: TokenType }) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const hours = input.type === "verify_email" ? 24 : 1;
  await query("update auth_action_tokens set used_at=now() where user_id=$1 and token_type=$2 and used_at is null", [input.userId, input.type]);
  await query(
    `insert into auth_action_tokens(user_id, token_type, token_hash, expires_at)
     values ($1,$2,$3,now()+($4||' hours')::interval)`,
    [input.userId, input.type, tokenHash, hours],
  );
  const path = input.type === "verify_email" ? `/verify-email?token=${encodeURIComponent(token)}` : `/reset-password?token=${encodeURIComponent(token)}`;
  const purpose = input.type === "verify_email" ? "验证邮箱" : "重置密码";
  const url = systemUrl(path);
  const settings = await tryGetSystemSettings();
  const subjectTemplate = input.type === "verify_email" ? settings.email.verificationSubject : settings.email.passwordResetSubject;
  const bodyTemplate = input.type === "verify_email" ? settings.email.verificationBody : settings.email.passwordResetBody;
  const templateValues = { name: input.name, hours: String(hours), url, purpose };
  const subject = renderEmailTemplate(subjectTemplate, templateValues);
  const text = renderEmailTemplate(bodyTemplate, templateValues);
  await sendSystemEmail({
    to: input.email,
    subject,
    text,
    html: `<p>${escapeHtml(text).replaceAll("\n", "<br />")}</p>`,
  });
}

export async function consumeEmailVerificationToken(token: string) {
  const result = await query<{ id: string; user_id: string }>(
    `update auth_action_tokens set used_at=now()
     where token_hash=$1 and token_type='verify_email' and used_at is null and expires_at>now()
     returning id,user_id`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) return false;
  await query("update users set email_verified_at=now(),updated_at=now() where id=$1", [row.user_id]);
  return true;
}

export async function consumePasswordResetToken(token: string, newPassword: string) {
  const result = await query<{ id: string; user_id: string }>(
    `update auth_action_tokens set used_at=now()
     where token_hash=$1 and token_type='reset_password' and used_at is null and expires_at>now()
     returning id,user_id`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) return false;
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await query("update users set password_hash=$2,session_version=session_version+1,updated_at=now() where id=$1", [row.user_id, passwordHash]);
  await query("update auth_action_tokens set used_at=now() where user_id=$1 and used_at is null", [row.user_id]);
  return true;
}

export async function findActiveUserForEmail(email: string) {
  const result = await query<{ id: string; email: string; name: string; email_verified_at: string | null; terms_accepted_version: string; totp_enabled: boolean }>(
    "select id,email,name,email_verified_at,terms_accepted_version,totp_enabled from users where email=lower($1) and status='active'",
    [email],
  );
  return result.rows[0] ?? null;
}

export async function recordLoginEvent(input: { userId?: string | null; email: string; success: boolean; clientIp: string; userAgent: string; failureReason?: string }) {
  await query(
    `insert into login_events(user_id,email,success,client_ip,user_agent,failure_reason)
     values ($1,lower($2),$3,$4,$5,$6)`,
    [input.userId ?? null, input.email, input.success, input.clientIp.slice(0, 180), input.userAgent.slice(0, 500), input.failureReason ?? ""],
  ).catch(() => undefined);
}

export async function listLoginEvents(userId: string) {
  const result = await query<{ id: string; success: boolean; client_ip: string; user_agent: string; failure_reason: string; created_at: string }>(
    "select id,success,client_ip,user_agent,failure_reason,created_at from login_events where user_id=$1 order by created_at desc limit 30",
    [userId],
  );
  return result.rows;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function renderEmailTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(name|hours|url|purpose)\}\}/g, (_match, key: string) => values[key] ?? "");
}
