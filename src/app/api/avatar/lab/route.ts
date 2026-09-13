import { z } from "zod";
import { streamInsuranceContentAgent } from "@/lib/agent/insurance-agent";
import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

const schema = z.object({ prompt: z.string().trim().min(5).max(3000), candidates: z.array(z.string().min(1)).min(2).max(3), skillScope: z.enum(["personal", "platform"]).default("personal") });
type Candidate = { id: string; label: string; prompt: string; userId: string | null };

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "请输入主题并选择 2-3 个对比版本" }, { status: 400 });
  if (new Set(parsed.data.candidates).size !== parsed.data.candidates.length) return Response.json({ error: "不能重复选择同一个版本" }, { status: 400 });
  try {
    if (parsed.data.skillScope === "platform" && user.role !== "admin") return Response.json({ error: "仅管理员可验收平台分身" }, { status: 403 });
    const candidates = await Promise.all(parsed.data.candidates.map((id) => resolveCandidate(id, user.id, parsed.data.skillScope)));
    if (candidates.some((item) => !item)) return Response.json({ error: "选择的 Skill 不存在、尚未完成训练或不可用" }, { status: 400 });
    const encoder = new TextEncoder();
    const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    const task = async (index: number, candidate: Candidate, controller: ReadableStreamDefaultController<Uint8Array>) => {
      const content = [`数字分身对比试写任务：${parsed.data.prompt}`, "输出一篇 500-700 字、可直接发布的完整保险内容，不要解释过程。必须严格使用 Markdown 结构：## 标题；### 核心判断（2-3句）；### 为什么（3个短段或列表）；### 怎么做（3条可执行建议）；### 评论互动（1句）。每段不超过 90 字；不要使用一整段长文，不要为了凑字数重复观点。可用 **重点句** 加粗关键判断；每个列表项必须独占一行。", candidate.prompt].filter(Boolean).join("\n\n");
      for await (const chunk of streamInsuranceContentAgent([{ role: "user", content }], candidate.userId, "general")) {
        for (const part of chunk.match(/.{1,24}/gu) ?? []) { send(controller, { type: "chunk", index, content: part }); await new Promise((resolve) => setTimeout(resolve, 18)); }
      }
      send(controller, { type: "done", index });
    };
    const stream = new ReadableStream<Uint8Array>({ async start(controller) {
      const resolved = candidates as Candidate[];
      send(controller, { type: "start", labels: resolved.map((item) => item.label) });
      try { await Promise.all(resolved.map((candidate, index) => task(index, candidate, controller))); } catch (error) { send(controller, { type: "error", message: error instanceof Error ? error.message : "对比生成失败" }); } finally { controller.close(); }
    } });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "对比生成失败" }, { status: 503 }); }
}

async function resolveCandidate(value: string, userId: string, skillScope: "personal" | "platform"): Promise<Candidate | null> {
  if (value === "avatar") return { id: value, label: "我的数字分身", prompt: "使用我的数字分身记忆与表达偏好。", userId };
  if (value === "baseline") return { id: value, label: "默认版本", prompt: "不使用任何个人记忆或创作 Skill，按小谷的通用保险内容顾问方式创作。", userId: null };
  const result = await query<{ id: string; name: string; version: number; skill_prompt: string }>(
    `select v.id, s.name, v.version, v.skill_prompt
     from avatar_creator_skill_versions v join avatar_creator_skills s on s.id=v.skill_id
     where v.id=$1 and v.user_id=$2 and v.status in ('active','restored') and s.skill_scope=$3`,
    [value, userId, skillScope],
  );
  const skill = result.rows[0];
  return skill ? { id: skill.id, label: `${skill.name} · V${skill.version}`, prompt: `【选用创作 Skill：${skill.name} V${skill.version}】\n${skill.skill_prompt}\n仅借鉴可观察的创作方式，绝不复用原作者具体表述、经历或事实。`, userId } : null;
}
