import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { discoverWechatChannelWorks } from "@/lib/avatar/wechat-channel-tikhub";
import { associateWechatChannelAccountCache } from "@/lib/avatar/wechat-channel-discovery-cache";

const schema = z.object({
  channelId: z.string().trim().regex(/^sph[A-Za-z0-9_-]+$/, "请输入有效的视频号 ID"),
  previousChannelId: z.string().trim().regex(/^sph[A-Za-z0-9_-]+$/, "旧视频号 ID 格式不正确").optional(),
  limit: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100), z.literal("all")]).default("all"),
});

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "请求内容不完整" }, { status: 400 });
  try {
    if (parsed.data.previousChannelId && parsed.data.previousChannelId !== parsed.data.channelId) {
      if (user.role !== "admin") return Response.json({ error: "仅管理员可关联视频号 ID" }, { status: 403 });
      await associateWechatChannelAccountCache({ fromChannelId: parsed.data.previousChannelId, toChannelId: parsed.data.channelId });
    }
    return Response.json(await discoverWechatChannelWorks(parsed.data), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "获取视频号作品失败" }, { status: 502 });
  }
}
