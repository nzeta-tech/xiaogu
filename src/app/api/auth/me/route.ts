import { getSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ user: null, error: "请先登录" }, { status: 401 });
  }
  return Response.json({ user });
}
