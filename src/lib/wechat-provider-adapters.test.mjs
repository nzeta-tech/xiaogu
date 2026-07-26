import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeWechatSogouArticles,
  normalizeWechatSogouCreators,
  normalizeWeRssArticles,
  normalizeWeRssCreators,
} from "./wechat-provider-adapters.ts";

test("normalizes complete WechatSogou account metadata", () => {
  const creators = normalizeWechatSogouCreators({ data: [{
    wechat_name: "家庭保险指南",
    wechat_id: "family_insurance",
    introduction: "家庭保障与养老规划",
    authentication: "已认证保险经纪机构",
    profile_url: "https://mp.weixin.qq.com/profile/example",
    post_perm: 18,
  }] }, "保险");
  assert.equal(creators.length, 1);
  assert.equal(creators[0].creatorKey, "family_insurance");
  assert.equal(creators[0].platformWorkCount, 18);
  assert.equal(creators[0].isVerified, true);
});

test("normalizes WeRSS search and subscribed feed envelopes", () => {
  const creators = normalizeWeRssCreators({ code: 0, data: { list: [{
    id: "MP_WXS_123",
    mp_name: "养老规划研究",
    mp_intro: "养老与家庭资产配置",
  }] } }, "养老");
  assert.equal(creators.length, 1);
  assert.equal(creators[0].creatorKey, "MP_WXS_123");
  assert.equal(creators[0].sourceKind, "authorized_link");
});

test("normalizes nested WechatSogou article results", () => {
  const articles = normalizeWechatSogouArticles({ data: [{
    article: {
      title: "健康告知到底怎么看",
      url: "https://mp.weixin.qq.com/s/example-one",
      abstract: "投保前需要关注的事项",
      time: 1700000000,
      imgs: ["https://img.example/cover.jpg"],
    },
    gzh: { wechat_name: "保险科普站", profile_url: "https://mp.weixin.qq.com/profile/example" },
  }] }, "健康告知");
  assert.equal(articles.length, 1);
  assert.equal(articles[0].authorName, "保险科普站");
  assert.equal(articles[0].thumbnailUrl, "https://img.example/cover.jpg");
});

test("normalizes WeRSS articles and drops non-WeChat URLs", () => {
  const articles = normalizeWeRssArticles({ data: { list: [
    { title: "家庭保障清单", url: "https://mp.weixin.qq.com/s/example-two", mp_name: "家庭保障", mp_id: "MP_2", publish_time: 1700000100, content: "<p>正文</p>" },
    { title: "外部网页", url: "https://example.com/article" },
  ] } });
  assert.equal(articles.length, 1);
  assert.equal(articles[0].provider, "werss");
  assert.equal(articles[0].articleBody, "<p>正文</p>");
});
