import { z } from "zod";
import { streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

const schema = z.object({ prompt: z.string().trim().min(5).max(3000), left: z.string().min(1), right: z.string().min(1) });
type Candidate = { id: string; label: string; prompt: string; userId: string | null };

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "请输入主题并选择两个对比对象" }, { status: 400 });
  if (parsed.data.left === parsed.data.right) return Response.json({ error: "请为左右两侧选择不同的对比对象" }, { status: 400 });
  try {
    const [left, right] = await Promise.all([resolveCandidate(parsed.data.left, user.id), resolveCandidate(parsed.data.right, user.id)]);
    if (!left || !right) return Response.json({ error: "选择的 Skill 不存在、尚未完成训练或不可用" }, { status: 400 });
    const encoder = new TextEncoder();
    const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    const task = async (side: "left" | "right", candidate: Candidate, controller: ReadableStreamDefaultController<Uint8Array>) => {
      const content = [`数字分身对比试写任务：${parsed.data.prompt}`, "输出一篇 500-700 字、可直接发布的完整保险内容，不要解释过程。必须严格使用 Markdown 结构：## 标题；### 核心判断（2-3句）；### 为什么（3个短段或列表）；### 怎么做（3条可执行建议）；### 评论互动（1句）。每段不超过 90 字；不要使用一整段长文，不要为了凑字数重复观点。可用 **重点句** 加粗关键判断；每个列表项必须独占一行。", candidate.prompt].filter(Boolean).join("\n\n");
      for await (const chunk of streamInsuranceContentAgent([{ role: "user", content }], candidate.userId, "general")) {
        for (const part of chunk.match(/.{1,24}/gu) ?? []) { send(controller, { type: "chunk", side, content: part }); await new Promise((resolve) => setTimeout(resolve, 18)); }
      }
      send(controller, { type: "done", side });
    };
    const stream = new ReadableStream<Uint8Array>({ async start(controller) {
      send(controller, { type: "start", left: left.label, right: right.label });
      try { await Promise.all([task("left", left, controller), task("right", right, controller)]); } catch (error) { send(controller, { type: "error", message: error instanceof Error ? error.message : "对比生成失败" }); } finally { controller.close(); }
    } });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "对比生成失败" }, { status: 503 }); }
}

async function resolveCandidate(value: string, userId: string): Promise<Candidate | null> {
  if (value === "avatar") return { id: value, label: "我的数字分身", prompt: "使用我的数字分身记忆与表达偏好。", userId };
  if (value === "baseline") return { id: value, label: "默认版本", prompt: "不使用任何个人记忆或创作 Skill，按小谷的通用保险内容顾问方式创作。", userId: null };
  const result = await query<{ id: string; name: string; version: number; skill_prompt: string }>(`select v.id, s.name, v.version, v.skill_prompt from avatar_creator_skill_versions v join avatar_creator_skills s on s.id=v.skill_id where v.id=$1 and v.user_id=$2 and v.status in ('active','restored') and s.status='active'`, [value, userId]);
  const skill = result.rows[0];
  return skill ? { id: skill.id, label: `${skill.name} · V${skill.version}`, prompt: `【选用创作 Skill：${skill.name} V${skill.version}】\n${skill.skill_prompt}\n仅借鉴可观察的创作方式，绝不复用原作者具体表述、经历或事实。`, userId } : null;
}
