import { recordAffiliateVisit } from "@/lib/affiliate/service";
import { checkRateLimit, requestClientKey } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  try {
    const rateLimit = checkRateLimit(`affiliate-visit:${requestClientKey(request)}`, 30, 60 * 60 * 1000);
    if (!rateLimit.ok) return Response.json({ recorded: false }, { status: 429, headers: { "retry-after": String(rateLimit.retryAfter) } });
    const body = await request.json() as { referralCode?: string };
    const recorded = await recordAffiliateVisit(String(body.referralCode ?? ""), request.headers.get("user-agent") ?? "");
    return Response.json({ recorded });
  } catch {
    return Response.json({ recorded: false });
  }
}
