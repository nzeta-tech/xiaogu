import assert from "node:assert/strict";
import test from "node:test";
import { confirmAuthSession } from "./auth-session-confirmation.ts";

const noWait = async () => undefined;

test("confirms a cookie-backed session without retrying", async () => {
  let calls = 0;
  const result = await confirmAuthSession("/api/auth/session-check", {
    fetchImpl: async () => {
      calls += 1;
      return Response.json({ authenticated: true });
    },
    waitImpl: noWait,
  });
  assert.equal(result, "confirmed");
  assert.equal(calls, 1);
});

test("retries a temporarily missing cookie before confirming", async () => {
  let calls = 0;
  const result = await confirmAuthSession("/api/auth/session-check", {
    fetchImpl: async () => {
      calls += 1;
      return calls < 3
        ? Response.json({ authenticated: false }, { status: 401 })
        : Response.json({ authenticated: true });
    },
    waitImpl: noWait,
  });
  assert.equal(result, "confirmed");
  assert.equal(calls, 3);
});

test("reports a rejected session after bounded retries", async () => {
  let calls = 0;
  const result = await confirmAuthSession("/api/auth/session-check", {
    attempts: 2,
    fetchImpl: async () => {
      calls += 1;
      return Response.json({ authenticated: false }, { status: 401 });
    },
    waitImpl: noWait,
  });
  assert.equal(result, "rejected");
  assert.equal(calls, 2);
});

test("separates network failure from cookie rejection", async () => {
  const result = await confirmAuthSession("/api/auth/session-check", {
    attempts: 2,
    fetchImpl: async () => { throw new TypeError("offline"); },
    waitImpl: noWait,
  });
  assert.equal(result, "unavailable");
});
