import { requireLocalAgent } from "@/lib/local-agent/auth";
import { retiredChanjingResponse } from "@/lib/digital-human/retirement";

export async function POST(request: Request) {
  const unauthorized = requireLocalAgent(request); if (unauthorized) return unauthorized;
  return retiredChanjingResponse();
}
