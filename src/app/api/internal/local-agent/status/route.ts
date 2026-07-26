import { requireLocalAgent } from "@/lib/local-agent/auth";
import { getLocalAgentReleaseStatus } from "@/lib/local-agent/repository";

export async function GET(request: Request) {
  const unauthorized = requireLocalAgent(request);
  if (unauthorized) return unauthorized;
  return Response.json(await getLocalAgentReleaseStatus(), { headers: { "cache-control": "no-store" } });
}
