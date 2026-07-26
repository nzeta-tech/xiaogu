import { requireSessionUser } from "@/lib/auth/session";
import { getViralExamples } from "@/lib/viral-examples";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const result = await getViralExamples();
  return Response.json(result, { headers: { "cache-control": "private, no-store" } });
}
