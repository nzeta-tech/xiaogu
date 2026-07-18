import { requireSessionUser } from "@/lib/auth/session";
import { checkServiceHealth } from "@/lib/system/service-health";
import { listModelRuntimeEvents } from "@/lib/agent/model-runtime";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权查看服务状态" }, { status: 403 });
  const [health, runtime] = await Promise.all([checkServiceHealth(), listModelRuntimeEvents()]);
  return Response.json({ health, runtime });
}
