import { test } from "node:test";
import assert from "node:assert/strict";
import { pollHeygenVideo } from "./spoken-video-poll.mjs";

test("a transient status error does not lose a completed remote video", async () => {
  let calls = 0;
  const result = await pollHeygenVideo("existing", async () => {
    if (++calls === 1) throw new Error("net/http: TLS handshake timeout");
    return { status: "completed", video_url: "https://example.com/video.mp4", duration: 65.44 };
  }, { sleep: async () => {} });
  assert.equal(calls, 2);
  assert.equal(result.videoId, "existing");
  assert.equal(result.duration, 65.44);
});

test("provider failure and authentication errors are not retried", async () => {
  for (const response of [() => ({ status: "failed", failure_message: "render failed" }), () => { throw new Error("401 unauthorized"); }]) {
    let calls = 0;
    await assert.rejects(pollHeygenVideo("existing", async () => { calls++; return response(); }, { sleep: async () => {} }));
    assert.equal(calls, 1);
  }
});

test("repeated timeouts stop at the retry cap", async () => {
  let calls = 0;
  await assert.rejects(pollHeygenVideo("existing", async () => { calls++; throw new Error("timeout"); }, { sleep: async () => {}, maxConsecutiveErrors: 3 }), /远端任务已保留/);
  assert.equal(calls, 3);
});
