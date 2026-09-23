// Run against the disposable preview, never a production host.
import assert from "node:assert/strict";
import { Pool } from "pg";
import Stripe from "stripe";
import { SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { encryptSettingSecret } from "../src/lib/security/secrets.ts";

const base = process.env.PAID_ACCESS_TEST_BASE_URL;
const databaseUrl = process.env.PAID_ACCESS_TEST_DATABASE_URL;
if (!base || !databaseUrl) throw new Error("Dedicated preview URL and test DB are required");
assert.equal(new URL(base).hostname,"127.0.0.1");
assert.equal(new URL(databaseUrl).pathname,"/paid_access_test");
assert.equal(new URL(databaseUrl).hostname,"127.0.0.1");
const pool = new Pool({connectionString:databaseUrl});
const userId = randomUUID();
const providerId = randomUUID();
const signingSecret = "whsec_local_paid_access_test";
const stripe = new Stripe("sk_test_local_paid_access_test");
const token = await new SignJWT({ id:userId,email:"paid-access@example.test",name:"权限测试管理员",role:"admin",sessionVersion:1 }).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
async function api(path, body, method = body ? "POST" : "GET") {
  const response = await fetch(base+path,{method,headers:{cookie:`ica_session=${token}`,"content-type":"application/json"},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json()};
}
async function event(type, object) {
  const payload = JSON.stringify({id:`evt_${randomUUID()}`,object:"event",type,livemode:true,data:{object}});
  const response = await fetch(base+"/api/billing/webhook",{method:"POST",headers:{"content-type":"application/json","stripe-signature":stripe.webhooks.generateTestHeaderString({payload,secret:signingSecret})},body:payload});
  assert.equal(response.status,200,await response.text());
}
try {
  await pool.query("insert into users(id,name,email,password_hash,role) values($1,'Access HTTP test',$2,'test','admin')",[userId,`${userId}@example.test`]);
  await pool.query("insert into gift_records(user_id,source_type,quota_amount) values($1,'admin',10000)",[userId]);
  await pool.query("insert into payment_provider_instances(id,name,provider_key,enabled,config_encrypted) values($1,'Local test','stripe',true,$2)",[providerId,encryptSettingSecret(JSON.stringify({secretKey:"sk_test_local_paid_access_test",webhookSecret:signingSecret}))]);
  assert.equal((await api("/api/creation/apps/traffic-copy")).status,200);
  let result = await api("/api/billing/access-status?app=digital-human-video");
  assert.equal(result.status,200);assert.equal(result.data.eligible,false);
  result = await api("/api/digital-human-videos",{});
  assert.equal(result.status,403);assert.equal(result.data.code,"PAID_CUSTOMER_REQUIRED");
  console.log("PASS: gifted admin blocked by video API");

  // Also test an ordinary app configured as paid, including all generic entry points.
  const catalog = await api("/api/admin/apps");
  const app = catalog.data.apps.find(app=>app.slug==="traffic-copy");
  assert.ok(app);
  assert.equal((await api("/api/admin/apps",{appId:app.id,accessPolicy:"paid_customer"},"PATCH")).status,200);
  for (const suffix of ["/prepare","/stream","/topics"]) {
    const r=await api(`/api/creation/apps/traffic-copy${suffix}`,{values:{}});
    assert.equal(r.status,403,`${suffix}: ${JSON.stringify(r.data)}`);
    assert.equal(r.data.code,"PAID_CUSTOMER_REQUIRED");
  }
  const appRead=await api("/api/creation/apps/traffic-copy");
  assert.equal(appRead.data.app.accessPolicy,"paid_customer","catalog sync must preserve configured policy");
  assert.equal((await api("/api/admin/apps",{appId:app.id,accessPolicy:"credits"},"PATCH")).status,200);
  console.log("PASS: generic endpoints and catalog policy persistence");

  const orderId=randomUUID(), sessionId=`cs_test_${randomUUID()}`, intentId=`pi_${randomUUID()}`;
  await pool.query("insert into orders(id,user_id,provider,provider_order_id,status,amount_cents,currency,quota_amount) values($1,$2,'stripe',$3,'pending',9900,'CNY',300)",[orderId,userId,sessionId]);
  const session={id:sessionId,object:"checkout.session",livemode:false,payment_status:"paid",amount_total:9900,currency:"cny",payment_intent:intentId};
  await event("checkout.session.completed",session);
  assert.equal((await api("/api/billing/access-status?app=digital-human-video")).data.eligible,false);
  console.log("PASS: signed Stripe test payment does not unlock");
  session.livemode=true;
  await event("checkout.session.completed",session);
  assert.equal((await api("/api/billing/access-status?app=digital-human-video")).data.eligible,true);
  console.log("PASS: signed live-mode fixture unlocks");
  await event("charge.refunded",{id:"ch_local",object:"charge",payment_intent:intentId,amount_refunded:9900});
  await event("checkout.session.completed",session);
  assert.equal((await api("/api/billing/access-status?app=digital-human-video")).data.eligible,false);
  console.log("PASS: refund followed by payment replay stays locked");
} finally {
  await pool.query("delete from users where id=$1",[userId]);
  await pool.query("delete from payment_provider_instances where id=$1",[providerId]);
  await pool.end();
}
