import { requireSessionUser } from "@/lib/auth/session";
import { listActiveWorkbuddyCapabilities } from "@/lib/workbuddy/capabilities";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  return Response.json({ capabilities: await listActiveWorkbuddyCapabilities() }, { headers: { "cache-control": "private, no-store" } });
}
