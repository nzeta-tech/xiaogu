import { query } from "@/lib/db/client";
import { sendSystemEmail, systemUrl } from "@/lib/email/mailer";

export type AffiliateNotification = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export async function createAffiliateNotification(input: {
  userId: string;
  type: string;
  eventKey: string;
  title: string;
  body: string;
}) {
  const result = await query<{ id: string; email: string }>(
    `with inserted as (
       insert into affiliate_notifications(user_id, notification_type, event_key, title, body)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id, event_key) do nothing
       returning id
     )
     select inserted.id, u.email from inserted join users u on u.id = $1`,
    [input.userId, input.type, input.eventKey, input.title, input.body],
  );
  const row = result.rows[0];
  if (row?.email) {
    void sendSystemEmail({
      to: row.email,
      subject: `小谷 · ${input.title}`,
      text: `${input.body}\n\n查看邀请有礼：${systemUrl("/rewards#invite")}`,
    }).catch(() => undefined);
  }
  return Boolean(row);
}

export async function listAffiliateNotifications(userId: string) {
  const result = await query<AffiliateNotification>(
    `select id, notification_type, title, body, read_at, created_at
     from affiliate_notifications where user_id = $1
     order by created_at desc limit 50`,
    [userId],
  );
  return result.rows;
}

export async function markAffiliateNotificationsRead(userId: string) {
  await query("update affiliate_notifications set read_at = coalesce(read_at, now()) where user_id = $1 and read_at is null", [userId]);
}
