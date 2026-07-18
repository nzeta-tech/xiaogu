import { requireSessionUser } from "@/lib/auth/session";
import { getAffiliateDetail, transferAffiliateCredits } from "@/lib/affiliate/service";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  return Response.json({ affiliate: await getAffiliateDetail(user.id) });
}

export async function POST() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const result = await transferAffiliateCredits(user.id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ transfer: result });
}
