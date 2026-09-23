import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.PAID_ACCESS_TEST_DATABASE_URL;
test("paid application access and video accounting against isolated PostgreSQL", { skip: !databaseUrl }, async t => {
  const url = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/paid_access_test", "Use the dedicated local test database only");
  process.env.DATABASE_URL = databaseUrl;
  const { query, getPool } = await import("../db/client.ts");
  const { getPaidCustomerStatus, getExclusiveAppAccess, requireAppAccess, recordVerifiedPayment, recordVerifiedManualPayment, recordVerifiedRefund } = await import("./paid-access.ts");
  const { updateExclusiveAccess, getExclusiveAccessOverride, getExclusiveAccessHistory } = await import("./exclusive-access-store.ts");
  const userId = randomUUID();
  const slug = `paid-access-test-${userId}`;
  await query("insert into users(id,name,email,password_hash,role) values($1,'Access test',$2,'test','admin')", [userId, `${userId}@example.test`]);
  await query("insert into apps(code,slug,name,access_policy) values($1,$1,'Access test','paid_customer')", [slug]);
  async function order(provider = "stripe", status = "paid", amount = 9900) {
    const id = randomUUID();
    await query("insert into orders(id,user_id,provider,status,amount_cents,currency,quota_amount) values($1,$2,$3,$4,$5,'CNY',300)", [id,userId,provider,status,amount]);
    return id;
  }
  const receipt = (orderId, reference = orderId) => recordVerifiedPayment({ orderId,source:"stripe_live",reference,amountCents:9900,currency:"CNY" });
  try {
    await t.test("admin role, gifts, demo orders and manually marked paid orders do not unlock", async () => {
      await order("demo"); await order("alipay");
      await query("insert into gift_records(user_id,source_type,quota_amount) values($1,'admin',10000),($1,'signup',10000)",[userId]);
      assert.equal((await getPaidCustomerStatus(userId)).eligible,false);
      const denied = await requireAppAccess(userId,slug);
      assert.equal(denied.status,403);
      assert.equal((await denied.json()).code,"PAID_CUSTOMER_REQUIRED");
    });
    await t.test("ordinary app allows non-paying accounts; policy takes effect immediately", async () => {
      await query("update apps set access_policy='credits' where slug=$1",[slug]);
      assert.equal(await requireAppAccess(userId,slug),null);
      await query("update apps set access_policy='paid_customer' where slug=$1",[slug]);
      assert.equal((await requireAppAccess(userId,slug)).status,403);
    });
    const change = async (mode, expiresAt = null, reason = "测试人工授权") => updateExclusiveAccess({ userId, adminId: userId, mode, expiresAt, reason, expectedRevision: (await getExclusiveAccessOverride(userId)).revision });
    await t.test("manual grant opens access without creating payments, credits or rebates", async () => {
      const beforeOrders = (await query("select count(*)::int as n from orders where user_id=$1", [userId])).rows[0].n;
      await change("granted");
      assert.equal(await requireAppAccess(userId, slug), null);
      assert.equal((await getExclusiveAppAccess(userId)).source, "manual");
      assert.equal((await getPaidCustomerStatus(userId)).eligible, false);
      assert.equal((await query("select count(*)::int as n from orders where user_id=$1", [userId])).rows[0].n, beforeOrders);
      const history = await getExclusiveAccessHistory(userId);
      assert.equal(history[0].detail.before.mode, "auto");
      assert.equal(history[0].detail.after.mode, "granted");
      assert.equal(history[0].operator, `${userId}@example.test`);
      await change("auto", null, "撤销体验资格");
      assert.equal((await requireAppAccess(userId, slug)).status, 403);
    });
    await t.test("expired manual access falls back to payment without scheduled cleanup", async () => {
      await change("granted", new Date(Date.now() + 86400000).toISOString());
      await query("update exclusive_app_access_overrides set expires_at=now()-interval '1 second' where user_id=$1", [userId]);
      const access = await getExclusiveAppAccess(userId);
      assert.equal(access.expired, true); assert.equal(access.eligible, false);
      await change("auto");
    });
    await t.test("invalid input and non-admin mutation are rejected", async () => {
      await assert.rejects(change("granted", null, "   "), e => e.status === 400);
      await assert.rejects(change("granted", "2000-01-01T00:00:00Z"), e => e.status === 400);
      await assert.rejects(change("blocked", new Date(Date.now() + 86400000).toISOString()), e => e.status === 400);
      await query("update users set role='broker' where id=$1", [userId]);
      try { await assert.rejects(change("granted"), e => e.status === 403); }
      finally { await query("update users set role='admin' where id=$1", [userId]); }
    });
    await t.test("simultaneous admin edits cannot overwrite each other", async () => {
      const expectedRevision = (await getExclusiveAccessOverride(userId)).revision;
      const results = await Promise.allSettled(["granted", "blocked"].map(mode => updateExclusiveAccess({ userId, adminId: userId, mode, expiresAt: null, reason: "并发测试", expectedRevision })));
      assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
      assert.equal(results.find(r => r.status === "rejected").reason.status, 409);
      await change("auto");
    });
    await t.test("audit failure rolls back the permission change", async () => {
      const before = await getExclusiveAccessOverride(userId);
      await query("alter table admin_audit_logs add constraint exclusive_access_test_audit_failure check (action <> 'user.exclusive_app_access.update') not valid");
      try { await assert.rejects(change("granted")); }
      finally { await query("alter table admin_audit_logs drop constraint exclusive_access_test_audit_failure"); }
      assert.deepEqual(await getExclusiveAccessOverride(userId), before);
    });
    const paidOrder = await order();
    await t.test("verified receipt unlocks and duplicate receipt does not increase totals", async () => {
      await receipt(paidOrder); await receipt(paidOrder);
      assert.equal(await requireAppAccess(userId,slug),null);
      assert.deepEqual((await getPaidCustomerStatus(userId)).totals,{CNY:9900});
      await assert.rejects(receipt(paidOrder,"different-reference"));
    });
    await t.test("block overrides payment but leaves ordinary apps available; auto restores payment", async () => {
      await change("blocked");
      const denied = await requireAppAccess(userId, slug);
      assert.equal((await denied.json()).code, "EXCLUSIVE_ACCESS_BLOCKED");
      assert.equal((await getPaidCustomerStatus(userId)).eligible, true);
      await query("update apps set access_policy='credits' where slug=$1", [slug]);
      assert.equal(await requireAppAccess(userId, slug), null);
      await query("update apps set access_policy='paid_customer' where slug=$1", [slug]);
      await change("granted", new Date(Date.now() + 86400000).toISOString());
      await query("update exclusive_app_access_overrides set expires_at=now()-interval '1 second' where user_id=$1", [userId]);
      assert.equal((await getExclusiveAppAccess(userId)).source, "payment");
      await change("auto");
      assert.equal(await requireAppAccess(userId, slug), null);
    });
    await t.test("partial refund keeps eligibility; full refund removes it; replay cannot restore it", async () => {
      await recordVerifiedRefund("stripe_live",paidOrder,100);
      assert.deepEqual((await getPaidCustomerStatus(userId)).totals,{CNY:9800});
      await recordVerifiedRefund("stripe_live",paidOrder,9900);
      await recordVerifiedRefund("stripe_live",paidOrder,1);
      await receipt(paidOrder);
      assert.equal((await getPaidCustomerStatus(userId)).eligible,false);
    });
    await t.test("refund preceding payment callback remains revoked", async () => {
      const id = await order();
      await recordVerifiedRefund("stripe_live",id,9900); await receipt(id);
      assert.equal((await getPaidCustomerStatus(userId)).eligible,false);
    });
    await t.test("one remaining valid order keeps eligibility; local refund revokes last order", async () => {
      const id = await order(); await receipt(id);
      assert.equal((await getPaidCustomerStatus(userId)).eligible,true);
      await query("update orders set status='refunded' where id=$1",[id]);
      assert.equal((await getPaidCustomerStatus(userId)).eligible,false);
      await assert.rejects(receipt(id));
    });
    await t.test("manual transfers require approval, reviewer and receipt", async () => {
      const id = await order("manual");
      await query("insert into payment_manual_reviews(order_id,user_id,status,reviewed_by,reviewed_at) values($1,$2,'approved',$2,now())",[id,userId]);
      await recordVerifiedManualPayment(id);
      assert.equal((await getPaidCustomerStatus(userId)).eligible,false);
      await query("update payment_manual_reviews set receipt_url='https://example.test/receipt' where order_id=$1",[id]);
      await recordVerifiedManualPayment(id);
      assert.equal((await getPaidCustomerStatus(userId)).eligible,true);
    });
    await t.test("failed videos and historical unpriced jobs are free; successful job charges exactly once", async () => {
      const id = randomUUID();
      await query("insert into digital_human_video_jobs(id,user_id,provider,title,script,aspect_ratio,quota_cost,edition) values($1,$2,'heygen','test','test script','9:16',12,'standard')",[id,userId]);
      await query("update digital_human_video_jobs set status='failed' where id=$1",[id]);
      assert.equal((await query("select count(*)::int as n from usage_logs where user_id=$1",[userId])).rows[0].n,0);
      await query("update digital_human_video_jobs set status='completed' where id=$1",[id]);
      await query("update digital_human_video_jobs set status='completed' where id=$1",[id]);
      const usage = await query("select count(*)::int as n,sum(quota_cost)::int as cost from usage_logs where user_id=$1",[userId]);
      assert.deepEqual(usage.rows[0],{n:1,cost:12});
      await query("insert into digital_human_video_jobs(user_id,provider,title,script,aspect_ratio,edition) values($1,'heygen','old','test script','9:16','standard')",[userId]);
      await query("update digital_human_video_jobs set status='completed' where user_id=$1",[userId]);
      assert.equal((await query("select count(*)::int as n from usage_logs where user_id=$1",[userId])).rows[0].n,1);
    });
    await t.test("DB errors fail closed even with static catalog fallback", async () => {
      await query("alter table apps rename column access_policy to access_policy_test_hidden");
      try { assert.equal((await requireAppAccess(userId,"digital-human-video")).status,503); }
      finally { await query("alter table apps rename column access_policy_test_hidden to access_policy"); }
    });
  } finally {
    await query("delete from usage_logs where user_id=$1",[userId]);
    await query("delete from users where id=$1",[userId]);
    await query("delete from apps where slug=$1",[slug]);
    await getPool().end();
  }
});
