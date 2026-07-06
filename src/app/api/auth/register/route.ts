import { ZodError } from "zod";
import { createSession } from "@/lib/auth/session";
import { authInputSchema, registerUser } from "@/lib/auth/users";

export async function POST(request: Request) {
  try {
    const input = authInputSchema.extend({ name: authInputSchema.shape.name.unwrap() }).parse(await request.json());
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
