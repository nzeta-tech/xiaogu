import test from "node:test";
import assert from "node:assert/strict";
import { clearCurrentUserCache, getCurrentUser } from "./current-user.ts";

test("shares one in-flight auth request across guard and shell", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearCurrentUserCache();
  });

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({ user: { id: "fixture-user", role: "broker" } });
  };

  clearCurrentUserCache();
  const [guardUser, shellUser] = await Promise.all([getCurrentUser(), getCurrentUser()]);
  assert.equal(calls, 1);
  assert.equal(guardUser?.id, "fixture-user");
  assert.deepEqual(shellUser, guardUser);
});

test("clearing the cache allows a fresh auth request", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearCurrentUserCache();
  });

  let calls = 0;
  globalThis.fetch = async () => Response.json({ user: { id: `fixture-${++calls}` } });
  clearCurrentUserCache();
  assert.equal((await getCurrentUser())?.id, "fixture-1");
  clearCurrentUserCache();
  assert.equal((await getCurrentUser())?.id, "fixture-2");
});

test("does not cache an unauthenticated result across a later login", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearCurrentUserCache();
  });

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? Response.json({ user: null }, { status: 401 })
      : Response.json({ user: { id: "logged-in-user", role: "broker" } });
  };

  clearCurrentUserCache();
  assert.equal(await getCurrentUser(), null);
  assert.equal((await getCurrentUser())?.id, "logged-in-user");
  assert.equal(calls, 2);
});
