import assert from "node:assert/strict";
import test from "node:test";
import { parseQingshanCreatorPayload, parseSogouAccountResults } from "./viral-creator-sources.ts";

test("Qingshan import keeps visible creators, groups works, and skips locked rows", () => {
  const creators = parseQingshanCreatorPayload({
    filter_mode: "viral",
    grouped_items: {
      wechat_channels: [
        { title: "家庭保障怎么配", url: "https://channels.weixin.qq.com/example/1", author_name: "保姐说保险", creator: { id: "channel-1", display_name: "保姐说保险", avatar_url: "https://img.example/a.jpg" } },
        { title: "医疗险避坑", url: "https://channels.weixin.qq.com/example/2", author_name: "保姐说保险", creator: { id: "channel-1", display_name: "保姐说保险" } },
        { title: "会员内容", author_name: "隐藏作者", is_locked: true, creator: { id: "locked-1" } },
      ],
      wechat_official_account: [
        { title: "养老金规划", url: "https://mp.weixin.qq.com/s?__biz=MzA123", author_name: "家庭理财指南", creator: { display_name: "家庭理财指南" } },
      ],
    },
  });
  assert.equal(creators.length, 2);
  const channel = creators.find((creator) => creator.platform === "视频号");
  assert.equal(channel.creatorKey, "channel-1");
  assert.equal(channel.evidenceCount, 2);
  assert.equal(creators.find((creator) => creator.platform === "公众号").creatorKey, "MzA123");
});

test("Qingshan import combines latest and viral responses without duplicating creators", () => {
  const creator = { id: "channel-combined", display_name: "养老规划师" };
  const creators = parseQingshanCreatorPayload([
    { filter_mode: "latest", grouped_items: { wechat_channels: [{ title: "最新作品", author_name: "养老规划师", creator }], wechat_official_account: [] } },
    { filter_mode: "viral", grouped_items: { wechat_channels: [{ title: "爆款作品", author_name: "养老规划师", creator }], wechat_official_account: [] } },
  ]);
  assert.equal(creators.length, 1);
  assert.equal(creators[0].evidenceCount, 2);
  assert.deepEqual(creators[0].evidence.map((item) => item.query).sort(), ["青山AI:latest", "青山AI:viral"]);
});

test("Sogou account search extracts account identity, profile and verification", () => {
  const html = `<ul class="news-list2"><li id="sogou_vr_11002301_box_0">
    <div class="txt-box"><p class="tit"><a href="/weixin?type=1&query=家庭保险">家庭保险规划</a></p>
    <p class="info"><label>微信号：</label><span>family_insurance</span></p>
    <dl><dt>功能介绍：</dt><dd>保险科普、养老和家庭理财规划</dd></dl>
    <dl><dt>微信认证：</dt><dd>某某保险经纪有限公司</dd></dl></div></li></ul>`;
  const creators = parseSogouAccountResults(html, "保险规划");
  assert.equal(creators.length, 1);
  assert.equal(creators[0].creatorKey, "family_insurance");
  assert.equal(creators[0].displayName, "家庭保险规划");
  assert.equal(creators[0].isVerified, true);
  assert.match(creators[0].bio, /养老/);
  assert.match(creators[0].profileUrl, /weixin\.sogou\.com/);
});

test("Sogou challenge pages never produce creators", () => {
  assert.deepEqual(parseSogouAccountResults("<html>请依次点击【字】 /antispider/</html>", "保险"), []);
});
