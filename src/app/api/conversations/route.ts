import { requireSessionUser } from "@/lib/auth/session";
import { tryListConversations } from "@/lib/db/repositories";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const conversations = await tryListConversations(user.id);
  return Response.json({ conversations, mode: "server" });
}
