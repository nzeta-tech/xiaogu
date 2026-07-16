import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryListBillingPlans, tryUpsertBillingPlan } from "@/lib/db/repositories";

const schema = z.object({
  code: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(80),
  quotaAmount: z.number().int().min(1).max(1000000),
  amountCents: z.number().int().min(0).max(100000000),
  currency: z.enum(["CNY", "USD"]).default("CNY"),
  description: z.string().trim().min(1).max(500),
  recommended: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问套餐管理" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const plans = await tryListBillingPlans({ includeInactive: true });
  return Response.json({ plans, mode: "server" });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const input = schema.parse(await request.json());
  const plan = await tryUpsertBillingPlan(input);
  if (!plan) return Response.json({ error: "套餐保存失败" }, { status: 503 });

  await tryCreateAdminAuditLog({
    adminUserId: user.id,
    action: "billing_plan.upsert",
    targetType: "billing_plan",
    targetId: input.code,
    detail: input,
  });

  return Response.json({ plan, mode: "server" });
}
