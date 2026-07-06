import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryListPromoCodes, tryUpsertPromoCode } from "@/lib/db/repositories";

const schema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(3).max(40),
  rewardType: z.enum(["credit", "discount"]).default("credit"),
  creditAmount: z.number().int().min(0).max(100000).default(0),
  discountPercent: z.number().int().min(0).max(100).default(0),
  status: z.enum(["active", "inactive"]).default("active"),
  maxRedemptions: z.number().int().min(1).max(100000).default(1),
  startsAt: z.string().datetime().optional().or(z.literal("")),
  expiresAt: z.string().datetime().optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
});

async function requireAdmin() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问优惠码管理" }, { status: 403 });
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const promoCodes = await tryListPromoCodes();
  return Response.json({ promoCodes, mode: "server" });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (user instanceof Response) return user;

  const input = schema.parse(await request.json());
  const promoCode = await tryUpsertPromoCode({
    id: input.id,
    code: input.code,
    rewardType: input.rewardType,
    creditAmount: input.creditAmount,
    discountPercent: input.discountPercent,
    status: input.status,
    maxRedemptions: input.maxRedemptions,
    startsAt: input.startsAt || null,
    expiresAt: input.expiresAt || null,
    notes: input.notes,
  });

  if (!promoCode) {
    return Response.json({ error: "优惠码保存失败" }, { status: 503 });
  }
  return Response.json({ promoCode, mode: "server" });
}
