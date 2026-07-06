import { requireSessionUser } from "@/lib/auth/session";
import { tryGetWorkbenchOverview } from "@/lib/db/repositories";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const overview = await tryGetWorkbenchOverview(user.id);
  if (!overview) {
    return Response.json({ error: "工作台数据暂不可用" }, { status: 503 });
  }

  return Response.json({ overview, mode: "server" });
}
