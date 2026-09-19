import { z } from "zod";
import { query } from "@/lib/db/client";
import { requireSessionUser } from "@/lib/auth/session";
import { getExclusiveAppAccess } from "@/lib/billing/paid-access";
import { ExclusiveAccessUpdateError, getExclusiveAccessHistory, updateExclusiveAccess } from "@/lib/billing/exclusive-access-store";

const schema = z.object({
  userId: z.string().uuid(),
  mode: z.enum(["auto", "granted", "blocked"]),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  reason: z.string().trim().min(1).max(500),
  expectedRevision: z.number().int().min(0),
});
async function details(userId: string) {
  const [access, history] = await Promise.all([getExclusiveAppAccess(userId), getExclusiveAccessHistory(userId)]);
  return { override: access.override, effective: { eligible: access.eligible, source: access.source, expired: access.expired }, paid: access.paid.eligible, history };
}
export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权查看专享应用权限" }, { status: 403 });
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("userId"));
  if (!id.success) return Response.json({ error: "用户编号格式不正确" }, { status: 400 });
  try {
    if (!(await query("select id from users where id=$1", [id.data])).rowCount) return Response.json({ error: "用户不存在" }, { status: 404 });
    return Response.json(await details(id.data), { headers: { "Cache-Control": "no-store" } });
  }
  catch { return Response.json({ error: "权限信息加载失败，请稍后重试" }, { status: 503 }); }
}
export async function PATCH(request: Request) {
  const admin = await requireSessionUser();
  if (admin instanceof Response) return admin;
  if (admin.role !== "admin") return Response.json({ error: "无权修改专享应用权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请填写权限设置、有效期和操作原因。" }, { status: 400 });
  try {
    await updateExclusiveAccess({ ...parsed.data, adminId: admin.id });
  } catch (error) {
    return Response.json({ error: error instanceof ExclusiveAccessUpdateError ? error.message : "保存失败，权限未变更，请稍后重试。" }, { status: error instanceof ExclusiveAccessUpdateError ? error.status : 503 });
  }
  // A failed follow-up read must not imply the committed update was rolled back.
  return Response.json({ ok: true });
}
