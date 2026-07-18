import { clearSession, requireSessionUser } from "@/lib/auth/session";
import { listLoginEvents } from "@/lib/auth/actions";
import { query } from "@/lib/db/client";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  return Response.json({ events: await listLoginEvents(user.id) });
}

export async function DELETE() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  await query("update users set session_version=session_version+1,updated_at=now() where id=$1", [user.id]);
  await clearSession();
  return Response.json({ ok: true });
}
