import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { buildLockedCreativePlan } from "@/lib/digital-human/creative-plan";

const schema = z.object({
  script: z.string().trim().min(5).max(5000),
  aspectRatio: z.enum(["9:16", "16:9"]),
  templateName: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "口播文案不完整" }, { status: 400 });
  return Response.json({ plan: buildLockedCreativePlan(parsed.data) });
}
