import { requireSessionUser } from "@/lib/auth/session";
import { getQuotaBalance } from "@/lib/billing/openmeter";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const balance = await getQuotaBalance(user.id);

  return Response.json({
    ...balance,
    customerId: user.id,
  });
}
