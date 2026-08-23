import test from "node:test";
import assert from "node:assert/strict";
import { parseTopHubDouyinRankingHtml, parseValuefocusDouyinPayload } from "./viral-douyin-ranking.ts";

test("Valuefocus parser keeps valid Douyin finance videos and rejects unrelated URLs", () => {
  const items = parseValuefocusDouyinPayload({
    asOf: "2026-08-23T02:00:00.000Z",
    videos: [
      { id: "ok", desc: "利率变化如何影响家庭现金流", url: "https://www.douyin.com/video/123456789", author: "财经作者", heat: 3210 },
      { id: "bad", desc: "非抖音链接", url: "https://example.com/video/1", heat: 99 },
    ],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].sourceTitle, "Valuefocus 抖音财经趋势");
  assert.equal(items[0].metricValue, 3210);
  assert.equal(items[0].fetchedAt, "2026-08-23T02:00:00.000Z");
});

test("Valuefocus parser treats schema drift as an empty source", () => {
  assert.deepEqual(parseValuefocusDouyinPayload({ data: [] }), []);
  assert.deepEqual(parseValuefocusDouyinPayload(null), []);
});

test("TopHub parser extracts valid rows, metrics and removes duplicates", () => {
  const html = `
    <table>
      <tr><td><a href="https://www.douyin.com/video/987654">家庭资产配置新变化</a></td><td><div class="item-desc">谷老师</div><div class="item-extra">12.5万次播放</div><img src="https://cdn.example.com/cover.jpg"></td></tr>
      <tr><td><a href="https://www.douyin.com/video/987654">重复作品</a></td></tr>
      <tr><td><a href="https://example.com/not-douyin">无关链接</a></td></tr>
    </table>`;
  const items = parseTopHubDouyinRankingHtml(html);

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "家庭资产配置新变化");
  assert.equal(items[0].authorName, "谷老师");
  assert.equal(items[0].metricValue, 125000);
  assert.equal(items[0].thumbnailUrl, "https://cdn.example.com/cover.jpg");
});

test("TopHub parser treats an unavailable or changed page as an empty source", () => {
  assert.deepEqual(parseTopHubDouyinRankingHtml("<html><h1>503 unavailable</h1></html>"), []);
});
