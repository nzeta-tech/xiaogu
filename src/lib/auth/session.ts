import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { query } from "@/lib/db/client";
import { tryGetSystemSettings } from "@/lib/db/repositories";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
  sessionVersion?: number;
  termsAcceptedVersion?: string;
};

const cookieName = "ica_session";

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-secret-change-before-production";
  return new TextEncoder().encode(secret);
}

function shouldUseSecureCookies() {
  if (process.env.AUTH_SECURE_COOKIES) {
    return process.env.AUTH_SECURE_COOKIES === "true";
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
  return appUrl.startsWith("https://");
}

export async function createSession(user: SessionUser) {
  const settings = await tryGetSystemSettings();
  const sessionDays = Math.min(Math.max(settings.auth.sessionDays, 1), 30);
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionDays}d`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 60 * 60 * 24 * sessionDays,
  });
}

export async function createTotpChallenge(user: SessionUser) {
  return new SignJWT({ type: "totp", userId: user.id, sessionVersion: user.sessionVersion ?? 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getSecret());
}

export async function verifyTotpChallenge(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.type !== "totp" || !payload.userId) return null;
    const result = await query<{ id: string; organization_id: string | null; name: string; email: string; role: string; session_version: number; terms_accepted_version: string }>(
      "select id,organization_id,name,email,role,session_version,terms_accepted_version from users where id=$1 and status='active'",
      [String(payload.userId)],
    );
    const user = result.rows[0];
    if (!user || user.session_version !== Number(payload.sessionVersion ?? 1)) return null;
    return { id: user.id, organizationId: user.organization_id, name: user.name, email: user.email, role: user.role, sessionVersion: user.session_version, termsAcceptedVersion: user.terms_accepted_version };
  } catch {
    return null;
  }
}

export async function getSessionUser(options: { allowTermsMismatch?: boolean } = {}): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sessionUser = {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: String(payload.role),
      organizationId: payload.organizationId ? String(payload.organizationId) : null,
    };

    try {
      const fresh = await query<{
        id: string;
        organization_id: string | null;
        name: string;
        email: string;
        role: string;
        session_version: number;
        terms_accepted_version: string;
      }>(
        `select id, organization_id, name, email, role, session_version, terms_accepted_version
         from users
         where id = $1 and status = 'active'`,
        [sessionUser.id],
      );
      const user = fresh.rows[0];
      if (!user) return null;
      if (Number(payload.sessionVersion ?? 1) !== user.session_version) return null;
      if (!options.allowTermsMismatch) {
        const settings = await tryGetSystemSettings();
        if (settings.legal.termsEnabled && settings.legal.requireReaccept && user.terms_accepted_version !== settings.legal.termsVersion) return null;
      }
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organization_id,
        sessionVersion: user.session_version,
        termsAcceptedVersion: user.terms_accepted_version,
      };
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export async function requireSessionUser(options: { allowTermsMismatch?: boolean } = {}): Promise<SessionUser | Response> {
  const user = await getSessionUser(options);
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  return user;
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}
