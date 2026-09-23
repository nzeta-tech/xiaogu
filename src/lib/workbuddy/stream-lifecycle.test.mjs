import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startWorkbuddyStreamHeartbeat } from "./stream-lifecycle.ts";

test("workbuddy stream heartbeat keeps long application runs active", async () => {
  let beats = 0;
  const stop = startWorkbuddyStreamHeartbeat(() => { beats += 1; }, 5);
  await new Promise((resolve) => setTimeout(resolve, 18));
  stop();
  const stoppedAt = beats;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(stoppedAt >= 2);
  assert.equal(beats, stoppedAt);
});

test("workbuddy stream routes do not bind durable execution to the request signal", async () => {
  const routes = await Promise.all([
    readFile(new URL("../../app/api/workbuddy/tasks/stream/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/workbuddy/tasks/[id]/stream/route.ts", import.meta.url), "utf8"),
  ]);
  for (const route of routes) {
    assert.doesNotMatch(route, /send, request\.signal/);
    assert.match(route, /startWorkbuddyStreamHeartbeat/);
  }
});
