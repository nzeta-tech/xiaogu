import test from "node:test";
import assert from "node:assert/strict";
import {createWorkGate, createWorkPool} from "./spoken-video-work-pool.mjs";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };

test("task pool starts two jobs and waits before admitting a third", async () => {
  const first = deferred(), second = deferred();
  const pool = createWorkPool(2);
  pool.start(() => first.promise);
  pool.start(() => second.promise);
  assert.equal(pool.size, 2);
  let capacity = false;
  const waiting = pool.waitForCapacity().then(() => { capacity = true; });
  await Promise.resolve(); assert.equal(capacity, false);
  first.resolve(); await waiting;
  assert.equal(pool.size, 1);
  second.resolve(); await pool.drain();
  assert.equal(pool.size, 0);
});

test("render gate serializes heavy work while task planning remains concurrent", async () => {
  const gate = createWorkGate(1), first = deferred();
  const order = [];
  const a = gate.run(async () => { order.push("render-a"); await first.promise; order.push("done-a"); });
  const b = gate.run(async () => { order.push("render-b"); }, {onWait: async () => order.push("wait-b")});
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(new Set(order), new Set(["render-a", "wait-b"]));
  assert.equal(order.includes("render-b"), false);
  first.resolve(); await Promise.all([a,b]);
  assert.ok(order.indexOf("done-a") < order.indexOf("render-b"));
});

test("pool observes task failures and frees capacity", async () => {
  const errors=[];const pool=createWorkPool(1,{onError:error=>errors.push(error.message)});
  pool.start(async()=>{throw new Error("controlled")});
  await pool.drain();
  assert.deepEqual(errors,["controlled"]);assert.equal(pool.size,0);
});
