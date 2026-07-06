import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryGrantGiftCredits } from "@/lib/db/repositories";

const schema = z.object({
  userId: z.string().uuid(),
  quotaAmount: z.number().int().min(1).max(100000),
  note: z.string().trim().min(1).max(200).default("管理员赠送"),
});

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权调整额度" }, { status: 403 });

  const input = schema.parse(await request.json());
  const gift = await tryGrantGiftCredits({
    userId: input.userId,
    quotaAmount: input.quotaAmount,
    sourceType: "admin",
    sourceLabel: input.note,
    metadata: { adminId: user.id },
  });

  if (!gift) return Response.json({ error: "赠送额度失败" }, { status: 503 });
  return Response.json({ gift, mode: "server" });
}
