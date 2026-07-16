import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryGetAdminUserDetail } from "@/lib/db/repositories";

export async function GET(request: Request) {
  const admin = await requireSessionUser();
  if (admin instanceof Response) return admin;
  if (admin.role !== "admin") return Response.json({ error: "无权访问用户详情" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const userId = z.string().uuid().parse(searchParams.get("userId"));
  const detail = await tryGetAdminUserDetail(userId);
  if (!detail) return Response.json({ error: "用户详情不存在" }, { status: 404 });

  return Response.json({ detail, mode: "server" });
}
