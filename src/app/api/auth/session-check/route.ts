import { getSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getSessionUser({ allowTermsMismatch: true });
  if (!user) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  return Response.json({ authenticated: true });
}
