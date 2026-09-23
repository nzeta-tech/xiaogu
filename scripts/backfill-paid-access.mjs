// Dry-run by default. Verifies existing Stripe sessions against the payment
// provider; never infers real payment from an order status or credit balance.
import Stripe from "stripe";
import { Pool } from "pg";
import { decryptSettingSecret } from "../src/lib/security/secrets.ts";
import { verifiedStripePayment } from "../src/lib/billing/paid-access-rules.ts";
import { recordVerifiedPayment } from "../src/lib/billing/paid-access.ts";
import { getPool } from "../src/lib/db/client.ts";

const apply = process.argv.includes("--apply");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
try {
  const { rows } = await pool.query(`select o.id,o.provider,o.provider_order_id,o.amount_cents,o.currency,p.config_encrypted
    from orders o left join payment_provider_instances p on p.id=o.provider_instance_id
    where o.status in ('paid','completed') and o.amount_cents>0
      and not exists(select 1 from verified_payment_receipts r where r.order_id=o.id) order by o.created_at`);
  for (const order of rows) {
    if (order.provider !== "stripe" || !order.provider_order_id) {
      console.log(JSON.stringify({ orderId: order.id, result: "needs_manual_reconciliation" }));
      continue;
    }
    try {
      const config = order.config_encrypted ? JSON.parse(decryptSettingSecret(order.config_encrypted)) : {};
      const stripe = new Stripe(config.secretKey || process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.retrieve(order.provider_order_id, { expand: ["payment_intent.latest_charge"] });
      if (!verifiedStripePayment(session, order)) {
        console.log(JSON.stringify({ orderId: order.id, result: "not_a_verified_live_payment" }));
        continue;
      }
      const intent = session.payment_intent;
      const charge = typeof intent === "object" && intent ? intent.latest_charge : null;
      if (!intent || typeof intent === "string" || !charge || typeof charge === "string") throw new Error("missing expanded payment evidence");
      const refundedCents = charge.amount_refunded ?? 0;
      if (apply) await recordVerifiedPayment({ orderId: order.id, source: "stripe_live", reference: intent.id, amountCents: session.amount_total, currency: session.currency, refundedCents });
      console.log(JSON.stringify({ orderId: order.id, result: apply ? "recorded" : "verified_dry_run", eligible: session.amount_total > refundedCents }));
    } catch {
      // Never print provider credentials or raw upstream errors.
      console.log(JSON.stringify({ orderId: order.id, result: "verification_failed" }));
      process.exitCode = 1;
    }
  }
} finally { await pool.end(); await getPool().end(); }
