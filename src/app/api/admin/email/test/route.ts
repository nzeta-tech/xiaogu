import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { sendSystemEmail, testEmailConnection } from "@/lib/email/mailer";
import { maybeSendLowBalanceNotification } from "@/lib/billing/notifications";

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权测试邮件" }, { status: 403 });
  const parsed = z.object({ recipient: z.string().trim().email().optional(), kind: z.enum(["smtp", "low_balance"]).default("smtp"), userId: z.string().uuid().optional() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "收件邮箱格式不正确" }, { status: 400 });
  try {
    if (parsed.data.kind === "low_balance") {
      if (!parsed.data.userId) return Response.json({ error: "缺少余额提醒测试用户" }, { status: 400 });
      const sent = await maybeSendLowBalanceNotification(parsed.data.userId);
      return sent ? Response.json({ ok: true, sent: true }) : Response.json({ error: "当前用户未达到提醒条件或仍在冷却期" }, { status: 409 });
    }
    if (parsed.data.recipient) await sendSystemEmail({ to: parsed.data.recipient, subject: "小谷 SMTP 测试", text: "邮件服务配置正常。" });
    else await testEmailConnection();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "邮件测试失败" }, { status: 502 });
  }
}
