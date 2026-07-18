import { query } from "@/lib/db/client";
import { sendSystemEmail, systemUrl } from "@/lib/email/mailer";
import { tryGetSystemSettings } from "@/lib/db/repositories";

export async function maybeSendLowBalanceNotification(userId: string) {
  const settings = await tryGetSystemSettings();
  if (!settings.payment.lowBalanceNotifyEnabled || !settings.email.enabled) return false;

  const result = await query<{ email: string; name: string; balance: string }>(
    `with grants as (
       select coalesce(sum(quota_amount),0) total from orders where user_id=$1 and status='paid'
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

function render(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(name|balance|threshold|url)\}\}/g, (_match, key: string) => values[key] ?? "");
}
