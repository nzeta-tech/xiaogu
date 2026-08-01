import { requireSessionUser } from "@/lib/auth/session";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  const connected = Boolean(process.env.WECHAT_OFFICIAL_APP_ID?.trim() && process.env.WECHAT_OFFICIAL_APP_SECRET?.trim());
  return Response.json({
    connected,
    accountName: connected ? process.env.WECHAT_OFFICIAL_ACCOUNT_NAME?.trim() || "已连接公众号" : undefined,
  });
}
