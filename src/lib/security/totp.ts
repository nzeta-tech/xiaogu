import { createHash, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { query } from "@/lib/db/client";
import { decryptSettingSecret, encryptSettingSecret } from "@/lib/security/secrets";

export async function createTotpSetup(input: { userId: string; email: string; issuer: string }) {
  const secret = generateSecret();
  const uri = generateURI({ issuer: input.issuer, label: input.email, secret });
  await query("update users set totp_enabled=false,totp_secret_encrypted=$2,totp_recovery_codes='[]'::jsonb,updated_at=now() where id=$1", [input.userId, encryptSettingSecret(secret)]);
  return { secret, uri, qrCodeDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) };
}

export async function enableTotp(userId: string, token: string) {
  const secret = await getTotpSecret(userId);
  if (!secret || !(await verify({ secret, token })).valid) return null;
  const recoveryCodes = Array.from({ length: 8 }, () => `${randomCode(4)}-${randomCode(4)}`);
  await query("update users set totp_enabled=true,totp_recovery_codes=$2::jsonb,session_version=session_version+1,updated_at=now() where id=$1", [userId, JSON.stringify(recoveryCodes.map(hashCode))]);
  return recoveryCodes;
}

export async function disableTotp(userId: string, token: string) {
  if (!await verifyTotpForUser(userId, token)) return false;
  await query("update users set totp_enabled=false,totp_secret_encrypted='',totp_recovery_codes='[]'::jsonb,session_version=session_version+1,updated_at=now() where id=$1", [userId]);
  return true;
}

export async function verifyTotpForUser(userId: string, token: string) {
  const normalized = token.trim().toUpperCase();
  const result = await query<{ totp_secret_encrypted: string; totp_recovery_codes: string[] }>("select totp_secret_encrypted,totp_recovery_codes from users where id=$1 and totp_enabled=true", [userId]);
  const row = result.rows[0];
  if (!row?.totp_secret_encrypted) return false;
  if (/^\d{6}$/.test(normalized)) return (await verify({ secret: decryptSettingSecret(row.totp_secret_encrypted), token: normalized })).valid;
  const recoveryHash = hashCode(normalized);
  if (!row.totp_recovery_codes.includes(recoveryHash)) return false;
  await query("update users set totp_recovery_codes=$2::jsonb,updated_at=now() where id=$1", [userId, JSON.stringify(row.totp_recovery_codes.filter((item) => item !== recoveryHash))]);
  return true;
}

async function getTotpSecret(userId: string) {
  const result = await query<{ totp_secret_encrypted: string }>("select totp_secret_encrypted from users where id=$1", [userId]);
  return result.rows[0]?.totp_secret_encrypted ? decryptSettingSecret(result.rows[0].totp_secret_encrypted) : "";
}

function randomCode(length: number) {
  return randomBytes(length).toString("hex").slice(0, length).toUpperCase();
}

function hashCode(value: string) {
  return createHash("sha256").update(value.replaceAll("-", "").toUpperCase()).digest("hex");
}
