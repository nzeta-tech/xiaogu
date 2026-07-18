import { requireSessionUser } from "@/lib/auth/session";
import { listAdminAffiliateLedger, listAdminAffiliateRecords, updateAffiliateCustomRate } from "@/lib/affiliate/service";
import { z } from "zod";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权查看邀请返利" }, { status: 403 });
  const [records, ledger] = await Promise.all([listAdminAffiliateRecords(), listAdminAffiliateLedger()]);
  return Response.json({ records, ledger });
}

export async function PATCH(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权修改邀请返利" }, { status: 403 });
  const parsed = z.object({ userId: z.string().uuid(), rate: z.number().min(0).max(100).nullable() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "专属返利配置格式不正确" }, { status: 400 });
  const updated = await updateAffiliateCustomRate(parsed.data.userId, parsed.data.rate);
  return updated ? Response.json({ updated }) : Response.json({ error: "返利用户不存在" }, { status: 404 });
}
