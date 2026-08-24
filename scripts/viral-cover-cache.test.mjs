import test from "node:test";
import assert from "node:assert/strict";
import { resolveAndCacheViralCover } from "./viral-cover-cache.mjs";

test("a usable provider cover avoids original-work inspection", async () => {
  let inspections = 0;
  const source = await resolveAndCacheViralCover({
    providedThumbnail: "https://images.example/provider.jpg",
    cache: async () => undefined,
    inspect: async () => { inspections += 1; return "https://images.example/work.jpg"; },
  });
  assert.equal(source, "provider");
  assert.equal(inspections, 0);
});

test("a rejected provider placeholder falls back to the original work", async () => {
  const cached = [];
  const source = await resolveAndCacheViralCover({
    providedThumbnail: "https://images.example/placeholder.png",
    cache: async (url) => { cached.push(url); if (cached.length === 1) throw new Error("invalid cover"); },
    inspect: async () => "http://127.0.0.1:3000/api/creation/link-remix/media?file=real.jpg",
  });
  assert.equal(source, "original_work");
  assert.deepEqual(cached, [
    "https://images.example/placeholder.png",
    "http://127.0.0.1:3000/api/creation/link-remix/media?file=real.jpg",
  ]);
});

test("missing provider metadata inspects the original work directly", async () => {
  let cached = "";
  const source = await resolveAndCacheViralCover({
    providedThumbnail: "",
    cache: async (url) => { cached = url; },
    inspect: async () => "https://images.example/work.jpg",
  });
  assert.equal(source, "original_work");
  assert.equal(cached, "https://images.example/work.jpg");
});
