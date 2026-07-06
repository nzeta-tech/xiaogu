import {
  runInsuranceContentAgent,
  streamInsuranceContentAgent,
  type AgentMessage,
  type WritingStyleMode,
} from "@/lib/agent/insurance-agent";
import { requireSessionUser } from "@/lib/auth/session";
import { getMeteringMode, reportUsage } from "@/lib/billing/openmeter";
import { requireQuota } from "@/lib/billing/enforce";
import { tryCreateConversation, trySaveMessages, trySaveUsageLog } from "@/lib/db/repositories";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    messages?: AgentMessage[];
    action?: string;
    conversationId?: string;
    styleMode?: WritingStyleMode;
  };
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const quota = await requireQuota(user, "write_script");
  if (!quota.ok) return quota.response;

  const messages = sanitizeMessages(body.messages ?? []);
  const conversationId = await tryCreateConversation({
    userId: user.id,
    conversationId: body.conversationId,
    title: inferConversationTitle(messages),
  });
  if (!conversationId) {
    return Response.json({ error: "对话创建失败，请检查数据库连接" }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const encodeEvent = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      let content = "";
      try {
        controller.enqueue(encoder.encode(": stream\n\n"));
        controller.enqueue(encodeEvent({ type: "meta", conversationId, usage: { quotaCost: quota.quotaCost } }));

        const styleMode = body.styleMode ?? "traffic";
        for await (const chunk of streamInsuranceContentAgent(messages, user.id, styleMode)) {
          content += chunk;
          controller.enqueue(encodeEvent({ type: "delta", content: chunk }));
        }

        if (!content.trim()) {
          const fallback = (await runInsuranceContentAgent(messages, user.id, styleMode)).trim();
          if (!fallback) {
            throw new Error("本次生成没有返回有效内容，请重试一次。");
          }
          content = fallback;
          controller.enqueue(encodeEvent({ type: "delta", content: fallback }));
        }
      } catch (error) {
        controller.enqueue(
          encodeEvent({ type: "error", content: error instanceof Error ? error.message : "文案生成失败" }),
        );
        controller.close();
        return;
      }

      if (!content.trim()) {
        controller.enqueue(encodeEvent({ type: "error", content: "本次生成没有返回有效内容，请稍后重试。" }));
        controller.close();
        return;
      }

      const assistantMessage: AgentMessage = { role: "assistant", content };

      await reportUsage({
        customerId: user.id,
        action: "write_script",
        amount: quota.quotaCost,
        metadata: {
          messageCount: messages.length,
          userEmail: user.email,
        },
      });
      await trySaveMessages({
        userId: user.id,
        conversationId,
        messages: [...messages.slice(-1), assistantMessage],
      });
      await trySaveUsageLog({
        userId: user.id,
        actionType: "write_script",
        quotaCost: quota.quotaCost,
        model: process.env.MODEL_NAME ?? "configured-model",
        metadata: {
          conversationId,
          meteringMode: getMeteringMode(),
          streamed: true,
          styleMode: body.styleMode ?? "traffic",
        },
      });

      controller.enqueue(encodeEvent({ type: "done" }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function inferConversationTitle(messages: AgentMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content;
  return firstUserMessage?.slice(0, 40) || "新的内容对话";
}

function sanitizeMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}
