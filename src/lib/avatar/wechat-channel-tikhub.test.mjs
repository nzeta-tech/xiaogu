import assert from "node:assert/strict";
import test from "node:test";
import { decodeWechatChannelTrainingTokens, discoverWechatChannelWorks } from "./wechat-channel-tikhub.ts";

const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test("discovers requested count across pages and keeps media credentials server-encrypted", async () => {
  process.env.TIKHUB_API_TOKEN = "test-token";
  process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key";
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    requests.push({ url: String(url), body });
    if (String(url).endsWith("fetch_channel_id_to_username")) return Response.json({ code: 200, data: { username: `v2_paged_${testRunId}@finder`, nickname: "测试作者" } });
    const page = body.last_buffer ? 2 : 1;
    const videos = Array.from({ length: 6 }, (_, index) => ({
      id: String(page * 100 + index), description: `作品${page}-${index}`, create_time: 1_700_000_000 + index,
      media: { full_url: `https://finder.video.qq.com/${page}/${index}?token=x`, decode_key: String(9000 + index) },
      like_count: index * 10,
    }));
    return Response.json({ code: 200, data: { videos, has_more: page === 1, last_buffer: page === 1 ? "next" : "" } });
  };
  try {
    const result = await discoverWechatChannelWorks({ channelId: `sphTestPaged${testRunId}`, limit: 10 });
    assert.equal(result.requestCount, 2);
    assert.equal(result.pageCount, 2);
    assert.equal(result.providerRequestCount, 3);
    assert.equal(result.cacheHitCount, 0);
    assert.equal(result.candidates.length, 10);
    assert.equal(result.candidates[0].authorName, "测试作者");
    assert.equal(result.candidates[0].trainingToken.includes("finder.video.qq.com"), false);
    const decoded = decodeWechatChannelTrainingTokens([result.candidates[0].trainingToken]);
    assert.equal(decoded[0].mediaUrl, "https://finder.video.qq.com/1/0?token=x");
    assert.equal(decoded[0].decodeKey, "9000");
    assert.equal(requests.filter((request) => request.url.endsWith("fetch_user_videos")).length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("stops after the first page when it already satisfies the selected count", async () => {
  process.env.TIKHUB_API_TOKEN = "test-token";
  process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key";
  const originalFetch = globalThis.fetch;
  let listCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("fetch_channel_id_to_username")) return Response.json({ code: 200, data: { username: `v2_single_${testRunId}@finder` } });
    listCalls += 1;
    return Response.json({ code: 200, data: { videos: Array.from({ length: 20 }, (_, index) => ({ id: String(index), title: `作品${index}`, media: { full_url: `https://finder.video.qq.com/${index}`, decode_key: "1" } })), has_more: true, last_buffer: "unused" } });
  };
  try {
    const result = await discoverWechatChannelWorks({ channelId: `sphTestSingle${testRunId}`, limit: 10 });
    assert.equal(result.candidates.length, 10);
    assert.equal(listCalls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("normalizes the current TikHub title, cover and pagination fields", async () => {
  process.env.TIKHUB_API_TOKEN = "test-token";
  process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key";
  const originalFetch = globalThis.fetch;
  let listCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("fetch_channel_id_to_username")) return Response.json({ code: 200, data: { username: `v2_fields_${testRunId}@finder`, nickname: "测试作者" } });
    listCalls += 1;
    const body = JSON.parse(String(init?.body || "{}"));
    if (!body.last_buffer) return Response.json({ code: 200, data: {
      videos: [{ id: "first", title: [{ shortTitle: "对象标题" }], cover_img_url: "https://example.com/cover.jpg", media: { full_url: "https://example.com/first.mp4", decode_key: "1" } }],
      up_continue: 1,
      last_buffer: "next",
    } });
    return Response.json({ code: 200, data: {
      videos: [{ id: "second", title: { description: "第二页标题" }, media: { full_url: "https://example.com/second.mp4", decode_key: "2" } }],
      up_continue: 0,
      last_buffer: "done",
    } });
  };
  try {
    const result = await discoverWechatChannelWorks({ channelId: `sphTestFields${testRunId}`, limit: "all" });
    assert.equal(listCalls, 3);
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].title, "对象标题");
    assert.equal(result.candidates[0].coverUrl, "https://example.com/cover.jpg");
    assert.equal(result.candidates[1].title, "第二页标题");
  } finally { globalThis.fetch = originalFetch; }
});

test("continues with a changing cursor when TikHub reports up_continue zero", async () => {
  process.env.TIKHUB_API_TOKEN = "test-token";
  process.env.SETTINGS_ENCRYPTION_KEY = "test-encryption-key";
  const originalFetch = globalThis.fetch;
  let listCalls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("fetch_channel_id_to_username")) return Response.json({ code: 200, data: { username: `v2_cursor_${testRunId}@finder` } });
    listCalls += 1;
    const body = JSON.parse(String(init?.body || "{}"));
    const page = body.last_buffer ? 2 : 1;
    return Response.json({ code: 200, data: {
      videos: Array.from({ length: 15 }, (_, index) => ({
        id: `${page}-${index}`,
        title: `作品${page}-${index}`,
        media: { full_url: `https://example.com/${page}-${index}.mp4`, decode_key: "1" },
      })),
      up_continue: 0,
      last_buffer: page === 1 ? "next" : "done",
    } });
  };
  try {
    const result = await discoverWechatChannelWorks({ channelId: `sphTestCursor${testRunId}`, limit: 20 });
    assert.equal(listCalls, 2);
    assert.equal(result.candidates.length, 20);
    assert.equal(result.candidates[15].id, "2-0");
  } finally { globalThis.fetch = originalFetch; }
});
