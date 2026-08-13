import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { discoverWechatChannelWorks } from "@/lib/avatar/wechat-channel-tikhub";

const schema = z.object({
  channelId: z.string().trim().regex(/^sph[A-Za-z0-9_-]+$/, "请输入有效的视频号 ID"),
  limit: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100), z.literal("all")]).default("all"),
});

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "请求内容不完整" }, { status: 400 });
  try {
    return Response.json(await discoverWechatChannelWorks(parsed.data), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "获取视频号作品失败" }, { status: 502 });
  }
}
