import { requireSessionUser } from "@/lib/auth/session";
import { tryDeleteConversation, tryGetConversationMessages } from "@/lib/db/repositories";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await context.params;
  const conversation = await tryGetConversationMessages({ userId: user.id, conversationId: id });
  if (!conversation) {
    return Response.json({ error: "对话不存在或无权访问" }, { status: 404 });
  }

  return Response.json({ conversation, mode: "server" });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await context.params;
  const deleted = await tryDeleteConversation({ userId: user.id, conversationId: id });
  if (!deleted) {
    return Response.json({ error: "对话不存在或无权删除" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
