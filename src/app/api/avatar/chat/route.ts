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
      "回答请使用以下固定小标题：\n【我的判断】\n【为什么这样判断】\n【下一步行动】。不要直接输出可发布的完整文案、脚本或标题；需要创作时，说明该用什么工具和要完成什么。",
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
        controller.enqueue(send("done", { nextSteps: nextStepsFor(mode), profilePrompt: memories.length < 5, proposalCreated: proposal }));
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

function nextStepsFor(mode: CoachMode) {
  const byMode: Record<CoachMode, Array<{ title: string; description: string; href: string }>> = {
    diagnose: [{ title: "把判断变成一条内容", description: "用多平台文案创作完成本周第一条验证内容。", href: "/apps/traffic-copy?from=create&entry=traffic-copy" }, { title: "做成连续栏目", description: "用小红书笔记创作建立可持续的同主题内容。", href: "/apps/xiaohongshu-studio?from=create&entry=xiaohongshu-studio" }],
    plan: [{ title: "先完成本周第一篇", description: "进入小红书笔记创作，将计划变成可发布内容。", href: "/apps/xiaohongshu-studio?from=create&entry=xiaohongshu-studio" }, { title: "写成深度文章", description: "用公众号文章创作沉淀一篇长期内容资产。", href: "/apps/wechat-studio?from=create&entry=wechat-studio" }],
    topic: [{ title: "围绕选题写成笔记", description: "进入小红书笔记创作，完成第一篇验证。", href: "/apps/xiaohongshu-studio?from=create&entry=xiaohongshu-studio" }, { title: "同步生成多平台版本", description: "用多平台文案创作适配口播、朋友圈和图文。", href: "/apps/traffic-copy?from=create&entry=traffic-copy" }],
    review: [{ title: "优化下一条口播", description: "进入口播稿润色，先修正开头和表达节奏。", href: "/apps/video-script-polish?from=create&entry=video-script-polish" }, { title: "重新完成图文版本", description: "用小红书笔记创作把复盘结论落成作品。", href: "/apps/xiaohongshu-studio?from=create&entry=xiaohongshu-studio" }],
    conversion: [{ title: "生成获客型内容", description: "用营销文案创作完成合规的内容承接。", href: "/apps/marketing-copy?from=create&entry=marketing-copy" }, { title: "设计直播承接话术", description: "进入直播话术工具，把咨询路径讲清楚。", href: "/apps/live-script?from=create&entry=live-script" }],
    profile: [{ title: "写一条验证内容", description: "用多平台文案创作检验新的定位和表达。", href: "/apps/traffic-copy?from=create&entry=traffic-copy" }, { title: "沉淀为长内容", description: "进入公众号文章创作，完整表达你的核心观点。", href: "/apps/wechat-studio?from=create&entry=wechat-studio" }],
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
