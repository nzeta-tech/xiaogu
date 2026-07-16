import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(120) });

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const rateLimit = checkRateLimit(`password:${user.id}`, 5, 30 * 60 * 1000);
  if (!rateLimit.ok) return Response.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "新密码至少需要 8 位" }, { status: 400 });
  const result = await query<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
  const valid = result.rows[0] && await bcrypt.compare(parsed.data.currentPassword, result.rows[0].password_hash);
  if (!valid) return Response.json({ error: "当前密码不正确" }, { status: 403 });
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await query("update users set password_hash = $2, updated_at = now() where id = $1", [user.id, passwordHash]);
  return Response.json({ ok: true });
}
