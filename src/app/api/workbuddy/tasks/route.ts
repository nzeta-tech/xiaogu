import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { createWorkbuddyTask, listWorkbuddyWorkspace } from "@/lib/workbuddy/store";

const inputSchema = z.object({
  objective: z.string().trim().min(1).max(6000),
  scenario: z.enum(["content", "video", "customer", "product", "team", "research", "general"]).optional(),
  context: z.string().trim().max(20000).default(""),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  try { return Response.json({ workspace: await listWorkbuddyWorkspace(user.id) }, { headers: { "cache-control": "private, no-store" } }); }
  catch { return Response.json({ error: "Workbuddy 工作台暂时无法加载，请确认数据库迁移已完成。" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请完整描述工作目标，内容不超过 6000 字。" }, { status: 400 });
  try {
    const task = await createWorkbuddyTask(user, parsed.data);
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "任务创建失败" }, { status: 503 });
  }
}
