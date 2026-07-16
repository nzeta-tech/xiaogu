import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { verifyUser } from "@/lib/auth/users";
import { checkRateLimit, clearRateLimit, requestClientKey } from "@/lib/security/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const rateLimitKey = `login:${requestClientKey(request)}`;
    const rateLimit = checkRateLimit(rateLimitKey, 10, 15 * 60 * 1000);
    if (!rateLimit.ok) {
      return Response.json(
        { error: "登录尝试过多，请稍后再试" },
        { status: 429, headers: { "retry-after": String(rateLimit.retryAfter) } },
      );
    }
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "请输入正确的邮箱和密码" }, { status: 400 });
    }

    const input = parsed.data;
    const user = await verifyUser(input.email, input.password);
    if (!user) {
      return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
    }

    await createSession(user);
    clearRateLimit(rateLimitKey);
    return Response.json({ user });
  } catch {
    return Response.json({ error: "登录服务暂不可用，请检查数据库配置" }, { status: 503 });
  }
}
