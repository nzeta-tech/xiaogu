import { z } from "zod";
import { runInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { requireSessionUser } from "@/lib/auth/session";

const schema = z.object({ prompt: z.string().trim().min(5).max(3000) });

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "请输入要测试的主题" }, { status: 400 });

  try {
    const message = [{ role: "user" as const, content: `数字分身试写任务：${parsed.data.prompt}\n输出一段 180-280 字、可直接发布的保险内容，不要解释过程。` }];
    const [avatarText, baselineText] = await Promise.all([
      runInsuranceContentAgent(message, user.id, "general"),
      runInsuranceContentAgent(message, null, "general"),
    ]);
    return Response.json({ avatarText, baselineText });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "试写失败" }, { status: 503 });
  }
}
