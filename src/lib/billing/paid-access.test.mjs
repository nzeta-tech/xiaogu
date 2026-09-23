import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validPaidReceipt, verifiedStripePayment, parsePaymentCents } from "./paid-access-rules.ts";
import { verifyEasypaySignature } from "../payments/easypay-verification.ts";

test("only net-positive completed/paid receipts qualify", () => {
  for (const status of ["pending", "failed", "cancelled", "refunded"]) assert.equal(validPaidReceipt({ status, amountCents: 100, refundedCents: 0 }), false);
  assert.equal(validPaidReceipt({ status: "paid", amountCents: 100, refundedCents: 1 }), true);
  assert.equal(validPaidReceipt({ status: "completed", amountCents: 100, refundedCents: 100 }), false);
  assert.equal(validPaidReceipt({ status: "paid", amountCents: 0, refundedCents: 0 }), false);
});

test("Stripe tests, unpaid/zero payments and amount/currency mismatches do not qualify", () => {
  const order = { amount_cents: 9900, currency: "CNY" };
  const session = { livemode: true, payment_status: "paid", amount_total: 9900, currency: "cny" };
  assert.equal(verifiedStripePayment(session, order), true);
  for (const patch of [{livemode:false}, {payment_status:"unpaid"}, {payment_status:"no_payment_required"}, {amount_total:0}, {amount_total:99}, {currency:"usd"}]) assert.equal(verifiedStripePayment({...session,...patch}, order), false);
});

test("EasyPay requires a valid signature and canonical decimal money", () => {
  const values = { money: "99.00", out_trade_no: "order-1", trade_no: "receipt-1", trade_status: "TRADE_SUCCESS" };
  const raw = Object.keys(values).sort().map(k => `${k}=${values[k]}`).join("&");
  const sign = createHash("md5").update(raw + "test-secret").digest("hex");
  assert.equal(verifyEasypaySignature({...values, sign, sign_type:"MD5"}, "test-secret"), true);
  assert.equal(verifyEasypaySignature(values, "test-secret"), false);
  assert.equal(verifyEasypaySignature({...values, sign, money:"0.01"}, "test-secret"), false);
  assert.equal(parsePaymentCents("99.00"), 9900);
  for (const value of ["0", "NaN", "1e2", "99.001", "-99", "", "Infinity"]) assert.equal(parsePaymentCents(value), null);
});


test("manual access precedence and expiry boundary", async () => {
  const { resolveExclusiveAccess } = await import("./exclusive-access-rules.ts");
  const now = Date.parse("2026-09-18T00:00:00Z");
  for (const paid of [true, false]) {
    assert.equal(resolveExclusiveAccess(paid, { mode: "blocked", expiresAt: null }, now).eligible, false);
    assert.equal(resolveExclusiveAccess(paid, { mode: "granted", expiresAt: null }, now).source, "manual");
    assert.equal(resolveExclusiveAccess(paid, { mode: "granted", expiresAt: "2026-09-18T00:00:00.001Z" }, now).eligible, true);
    for (const expiresAt of ["2026-09-17T23:59:59Z", "2026-09-18T00:00:00Z", "invalid"]) {
      const result = resolveExclusiveAccess(paid, { mode: "granted", expiresAt }, now);
      assert.equal(result.expired, true); assert.equal(result.eligible, paid);
    }
    assert.equal(resolveExclusiveAccess(paid, { mode: "auto", expiresAt: null }, now).eligible, paid);
  }
});
