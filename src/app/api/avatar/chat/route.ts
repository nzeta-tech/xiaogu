import { z } from "zod";
import { streamInsuranceContentAgent, type AgentMessage } from "@/lib/agent/insurance-agent";
import { requireSessionUser } from "@/lib/auth/session";
import {
  tryCreateConversation,
  tryGetConversationMessages,
  tryListConversations,
  trySaveMessages,
} from "@/lib/db/repositories";
import { query } from "@/lib/db/client";
import { tryListActiveAvatarMemories } from "@/lib/avatar/store";

const postSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(2).max(5000),
});

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");
  try {
    if (conversationId) {
      const conversation = await tryGetConversationMessages({ userId: user.id, conversationId });
      return Response.json({ conversation });
    }
    const conversations = await tryListConversations(user.id);
    return Response.json({ conversations: conversations.filter((item) => item.title.startsWith("分身咨询｜")) });
  } catch {
    return Response.json({ error: "咨询记录暂时无法加载" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "请输入想咨询的问题" }, { status: 400 });

  const { message } = parsed.data;
  const mode = inferMode(message);
  const encoder = new TextEncoder();
  const send = (event: string, payload: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const conversationId = await tryCreateConversation({
      userId: user.id,
      conversationId: parsed.data.conversationId,
      title: `分身咨询｜${message.slice(0, 22)}`,
        });
        if (!conversationId) throw new Error("无法创建咨询记录");
        controller.enqueue(send("meta", { conversationId }));
        const existing = await tryGetConversationMessages({ userId: user.id, conversationId });
        const history: AgentMessage[] = (existing?.messages ?? [])
      .filter((item): item is typeof item & { role: "user" | "assistant" } => item.role === "user" || item.role === "assistant")
      .slice(-10)
          .map((item) => ({ role: item.role, content: item.content }));
        const coachingPrompt = [
      `这是数字分身咨询台，当前咨询类型：${modeLabel(mode)}。`,
      "你是小谷精灵，一位面向保险创作者的专业创作与增长教练。你已获得用户数字分身的授权上下文。",
      "先给出清晰判断，再解释依据，然后只推荐最优先的 1-3 个可执行动作。不要虚构数据、客户或效果；不能承诺获客、成交、收益或理赔。",
      "回答请使用以下固定小标题：\n【我的判断】\n【为什么这样判断】\n【下一步行动】\n【你可以直接做】。",
      "当信息不足时，明确指出缺什么，并给一个最短的补充问题；不要假设用户已有未提供的数据。",
      `用户本次问题：${message}`,
        ].join("\n\n");
        let assistant = "";
        for await (const chunk of streamInsuranceContentAgent([...history, { role: "user", content: coachingPrompt }], user.id, "general")) {
          assistant += chunk;
          controller.enqueue(send("delta", { content: chunk }));
        }
        await trySaveMessages({ userId: user.id, conversationId, messages: [{ role: "user", content: message }, { role: "assistant", content: assistant }] });
        const proposal = await createExplicitMemoryProposal(user.id, message);
        const memories = await tryListActiveAvatarMemories(user.id, 6);
        controller.enqueue(send("done", { followups: followupsFor(mode), profilePrompt: memories.length < 5, proposalCreated: proposal }));
      } catch (error) {
        controller.enqueue(send("error", { error: error instanceof Error ? error.message : "小谷暂时无法回答，请稍后重试" }));
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}

type CoachMode = "diagnose" | "plan" | "topic" | "review" | "conversion" | "profile";

function modeLabel(mode: CoachMode) {
  return ({ diagnose: "增长诊断", plan: "本周计划", topic: "选题策划", review: "作品复盘", conversion: "获客承接", profile: "更新分身" })[mode];
}

function followupsFor(mode: CoachMode) {
  const byMode: Record<CoachMode, string[]> = {
    diagnose: ["把这周的内容目标拆成 3 个动作", "帮我找一个最值得连续做的内容栏目", "我应该先优化开头还是评论区承接？"],
    plan: ["把这周计划排成每天能执行的清单", "先帮我写第一条内容", "按我的时间安排缩减为 2 条重点内容"],
    topic: ["从这 6 个选题里选一个最容易带来咨询的", "把第一个选题写成口播稿", "为这组选题设计统一栏目名和封面"],
    review: ["根据这次复盘，帮我改下一条的开头", "把有效部分沉淀成固定内容模板", "我还需要补哪些数据才能判断问题？"],
    conversion: ["帮我写一条自然的评论区承接", "设计私信里的第一轮筛选问题", "把这套承接方式变成一周内容计划"],
    profile: ["根据我的目标客户重做内容定位", "帮我明确以后不想使用的表达方式", "把今天的结论变成一条长期创作原则"],
  };
  return byMode[mode];
}

function inferMode(message: string): CoachMode {
  if (/(记住|长期|分身|人设|定位|不要再|以后)/.test(message)) return "profile";
  if (/(复盘|这篇|这条|改稿|数据|阅读|点赞|收藏|播放)/.test(message)) return "review";
  if (/(私信|咨询|获客|留资|成交|转化|承接)/.test(message)) return "conversion";
  if (/(选题|主题|写什么|灵感|内容方向)/.test(message)) return "topic";
  if (/(计划|本周|下周|安排|日历)/.test(message)) return "plan";
  return "diagnose";
}

async function createExplicitMemoryProposal(userId: string, content: string) {
  const explicit = /(?:以后|长期|记住|别再|不要|我想重点|我的客户|我的风格)/.test(content);
  if (!explicit) return false;
  const category = /客户|人群|家庭|企业主|宝妈/.test(content) ? "audience" : /不要|别再|边界|焦虑/.test(content) ? "boundary" : "expression";
  const title = category === "audience" ? "客户定位偏好" : category === "boundary" ? "内容表达边界" : "长期表达偏好";
  const existing = await query<{ id: string }>(
    `select id from avatar_evolution_proposals where user_id = $1 and status = 'pending' and patch_json->>'content' = $2 limit 1`,
    [userId, content],
  );
  if (existing.rows[0]) return false;
  await query(
    `insert into avatar_evolution_proposals(user_id, category, title, description, confidence, evidence_json, patch_json)
     values ($1, $2, $3, $4, 82, $5::jsonb, $6::jsonb)`,
    [userId, category, title, "你在咨询中明确提出了这项长期偏好。确认后，小谷会在后续相关创作中参考它。", JSON.stringify([`你的原话：${content}`]), JSON.stringify({ title, content })],
  );
  return true;
}
