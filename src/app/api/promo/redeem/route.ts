import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { tryRedeemPromoCode } from "@/lib/db/repositories";

const schema = z.object({
  code: z.string().trim().min(3).max(40),
});

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const input = schema.parse(await request.json());
  const result = await tryRedeemPromoCode({ userId: user.id, code: input.code });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ redemption: result, mode: "server" });
}
