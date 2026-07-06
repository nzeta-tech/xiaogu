import { requireSessionUser } from "@/lib/auth/session";
import { tryListUsageLogs } from "@/lib/db/repositories";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const usage = await tryListUsageLogs(user.id);

  return Response.json({
    usage,
    mode: "server",
  });
}
