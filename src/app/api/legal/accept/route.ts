import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";
import { tryGetSystemSettings } from "@/lib/db/repositories";

export async function POST() {
  const user = await requireSessionUser({ allowTermsMismatch: true });
  if (user instanceof Response) return user;
  const settings = await tryGetSystemSettings();
  await query("update users set terms_accepted_version=$2,terms_accepted_at=now(),updated_at=now() where id=$1", [user.id, settings.legal.termsVersion]);
  return Response.json({ ok: true, version: settings.legal.termsVersion });
}
