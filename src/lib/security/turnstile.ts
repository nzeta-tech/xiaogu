import { decryptSettingSecret } from "@/lib/security/secrets";
import type { SystemSettings } from "@/lib/system/settings";

export async function verifyTurnstile(input: { settings: SystemSettings; token?: string; clientIp?: string }) {
  if (!input.settings.auth.turnstileEnabled) return true;
  if (!input.token) return false;
  const encrypted = input.settings.auth.turnstileSecretEncrypted;
  if (!encrypted) return false;
  try {
    const secret = decryptSettingSecret(encrypted);
    const body = new URLSearchParams({ secret, response: input.token });
    if (input.clientIp && input.clientIp !== "unknown") body.set("remoteip", input.clientIp);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json() as { success?: boolean };
    return response.ok && payload.success === true;
  } catch {
    return false;
  }
}
