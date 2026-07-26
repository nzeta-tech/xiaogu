import { requireSessionUser } from "@/lib/auth/session";
import { listAffiliateNotifications, markAffiliateNotificationsRead } from "@/lib/affiliate/notifications";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  return Response.json({ notifications: await listAffiliateNotifications(user.id) });
}

export async function PATCH() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  await markAffiliateNotificationsRead(user.id);
  return Response.json({ ok: true });
}
