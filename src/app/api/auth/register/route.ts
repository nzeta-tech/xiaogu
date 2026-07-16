import { z, ZodError } from "zod";
import { createSession } from "@/lib/auth/session";
import { authInputSchema, registerUser } from "@/lib/auth/users";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { checkRateLimit, requestClientKey } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(`register:${requestClientKey(request)}`, 5, 60 * 60 * 1000);
    if (!rateLimit.ok) {
      return Response.json(
        { error: "注册尝试过多，请稍后再试" },
        { status: 429, headers: { "retry-after": String(rateLimit.retryAfter) } },
      );
    }
    const input = authInputSchema.extend({
      name: authInputSchema.shape.name.unwrap(),
      inviteCode: z.string().trim().max(120).optional(),
      acceptedTerms: z.literal(true),
    }).parse(await request.json());
    const settings = await tryGetSystemSettings();
    if (settings.auth.allowRegistration === false) {
      return Response.json({ error: "当前暂未开放新用户注册" }, { status: 403 });
    }
    if (settings.auth.requireInviteCode === true) {
      const expectedCode = process.env.REGISTRATION_INVITE_CODE;
      if (!expectedCode) return Response.json({ error: "邀请码注册尚未完成配置" }, { status: 503 });
      if (input.inviteCode !== expectedCode) return Response.json({ error: "邀请码无效" }, { status: 403 });
    }
    const user = await registerUser(input);
    await createSession(user);
    return Response.json({ user });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "输入信息不完整或格式不正确" }, { status: 400 });
    }
    if (String(error).includes("duplicate key")) {
      return Response.json({ error: "该邮箱已经注册" }, { status: 409 });
    }
    return Response.json({ error: "注册服务暂不可用，请检查数据库配置" }, { status: 503 });
  }
}
