import { z } from "zod";
import { consumeEmailVerificationToken } from "@/lib/auth/actions";

export async function POST(request: Request) {
  const parsed = z.object({ token: z.string().min(20) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "验证链接格式不正确" }, { status: 400 });
  const ok = await consumeEmailVerificationToken(parsed.data.token);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "验证链接无效或已过期" }, { status: 400 });
}
