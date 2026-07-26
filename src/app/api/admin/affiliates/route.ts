import { requireSessionUser } from "@/lib/auth/session";
import { getAdminAffiliateStats, listAdminAffiliateLedger, listAdminAffiliateRecords, updateAffiliateCustomRate, updateAffiliateRisk } from "@/lib/affiliate/service";
import { z } from "zod";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权查看邀请返利" }, { status: 403 });
  try {
    const [records, ledger, stats] = await Promise.all([listAdminAffiliateRecords(), listAdminAffiliateLedger(), getAdminAffiliateStats()]);
    return Response.json({ records, ledger, stats });
  } catch (error) {
    return Response.json({ error: error instanceof Error && /affiliate_visits|affiliate_accounts|affiliate_ledger/.test(error.message) ? "邀请返利数据库迁移未完成，请执行 pnpm db:migrate" : "邀请返利数据加载失败" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权修改邀请返利" }, { status: 403 });
  const parsed = z.object({ userId: z.string().uuid(), rate: z.number().min(0).max(100).nullable().optional(), riskStatus: z.enum(["clear", "review", "blocked"]).optional(), riskReason: z.string().trim().max(500).optional() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "专属返利配置格式不正确" }, { status: 400 });
  if (parsed.data.riskStatus) {
    const risk = await updateAffiliateRisk(parsed.data.userId, parsed.data.riskStatus, parsed.data.riskReason ?? "");
    return risk ? Response.json({ risk }) : Response.json({ error: "返利用户不存在" }, { status: 404 });
  }
  if (parsed.data.rate === undefined) return Response.json({ error: "缺少返利比例或风险状态" }, { status: 400 });
  const updated = await updateAffiliateCustomRate(parsed.data.userId, parsed.data.rate);
  return updated ? Response.json({ updated }) : Response.json({ error: "返利用户不存在" }, { status: 404 });
}
