import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { query } from "@/lib/db/client";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
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
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
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
      }>(
        `select id, organization_id, name, email, role
         from users
         where id = $1 and status = 'active'`,
        [sessionUser.id],
      );
      const user = fresh.rows[0];
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organization_id,
      };
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export async function requireSessionUser(): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "请先登录" }, { status: 401 });
  }
  return user;
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}
