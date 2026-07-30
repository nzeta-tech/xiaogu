import { query } from "@/lib/db/client";
import { sendSystemEmail, systemUrl } from "@/lib/email/mailer";
import { tryClaimCreditChangeEmails, tryFinishCreditChangeEmail, tryGetSystemSettings, tryPersistCreditChangeEmailContent, tryQueueCreditChangeEmail } from "@/lib/db/repositories";

export async function maybeSendLowBalanceNotification(userId: string) {
  const settings = await tryGetSystemSettings();
  if (!settings.payment.lowBalanceNotifyEnabled || !settings.email.enabled) return false;

  const result = await query<{ email: string; name: string; balance: string }>(
    `with grants as (
       select coalesce(sum(quota_amount),0) total from orders where user_id=$1 and status in ('paid', 'completed')
     ), gifts as (
       select coalesce(sum(quota_amount),0) total from gift_records where user_id=$1 and status='granted'
     ), usage as (
       select coalesce(sum(quota_cost),0) total from usage_logs where user_id=$1
     )
     select u.email,u.name,greatest((select total from grants)+(select total from gifts)-(select total from usage),0)::text balance
     from users u where u.id=$1 and u.status='active'`,
    [userId],
  );
  const user = result.rows[0];
  const balance = Number(user?.balance ?? 0);
  if (!user || balance > settings.payment.lowBalanceThreshold) return false;

  const claimed = await query<{ user_id: string }>(
    `insert into credit_notification_state(user_id,last_low_balance_at,last_notified_balance,updated_at)
     values ($1,now(),$2,now())
     on conflict(user_id) do update set last_low_balance_at=now(),last_notified_balance=$2,updated_at=now()
     where credit_notification_state.last_low_balance_at is null
        or credit_notification_state.last_low_balance_at < now()-($3::int*interval '1 hour')
     returning user_id`,
    [userId, balance, settings.payment.lowBalanceCooldownHours],
  );
  if (!claimed.rows[0]) return false;

  const values = { name: user.name, balance: String(balance), threshold: String(settings.payment.lowBalanceThreshold), url: systemUrl("/billing") };
  await sendSystemEmail({
    to: user.email,
    subject: render(settings.email.lowBalanceSubject, values),
    text: render(settings.email.lowBalanceBody, values),
  });
  return true;
}

export async function dispatchCreditChangeEmails(limit = 20) {
  const settings = await tryGetSystemSettings();
  if (!settings.email.enabled) return { sent: 0, failed: 0, skipped: true };

  const messages = await tryClaimCreditChangeEmails(limit);
  let sent = 0;
  let failed = 0;
  for (const message of messages) {
    const email = renderCreditChangeEmail(settings, message);
    try {
      await tryPersistCreditChangeEmailContent({ id: message.id, subject: email.subject, body: email.text });
      await sendSystemEmail({
        to: message.email,
        subject: email.subject,
        text: email.text,
      });
      await tryFinishCreditChangeEmail({ id: message.id });
      sent += 1;
    } catch (error) {
      await tryFinishCreditChangeEmail({ id: message.id, error: error instanceof Error ? error.message : "email delivery failed" });
      failed += 1;
    }
  }
  return { sent, failed, skipped: false };
}

export async function previewCreditChangeEmail(input: {
  name: string;
  orderId?: string | null;
  changeLabel: string;
  deltaCredits: number;
  balanceAfter: number;
  subjectOverride?: string;
  bodyOverride?: string;
}) {
  const settings = await tryGetSystemSettings();
  return renderCreditChangeEmail(settings, input);
}

export async function queueCreditChangeEmail(input: {
  eventKey: string;
  userId: string;
  deltaCredits: number;
  changeKind: string;
  changeLabel: string;
  orderId?: string | null;
  subjectOverride?: string;
  bodyOverride?: string;
}) {
  const event = await tryQueueCreditChangeEmail(input);
  if (event) void dispatchCreditChangeEmails().catch(() => undefined);
  return event;
}

export async function queuePaymentTimeoutEmail(input: { eventKey: string; userId: string; orderId: string }) {
  return queueCreditChangeEmail({
    ...input,
    deltaCredits: 0,
    changeKind: "payment_timeout",
    changeLabel: "支付订单已超时关闭",
    subjectOverride: "小谷：支付订单已超时关闭",
    bodyOverride: "{{name}}，你好。订单 {{orderId}} 未在规定时间内完成支付，已自动关闭，未扣款也未发放积分。如仍需购买，请前往账单页重新发起充值：{{url}}",
  });
}

function render(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(name|balance|threshold|url|delta|changeLabel|orderId)\}\}/g, (_match, key: string) => values[key] ?? "");
}

function renderCreditChangeEmail(settings: Awaited<ReturnType<typeof tryGetSystemSettings>>, input: {
  name: string;
  order_id?: string | null;
  orderId?: string | null;
  change_label?: string;
  changeLabel?: string;
  delta_credits?: number;
  deltaCredits?: number;
  balance_after?: number;
  balanceAfter?: number;
  subject_override?: string;
  subjectOverride?: string;
  body_override?: string;
  bodyOverride?: string;
}) {
  const deltaCredits = input.delta_credits ?? input.deltaCredits ?? 0;
  const values = {
    name: input.name,
    delta: `${deltaCredits > 0 ? "+" : ""}${deltaCredits}`,
    balance: String(input.balance_after ?? input.balanceAfter ?? 0),
    changeLabel: input.change_label ?? input.changeLabel ?? "积分变动",
    orderId: input.order_id ?? input.orderId ?? "-",
    url: systemUrl("/billing"),
  };
  return {
    subject: render(input.subject_override || input.subjectOverride || settings.email.creditChangeSubject, values),
    text: render(input.body_override || input.bodyOverride || settings.email.creditChangeBody, values),
  };
}
