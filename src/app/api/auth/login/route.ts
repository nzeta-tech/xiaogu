import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { verifyUser } from "@/lib/auth/users";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const user = await verifyUser(input.email, input.password);
    if (!user) {
      return Response.json({ error: "邮箱或密码不正确" }, { status: 401 });
    }

    await createSession(user);
    return Response.json({ user });
  } catch {
    return Response.json({ error: "登录服务暂不可用，请检查数据库配置" }, { status: 503 });
  }
}
