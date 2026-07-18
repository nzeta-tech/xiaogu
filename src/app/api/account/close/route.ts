import bcrypt from "bcryptjs";
import { z } from "zod";
import { clearSession, requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { tryCountActiveAdmins } from "@/lib/db/repositories";

const schema = z.object({ password: z.string().min(1), confirmation: z.literal("注销账号") });

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role === "admin") {
    const activeAdmins = await tryCountActiveAdmins();
    if (activeAdmins === null) return Response.json({ error: "无法校验管理员数量，请稍后再试" }, { status: 503 });
    if (activeAdmins <= 1) return Response.json({ error: "系统必须至少保留一个有效管理员，不能注销最后一个管理员账号" }, { status: 409 });
  }
  const rateLimit = checkRateLimit(`close-account:${user.id}`, 3, 60 * 60 * 1000);
  if (!rateLimit.ok) return Response.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "请输入密码并确认注销账号" }, { status: 400 });
  const result = await query<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
  const valid = result.rows[0] && await bcrypt.compare(parsed.data.password, result.rows[0].password_hash);
  if (!valid) return Response.json({ error: "密码不正确" }, { status: 403 });

  await query("update users set status = 'disabled', updated_at = now() where id = $1", [user.id]);
  await clearSession();
  return Response.json({ ok: true });
}
