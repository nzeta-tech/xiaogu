import { requireSessionUser } from "@/lib/auth/session";
import { getAppAccessPolicy, getExclusiveAppAccess } from "@/lib/billing/paid-access";
import { getCreationAppBySlug } from "@/lib/apps/catalog";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const slug = new URL(request.url).searchParams.get("app");
  if (slug && !getCreationAppBySlug(slug)) return Response.json({ error: "应用不存在" }, { status: 404 });
  try {
    const [customer, policy] = await Promise.all([getExclusiveAppAccess(user.id), slug ? getAppAccessPolicy(slug) : Promise.resolve(null)]);
    return Response.json({ eligible: customer.eligible, totals: customer.paid.totals, blocked: customer.source === "blocked", policy, allowed: policy === "credits" || customer.eligible }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "暂时无法核验充值资格，请稍后重试。" }, { status: 503 });
  }
}
