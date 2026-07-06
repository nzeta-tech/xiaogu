import { requireSessionUser } from "@/lib/auth/session";
import { tryListGiftRecords } from "@/lib/db/repositories";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const gifts = await tryListGiftRecords(user.id);
  return Response.json({ gifts, mode: "server" });
}
