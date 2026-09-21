import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { videoResumeCache } from "./spoken-video-resume.mjs";
import { researchSegmentsWithCodex } from "./spoken-video-web-research.mjs";

test("retry in a fresh workspace only researches unfinished or changed segments", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "video-resume-test-"));
  const segments = [{ id: "s1", text: "first", visual: "one" }, { id: "s2", text: "second", visual: "two" }];
  const calls = [];
  let fail = true;
  const runner = async (_bin, args, options) => {
    const { segments: [segment] } = JSON.parse(await readFile(path.join(options.cwd, "web-research-input.json"), "utf8"));
    calls.push(segment.id);
    if (segment.id === "s2" && fail) throw new Error("connection interrupted");
    await writeFile(args[args.indexOf("-o") + 1], JSON.stringify({ webAccessed: true, segments: [{ id: segment.id, sources: [] }] }));
  };
  try {
    const first = await mkdtemp(path.join(root, "attempt-"));
    await assert.rejects(researchSegmentsWithCodex(segments, first, runner, videoResumeCache(root, "task-a")), /interrupted/);
    await rm(first, { recursive: true });
    fail = false;
    const second = await mkdtemp(path.join(root, "attempt-"));
    assert.deepEqual(await researchSegmentsWithCodex(segments, second, runner, videoResumeCache(root, "task-a")), [[], []]);
    assert.deepEqual(calls, ["s1", "s2", "s2"]);
    await researchSegmentsWithCodex([{ ...segments[0], text: "changed" }, segments[1]], second, runner, videoResumeCache(root, "task-a"));
    assert.deepEqual(calls, ["s1", "s2", "s2", "s1"]);
    await researchSegmentsWithCodex(segments, second, runner, videoResumeCache(root, "task-b"));
    assert.deepEqual(calls.slice(-2), ["s1", "s2"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("planning cache rejects invalid results, expires, survives corruption and clears", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "video-resume-test-"));
  const cache = videoResumeCache(root, "task");
  let calls = 0;
  const produce = async () => { calls++; return ["valid"]; };
  const valid = value => Array.isArray(value) && value[0] === "valid";
  const get = input => cache.getOrCreate("plan", input, produce, valid);
  try {
    await assert.rejects(cache.getOrCreate("plan", "script", async () => [], valid), /Invalid/);
    await get("script");
    await get("script");
    assert.equal(calls, 1);
    const [scope] = await readdir(path.join(root, "resume"));
    const dir = path.join(root, "resume", scope);
    const [name] = await readdir(dir);
    const file = path.join(dir, name);
    const data = JSON.parse(await readFile(file, "utf8"));
    data.savedAt -= 25 * 60 * 60 * 1000;
    await writeFile(file, JSON.stringify(data));
    await get("script");
    assert.equal(calls, 2);
    await writeFile(file, "broken JSON");
    await get("script");
    assert.equal(calls, 3);
    await get("new template");
    assert.equal(calls, 4);
    await cache.clear();
    await get("script");
    assert.equal(calls, 5);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed or malformed research output cannot become a reusable checkpoint", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "video-resume-test-"));
  const cache = videoResumeCache(root, "task");
  const segments = [{ id: "s1", text: "source", visual: "title" }];
  try {
    for (const output of [{ webAccessed: false, segments: [] }, { webAccessed: true, segments: [{ id: "wrong", sources: [] }] }]) {
      await assert.rejects(researchSegmentsWithCodex(segments, root, async (_bin, args) => {
        await writeFile(args[args.indexOf("-o") + 1], JSON.stringify(output));
      }, cache));
    }
    await assert.rejects(researchSegmentsWithCodex(segments, root, async () => {}, cache), /未写入检索结果/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
