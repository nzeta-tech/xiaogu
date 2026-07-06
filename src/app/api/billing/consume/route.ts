import { requireSessionUser } from "@/lib/auth/session";
import { reportUsage } from "@/lib/billing/openmeter";
import type { QuotaAction } from "@/lib/billing/quota";

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string; amount?: number };
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const result = await reportUsage({
    customerId: user.id,
    action: (body.action ?? "write_script") as QuotaAction,
    amount: body.amount,
  });

  return Response.json({
    ok: result.ok,
    action: body.action ?? "unknown",
    amount: result.amount,
    mode: result.mode,
  });
}
