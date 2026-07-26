import { getPool, query } from "@/lib/db/client";
import { tryGetSystemSettings } from "@/lib/db/repositories";
import { createHash } from "node:crypto";
import { createAffiliateNotification } from "@/lib/affiliate/notifications";

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function ensureAffiliateAccount(userId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = createReferralCode();
    try {
      const result = await query<AffiliateAccount>(
        `insert into affiliate_accounts(user_id, referral_code)
         values ($1, $2)
         on conflict (user_id) do update set updated_at = affiliate_accounts.updated_at
         returning user_id, referral_code, inviter_id, invited_at, available_credits, frozen_credits, lifetime_credits, created_at`,
        [userId, referralCode],
      );
      return result.rows[0];
    } catch (error) {
      if (!String(error).includes("duplicate key")) throw error;
    }
  }
  throw new Error("无法生成唯一邀请返利码");
}

export async function bindAffiliateInviter(userId: string, referralCode: string) {
  const normalized = normalizeReferralCode(referralCode);
  if (!normalized) return { ok: false as const, error: "返利邀请码格式不正确" };
  const account = await ensureAffiliateAccount(userId);
  if (account.inviter_id) return { ok: false as const, error: "已经绑定过邀请人" };

  const inviter = await query<{ user_id: string }>(
    "select user_id from affiliate_accounts where referral_code = $1",
    [normalized],
  );
  if (!inviter.rows[0]) return { ok: false as const, error: "返利邀请码不存在" };
  if (inviter.rows[0].user_id === userId) return { ok: false as const, error: "不能绑定自己的邀请码" };

  const updated = await query<{ inviter_id: string }>(
    `update affiliate_accounts
     set inviter_id = $2, invited_at = now(), updated_at = now()
     where user_id = $1 and inviter_id is null
     returning inviter_id`,
    [userId, inviter.rows[0].user_id],
  );
  if (updated.rows[0]) {
    await createAffiliateNotification({ userId: updated.rows[0].inviter_id, type: "referral_registered", eventKey: `referral:${userId}`, title: "好友已通过你的邀请注册", body: "你的好友已完成注册；对方充值后，你将按活动规则获得积分返利。" });
    return { ok: true as const, inviterId: updated.rows[0].inviter_id };
  }
  return { ok: false as const, error: "已经绑定过邀请人" };
}

export async function recordAffiliateRegistrationContext(userId: string, clientKey: string) {
  const ipHash = clientKey && clientKey !== "unknown" ? createHash("sha256").update(clientKey).digest("hex") : null;
  if (!ipHash) return { flagged: false };
  const result = await query<{ inviter_id: string | null }>("select inviter_id from affiliate_accounts where user_id = $1", [userId]);
  const inviterId = result.rows[0]?.inviter_id;
  const inviter = inviterId
    ? await query<{ registration_ip_hash: string | null }>("select registration_ip_hash from affiliate_accounts where user_id = $1", [inviterId])
    : { rows: [] as Array<{ registration_ip_hash: string | null }> };
  const sameSource = Boolean(inviter.rows[0]?.registration_ip_hash && inviter.rows[0].registration_ip_hash === ipHash);
  await query(
    `update affiliate_accounts
     set registration_ip_hash = $2,
         risk_status = case when $3 then 'review' else risk_status end,
         risk_reason = case when $3 then '邀请人与受邀人注册来源一致' else risk_reason end,
         updated_at = now()
     where user_id = $1`,
    [userId, ipHash, sameSource],
  );
  return { flagged: sameSource };
}

export async function validateAffiliateReferralCode(referralCode: string) {
  const normalized = normalizeReferralCode(referralCode);
  if (!normalized) return { ok: false as const, error: "返利邀请码格式不正确" };
  const result = await query<{ user_id: string }>("select user_id from affiliate_accounts where referral_code = $1", [normalized]);
  return result.rows[0]
    ? { ok: true as const, inviterId: result.rows[0].user_id }
    : { ok: false as const, error: "返利邀请码不存在" };
}

export async function recordAffiliateVisit(referralCode: string, userAgent = "") {
  const normalized = normalizeReferralCode(referralCode);
  if (!normalized) return false;
  const result = await query<{ user_id: string }>("select user_id from affiliate_accounts where referral_code = $1", [normalized]);
  if (!result.rows[0]) return false;
  await query("insert into affiliate_visits(referral_code, user_agent) values ($1, $2)", [normalized, userAgent.slice(0, 500)]);
  return true;
}

export async function getAffiliateDetail(userId: string) {
  await thawAffiliateCredits(userId);
  const account = await ensureAffiliateAccount(userId);
  const settings = (await tryGetSystemSettings()).affiliate;
  const [inviter, invitees, inviteeCount, ledger] = await Promise.all([
    account.inviter_id
      ? query<{ name: string; email: string }>("select name, email from users where id = $1", [account.inviter_id])
      : Promise.resolve({ rows: [] as Array<{ name: string; email: string }> }),
    query<{ id: string; name: string; email: string; created_at: string; rebate_credits: string }>(
      `select u.id, u.name, u.email, aa.created_at,
              coalesce(sum(case when al.action = 'accrue' then al.credits when al.action = 'reverse' then -al.credits else 0 end), 0)::text as rebate_credits
       from affiliate_accounts aa
       join users u on u.id = aa.user_id
       left join affiliate_ledger al on al.source_user_id = u.id and al.user_id = $1
       where aa.inviter_id = $1
       group by u.id, aa.created_at
       order by aa.created_at desc
       limit 100`,
      [userId],
    ),
    query<{ count: string }>("select count(*)::text as count from affiliate_accounts where inviter_id = $1", [userId]),
    query<AffiliateLedgerRow>(
      `select al.id, al.action, al.credits, al.frozen_until, al.created_at,
              source.email as source_email, al.source_order_id
       from affiliate_ledger al
       left join users source on source.id = al.source_user_id
       where al.user_id = $1
       order by al.created_at desc
       limit 100`,
      [userId],
    ),
  ]);
  return {
    enabled: settings.enabled,
    settings,
    account,
    inviter: inviter.rows[0] ?? null,
    inviteeCount: Number(inviteeCount.rows[0]?.count ?? 0),
    invitees: invitees.rows.map((item) => ({ ...item, rebate_credits: Number(item.rebate_credits) })),
    ledger: ledger.rows,
  };
}

export async function accrueAffiliateCredits(input: { orderId: string; inviteeUserId: string; purchasedCredits: number }) {
  const settings = (await tryGetSystemSettings()).affiliate;
  if (!settings.enabled || input.purchasedCredits <= 0) return { applied: false, credits: 0 };
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const invitee = await client.query<{ inviter_id: string | null; created_at: string; custom_rebate_rate_percent: string | null; risk_status: string }>(
      `select invitee.inviter_id, invitee.created_at, invitee.risk_status, inviter.custom_rebate_rate_percent
       from affiliate_accounts invitee
       left join affiliate_accounts inviter on inviter.user_id=invitee.inviter_id
       where invitee.user_id = $1 for update of invitee`,
      [input.inviteeUserId],
    );
    const relation = invitee.rows[0];
    if (!relation?.inviter_id) {
      await client.query("rollback");
      return { applied: false, credits: 0 };
    }
    if (relation.risk_status !== "clear") {
      await client.query("rollback");
      return { applied: false, credits: 0, reviewRequired: true };
    }
    if (settings.durationDays > 0 && Date.now() > new Date(relation.created_at).getTime() + settings.durationDays * 86_400_000) {
      await client.query("rollback");
      return { applied: false, credits: 0 };
    }
    const existing = await client.query("select 1 from affiliate_ledger where source_order_id = $1 and action = 'accrue'", [input.orderId]);
    if (existing.rows[0]) {
      await client.query("rollback");
      return { applied: false, credits: 0 };
    }
    const effectiveRate = relation.custom_rebate_rate_percent === null ? settings.rebateRatePercent : Number(relation.custom_rebate_rate_percent);
    let credits = Math.max(0, Math.round(input.purchasedCredits * effectiveRate / 100));
    if (settings.perInviteeCap > 0) {
      const accrued = await client.query<{ total: string }>(
        `select coalesce(sum(credits), 0)::text as total from affiliate_ledger
         where user_id = $1 and source_user_id = $2 and action = 'accrue'`,
        [relation.inviter_id, input.inviteeUserId],
      );
      credits = Math.min(credits, Math.max(0, settings.perInviteeCap - Number(accrued.rows[0]?.total ?? 0)));
    }
    if (credits <= 0) {
      await client.query("rollback");
      return { applied: false, credits: 0 };
    }
    const frozen = settings.freezeHours > 0;
    await client.query(
      `update affiliate_accounts set
         available_credits = available_credits + $2,
         frozen_credits = frozen_credits + $3,
         lifetime_credits = lifetime_credits + $4,
         updated_at = now()
       where user_id = $1`,
      [relation.inviter_id, frozen ? 0 : credits, frozen ? credits : 0, credits],
    );
    await client.query(
      `insert into affiliate_ledger(user_id, action, credits, source_user_id, source_order_id, frozen_until, metadata)
       values ($1, 'accrue', $2, $3, $4, case when $5 > 0 then now() + ($5 || ' hours')::interval else null end, $6::jsonb)`,
      [relation.inviter_id, credits, input.inviteeUserId, input.orderId, settings.freezeHours, JSON.stringify({ purchasedCredits: input.purchasedCredits, rebateRatePercent: effectiveRate })],
    );
    await client.query("commit");
    await createAffiliateNotification({ userId: relation.inviter_id, type: "rebate_accrued", eventKey: `accrue:${input.orderId}`, title: "好友充值，返利已到账", body: `你的好友充值已完成，本次计提 ${credits} 点返利。${frozen ? `返利将在 ${settings.freezeHours} 小时后解冻。` : "返利已可转入积分。"}` });
    return { applied: true, credits, inviterId: relation.inviter_id };
  } catch (error) {
    await client.query("rollback");
    if (String(error).includes("idx_affiliate_ledger_order_accrue")) return { applied: false, credits: 0 };
    throw error;
  } finally {
    client.release();
  }
}

export async function transferAffiliateCredits(userId: string) {
  await thawAffiliateCredits(userId);
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const account = await client.query<{ available_credits: number }>(
      "select available_credits from affiliate_accounts where user_id = $1 for update",
      [userId],
    );
    const credits = account.rows[0]?.available_credits ?? 0;
    if (credits <= 0) {
      await client.query("rollback");
      return { ok: false as const, error: "暂无可转入积分" };
    }
    const ledger = await client.query<{ id: string }>(
      `insert into affiliate_ledger(user_id, action, credits, metadata)
       values ($1, 'transfer', $2, '{}'::jsonb) returning id`,
      [userId, credits],
    );
    await client.query("update affiliate_accounts set available_credits = 0, updated_at = now() where user_id = $1", [userId]);
    await client.query(
      `insert into gift_records(user_id, source_type, source_label, quota_amount, status, metadata)
       values ($1, 'affiliate', '邀请返利转入', $2, 'granted', $3::jsonb)`,
      [userId, credits, JSON.stringify({ affiliateLedgerId: ledger.rows[0].id })],
    );
    await client.query("commit");
    return { ok: true as const, credits };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function reverseAffiliateCredits(orderId: string) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const accrued = await client.query<{ user_id: string; source_user_id: string | null; credits: number; frozen_until: string | null }>(
      `select user_id, source_user_id, credits, frozen_until from affiliate_ledger
       where source_order_id = $1 and action = 'accrue' for update`,
      [orderId],
    );
    const row = accrued.rows[0];
    if (!row || (await client.query("select 1 from affiliate_ledger where source_order_id = $1 and action = 'reverse'", [orderId])).rows[0]) {
      await client.query("rollback");
      return { reversed: false, credits: 0 };
    }
    // Normalize expired frozen accruals before calculating the reversal. Otherwise a
    // refund that arrives after the freeze window can leave frozen_credits behind,
    // allowing the revoked rebate to be thawed back into the balance later.
    const expired = await client.query<{ credits: number }>(
      `update affiliate_ledger
       set frozen_until = null
       where user_id = $1 and action = 'accrue' and frozen_until <= now()
       returning credits`,
      [row.user_id],
    );
    const expiredCredits = expired.rows.reduce((sum, item) => sum + Number(item.credits), 0);
    if (expiredCredits > 0) {
      await client.query(
        `update affiliate_accounts
         set frozen_credits = greatest(frozen_credits - $2, 0),
             available_credits = available_credits + $2,
             updated_at = now()
         where user_id = $1`,
        [row.user_id, expiredCredits],
      );
    }
    const account = await client.query<{ available_credits: number; frozen_credits: number }>(
      "select available_credits, frozen_credits from affiliate_accounts where user_id = $1 for update",
      [row.user_id],
    );
    const current = account.rows[0];
    const isFrozen = row.frozen_until && new Date(row.frozen_until).getTime() > Date.now();
    const fromFrozen = isFrozen ? Math.min(current.frozen_credits, row.credits) : 0;
    const fromAvailable = Math.min(current.available_credits, row.credits - fromFrozen);
    const transferredShortfall = row.credits - fromFrozen - fromAvailable;
    await client.query(
      `update affiliate_accounts set frozen_credits = frozen_credits - $2,
         available_credits = available_credits - $3, updated_at = now() where user_id = $1`,
      [row.user_id, fromFrozen, fromAvailable],
    );
    if (transferredShortfall > 0) {
      await client.query(
        `insert into gift_records(user_id, source_type, source_label, quota_amount, status, metadata)
         values ($1, 'affiliate_reversal', '邀请订单退款冲回', $2, 'granted', $3::jsonb)`,
        [row.user_id, -transferredShortfall, JSON.stringify({ orderId })],
      );
    }
    await client.query(
      `insert into affiliate_ledger(user_id, action, credits, source_user_id, source_order_id, metadata)
       values ($1, 'reverse', $2, $3, $4, $5::jsonb)`,
      [row.user_id, row.credits, row.source_user_id, orderId, JSON.stringify({ fromFrozen, fromAvailable, transferredShortfall })],
    );
    await client.query("commit");
    await createAffiliateNotification({ userId: row.user_id, type: "rebate_reversed", eventKey: `reverse:${orderId}`, title: "返利已冲回", body: `关联订单退款，本次返利已冲回 ${row.credits} 点。` });
    return { reversed: true, credits: row.credits };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminAffiliateRecords() {
  const result = await query<AdminAffiliateRecord>(
    `select aa.user_id as invitee_id, invitee.email as invitee_email, aa.inviter_id,
            inviter.email as inviter_email, inviter_aff.referral_code, inviter_aff.custom_rebate_rate_percent, aa.created_at,
            aa.risk_status, aa.risk_reason,
            coalesce(sum(case when al.action = 'accrue' then al.credits when al.action = 'reverse' then -al.credits else 0 end), 0)::text as accrued_credits
     from affiliate_accounts aa
     join users invitee on invitee.id = aa.user_id
     join users inviter on inviter.id = aa.inviter_id
     join affiliate_accounts inviter_aff on inviter_aff.user_id = aa.inviter_id
     left join affiliate_ledger al on al.user_id = aa.inviter_id and al.source_user_id = aa.user_id
     where aa.inviter_id is not null
     group by aa.user_id, invitee.email, aa.inviter_id, inviter.email, inviter_aff.referral_code, inviter_aff.custom_rebate_rate_percent, aa.created_at, aa.risk_status, aa.risk_reason
     order by aa.created_at desc limit 300`,
  );
  return result.rows.map((row) => ({ ...row, custom_rebate_rate_percent: row.custom_rebate_rate_percent === null ? null : Number(row.custom_rebate_rate_percent), accrued_credits: Number(row.accrued_credits) }));
}

export async function updateAffiliateCustomRate(userId: string, rate: number | null) {
  await ensureAffiliateAccount(userId);
  const result = await query<{ user_id: string; custom_rebate_rate_percent: string | null }>(
    `update affiliate_accounts set custom_rebate_rate_percent=$2,updated_at=now()
     where user_id=$1 returning user_id,custom_rebate_rate_percent`,
    [userId, rate],
  );
  return result.rows[0] ? { userId: result.rows[0].user_id, rate: result.rows[0].custom_rebate_rate_percent === null ? null : Number(result.rows[0].custom_rebate_rate_percent) } : null;
}

export async function updateAffiliateRisk(userId: string, status: "clear" | "review" | "blocked", reason = "") {
  const result = await query<{ user_id: string; risk_status: string; risk_reason: string }>(
    `update affiliate_accounts set risk_status = $2, risk_reason = $3, updated_at = now()
     where user_id = $1 returning user_id, risk_status, risk_reason`,
    [userId, status, reason],
  );
  return result.rows[0] ?? null;
}

export async function listAdminAffiliateLedger() {
  const result = await query<{
    id: string; action: string; credits: number; created_at: string; source_order_id: string | null;
    user_email: string; source_email: string | null;
  }>(
    `select al.id, al.action, al.credits, al.created_at, al.source_order_id,
            owner.email as user_email, source.email as source_email
     from affiliate_ledger al
     join users owner on owner.id = al.user_id
     left join users source on source.id = al.source_user_id
     order by al.created_at desc limit 300`,
  );
  return result.rows;
}

export async function getAdminAffiliateStats() {
  const result = await query<{ visits: string; invitees: string; payers: string; accrued_credits: string }>(
    `select
       (select count(*) from affiliate_visits) as visits,
       (select count(*) from affiliate_accounts where inviter_id is not null) as invitees,
       (select count(distinct source_user_id) from affiliate_ledger where action = 'accrue') as payers,
       (select coalesce(sum(case when action = 'accrue' then credits when action = 'reverse' then -credits else 0 end), 0) from affiliate_ledger) as accrued_credits`,
  );
  const row = result.rows[0];
  return { visits: Number(row?.visits ?? 0), invitees: Number(row?.invitees ?? 0), payers: Number(row?.payers ?? 0), accruedCredits: Number(row?.accrued_credits ?? 0) };
}

async function thawAffiliateCredits(userId: string) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const matured = await client.query<{ id: string; credits: number }>(
      `with thawed as (
         update affiliate_ledger set frozen_until = null
         where user_id = $1 and action = 'accrue' and frozen_until <= now()
         returning id, credits
       ) select id, credits from thawed`,
      [userId],
    );
    const credits = matured.rows.reduce((sum, item) => sum + Number(item.credits), 0);
    if (credits > 0) {
      await client.query(
        `update affiliate_accounts set frozen_credits = greatest(frozen_credits - $2, 0),
         available_credits = available_credits + $2, updated_at = now() where user_id = $1`,
        [userId, credits],
      );
    }
    await client.query("commit");
    for (const item of matured.rows) {
      await createAffiliateNotification({ userId, type: "rebate_thawed", eventKey: `thaw:${item.id}`, title: "返利已解冻", body: `一笔 ${item.credits} 点返利已解冻，现在可以转入积分。` });
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function createReferralCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (value) => codeAlphabet[value % codeAlphabet.length]).join("");
}

function normalizeReferralCode(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{4,32}$/.test(normalized) ? normalized : "";
}

type AffiliateAccount = { user_id: string; referral_code: string; inviter_id: string | null; invited_at: string | null; available_credits: number; frozen_credits: number; lifetime_credits: number; created_at: string };
type AffiliateLedgerRow = { id: string; action: string; credits: number; frozen_until: string | null; created_at: string; source_email: string | null; source_order_id: string | null };
type AdminAffiliateRecord = { invitee_id: string; invitee_email: string; inviter_id: string; inviter_email: string; referral_code: string; custom_rebate_rate_percent: string | null; created_at: string; accrued_credits: string | number };
