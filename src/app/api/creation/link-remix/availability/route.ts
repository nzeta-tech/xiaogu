import { requireSessionUser } from "@/lib/auth/session";
import { getLinkRemixAvailability } from "@/lib/local-agent/repository";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  return Response.json(await getLinkRemixAvailability(), { headers: { "cache-control": "no-store" } });
}
