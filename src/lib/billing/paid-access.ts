import { getExclusiveAccessOverride } from "./exclusive-access-store.ts";
import { resolveExclusiveAccess, EXCLUSIVE_ACCESS_BLOCKED_MESSAGE } from "./exclusive-access-rules.ts";
import { query } from "../db/client.ts";
import { getCreationAppBySlug } from "../apps/catalog.ts";
import { PAID_CUSTOMER_MESSAGE, validPaidReceipt, type AppAccessPolicy } from "./paid-access-rules.ts";

export async function getPaidCustomerStatus(userId: string) {
  const result = await query<{ order_id: string; source: string; amount_cents: number; refunded_cents: number; currency: string; status: string }>(
    `select r.order_id,r.source,r.amount_cents,greatest(r.refunded_cents,coalesce(f.refunded_cents,0)) as refunded_cents,r.currency,o.status
     from verified_payment_receipts r join orders o on o.id=r.order_id
     left join verified_payment_refunds f on f.source=r.source and f.reference=r.reference
     where o.user_id=$1 and o.status in ('paid','completed') order by r.verified_at desc`, [userId]);
  const orders = result.rows.filter(row => validPaidReceipt({ status: row.status, amountCents: row.amount_cents, refundedCents: row.refunded_cents }));
  const totals: Record<string, number> = {};
  for (const order of orders) totals[order.currency] = (totals[order.currency] ?? 0) + order.amount_cents - order.refunded_cents;
  return { eligible: orders.length > 0, totals, orders };
}

export async function getExclusiveAppAccess(userId: string) {
  const [paid, override] = await Promise.all([getPaidCustomerStatus(userId), getExclusiveAccessOverride(userId)]);
  return { ...resolveExclusiveAccess(paid.eligible, override), paid, override };
}

export async function getAppAccessPolicy(slug: string): Promise<AppAccessPolicy> {
  // Read independently of the catalog's static fallback: a DB failure must not
  // accidentally remove an administrator-configured paid gate.
  const result = await query<{ access_policy: AppAccessPolicy; status: string }>("select access_policy,status from apps where slug=$1", [slug]);
  const app = result.rows[0];
  if (app && app.status !== "active") throw new Error("应用已下架");
  return app?.access_policy ?? getCreationAppBySlug(slug)?.accessPolicy ?? "credits";
}

export async function requireAppAccess(userId: string, slug: string): Promise<Response | null> {
  try {
    if (await getAppAccessPolicy(slug) === "credits") return null;
    const access = await getExclusiveAppAccess(userId);
    if (access.eligible) return null;
    if (access.source === "blocked") return Response.json({ error: EXCLUSIVE_ACCESS_BLOCKED_MESSAGE, code: "EXCLUSIVE_ACCESS_BLOCKED" }, { status: 403 });
    return Response.json({ error: PAID_CUSTOMER_MESSAGE, code: "PAID_CUSTOMER_REQUIRED", billingUrl: "/billing" }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message === "应用已下架" ? error.message : "暂时无法核验应用使用资格，请稍后重试。", code: "APP_ACCESS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function recordVerifiedPayment(input: { orderId: string; source: "stripe_live" | "easypay_verified"; reference: string; amountCents: number; currency: string; refundedCents?: number }) {
  const result = await query(
    `insert into verified_payment_receipts(order_id,source,reference,amount_cents,currency,refunded_cents)
     select id,$2,$3,$4,upper($5),greatest($6,coalesce((select refunded_cents from verified_payment_refunds where source=$2 and reference=$3),0)) from orders
     where id=$1 and status in ('paid','completed') and amount_cents=$4 and upper(currency)=upper($5) and $4>0
       and (($2='stripe_live' and provider='stripe') or ($2='easypay_verified' and provider in ('alipay','wechat')))
     on conflict(order_id) do update set refunded_cents=greatest(verified_payment_receipts.refunded_cents,excluded.refunded_cents)
     where verified_payment_receipts.reference=excluded.reference and verified_payment_receipts.source=excluded.source and verified_payment_receipts.amount_cents=excluded.amount_cents
     returning order_id`, [input.orderId, input.source, input.reference, input.amountCents, input.currency, input.refundedCents ?? 0]);
  if (!result.rowCount) throw new Error("无法保存真实收款凭据");
}

export async function recordVerifiedManualPayment(orderId: string) {
  await query(
    `insert into verified_payment_receipts(order_id,source,reference,amount_cents,currency)
     select o.id,'manual_verified',r.id::text,o.amount_cents,upper(o.currency)
     from orders o join payment_manual_reviews r on r.order_id=o.id
     where o.id=$1 and o.provider='manual' and o.status in ('paid','completed') and o.amount_cents>0
       and r.status='approved' and r.reviewed_by is not null and r.reviewed_at is not null and btrim(r.receipt_url)<>''
     on conflict do nothing`, [orderId]);
}

export async function recordVerifiedRefund(source: "stripe_live", reference: string, refundedCents: number) {
  // One statement makes both the early-event ledger and existing receipt atomic.
  await query(`with refund as (
    insert into verified_payment_refunds(source,reference,refunded_cents) values($1,$2,$3)
    on conflict(source,reference) do update set refunded_cents=greatest(verified_payment_refunds.refunded_cents,excluded.refunded_cents)
    returning refunded_cents
  ) update verified_payment_receipts set refunded_cents=greatest(verified_payment_receipts.refunded_cents,(select refunded_cents from refund)) where source=$1 and reference=$2`, [source,reference,refundedCents]);
}
