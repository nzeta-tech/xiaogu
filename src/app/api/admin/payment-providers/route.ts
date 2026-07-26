import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryCreateAdminAuditLog, tryDeletePaymentProvider, tryListPaymentProviders, tryUpsertPaymentProvider } from "@/lib/db/repositories";

const providerKeys = z.enum(["stripe", "airwallex", "easypay", "alipay", "wxpay"]);
const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  providerKey: providerKeys,
  enabled: z.boolean().default(false),
  sortOrder: z.number().int().min(-1000).max(1000).default(0),
  supportedMethods: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  config: z.record(z.string(), z.string().max(10000)).default({}),
  minAmountCents: z.number().int().min(0).max(100000000).default(0),
  maxAmountCents: z.number().int().min(0).max(100000000).default(0),
  dailyLimitCents: z.number().int().min(0).max(1000000000).default(0),
  refundEnabled: z.boolean().default(false),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权管理支付服务商" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  return Response.json({ providers: await tryListPaymentProviders() });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "服务商配置格式不正确" }, { status: 400 });
  if (parsed.data.maxAmountCents > 0 && parsed.data.minAmountCents > parsed.data.maxAmountCents) return Response.json({ error: "服务商最低金额不能大于最高金额" }, { status: 400 });
  const provider = await tryUpsertPaymentProvider(parsed.data);
  if (!provider) return Response.json({ error: "服务商保存失败，请确认数据库迁移已执行" }, { status: 503 });
  await tryCreateAdminAuditLog({ adminUserId: user.id, action: parsed.data.id ? "payment_provider.update" : "payment_provider.create", targetType: "payment_provider_instance", targetId: provider.id, detail: { name: provider.name, providerKey: provider.providerKey, enabled: provider.enabled } });
  return Response.json({ provider });
}

export async function DELETE(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "缺少服务商 ID" }, { status: 400 });
  if (!await tryDeletePaymentProvider(id)) return Response.json({ error: "服务商删除失败" }, { status: 503 });
  await tryCreateAdminAuditLog({ adminUserId: user.id, action: "payment_provider.delete", targetType: "payment_provider_instance", targetId: id, detail: {} });
  return Response.json({ ok: true });
}
