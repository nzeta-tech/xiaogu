import assert from "node:assert/strict";
import test from "node:test";
import { buildTrafficEvidencePack, buildTrafficEvidencePackFromFastResearch, buildTrafficEvidenceSearchPlanningPrompt, buildTrafficMaterialBriefPrompt, extractTrafficClaims, formatTrafficMaterialBrief, parseTrafficEvidenceSearchPlan, parseTrafficMaterialBrief, planTrafficEvidenceSearch, scoreSourceAuthority } from "./traffic-copy-evidence.ts";

test("adapts one shared Fast Research run into the traffic evidence contract", async () => {
  const pack = await buildTrafficEvidencePackFromFastResearch("景甜与孙宇晨涉及3000万元财产争议。", {
    trace: { queries: [{ query:"景甜 孙宇晨 财产争议",purpose:"核验公开事件主体与状态" }] },
    queryResults: [{ query:"景甜 孙宇晨 财产争议",purpose:"核验公开事件主体与状态",results:[{
      title:"景甜与孙宇晨财产争议公开报道",url:"https://www.reuters.com/event",content:"景甜与孙宇晨涉及3000万元财产争议。",publishedDate:"2026-08-29",provider:"volcengine",
    }] }],
  });
  assert.equal(pack.searchPlan.calls.length, 1);
  assert.equal(pack.searchPlan.calls[0].factNeed, "核验公开事件主体与状态");
  assert.equal(pack.claims[0].sources.length, 1);
  assert.equal(pack.claims[0].status, "supported");
  assert.equal(pack.providersUsed[0], "volcengine");
});

test("Fast Research adapter excludes creation instructions from factual claims", async () => {
  const pack = await buildTrafficEvidencePackFromFastResearch("公开报道涉及景甜与孙宇晨的3000万元财产争议。\n请生成流量口播。\n不得把程序信息写成最终定论。", {
    trace:{queries:[{query:"景甜 孙宇晨 3000万元 财产争议",purpose:"核验事件"}]},
    queryResults:[{query:"景甜 孙宇晨 3000万元 财产争议",purpose:"核验事件",results:[]}],
  });
  assert.equal(pack.claims.length, 1);
  assert.doesNotMatch(pack.claims[0].claim, /生成|不得/);
});

test("extracts numeric and time-sensitive claims before generic commentary", () => {
  const claims = extractTrafficClaims("大家都很关心这个问题。最近人民币从7.3到了6.7。2025年贸易顺差接近1.19万亿美元。普通家庭应该先看自己的需求。", 2);
  assert.equal(claims.length, 2);
  assert.match(claims.join(" "), /7\.3/);
  assert.match(claims.join(" "), /1\.19万亿美元/);
});

test("ranks official and major media sources above generic sites", () => {
  assert.deepEqual(scoreSourceAuthority("https://www.safe.gov.cn/example"), { tier: "official", score: 100 });
  assert.deepEqual(scoreSourceAuthority("https://www.reuters.com/example"), { tier: "major_media", score: 80 });
  assert.deepEqual(scoreSourceAuthority("https://example.com/post"), { tier: "other", score: 30 });
});

test("flags numeric disagreement from an official source for comparison", async () => {
  const pack = await buildTrafficEvidencePack("官方数据显示，外汇储备减少了近10000亿美元。", async () => [{
    title: "国家外汇管理局公布数据", url: "https://www.safe.gov.cn/data", content: "外汇储备较上年减少5127亿美元。", provider: "volcengine",
  }]);
  assert.equal(pack.claims[0].status, "potential_conflict");
  assert.equal(pack.potentialConflictCount, 1);
  assert.equal(pack.claims[0].sources[0].authorityTier, "official");
});

test("does not treat a shared year as support for an unmatched precise figure", async () => {
  const pack = await buildTrafficEvidencePack("2005年至2015年汇率从8.27升至6.04。", async () => [{
    title: "2005年至2015年汇率阶段走势", url: "https://www.safe.gov.cn/data", content: "2005年至2015年人民币汇率总体走强，累计升值35%。", provider: "volcengine",
  }]);
  assert.equal(pack.claims[0].status, "partially_supported");
  assert.match(pack.claims[0].conflictNote, /未直接支持/);
});

test("search outage remains non-blocking and records unresolved claims", async () => {
  const pack = await buildTrafficEvidencePack("最近人民币汇率出现明显变化。", async () => { throw new Error("provider unavailable"); });
  assert.equal(pack.claims[0].status, "unresolved");
  assert.equal(pack.unresolvedCount, 1);
});

test("skips search when the source contains no time-sensitive or external factual claim", async () => {
  let calls = 0;
  const pack = await buildTrafficEvidencePack("先把家庭未来要花的钱分清楚，再决定怎么配置。", async () => { calls += 1; return []; });
  assert.equal(pack.searchPlan.necessary, false);
  assert.equal(calls, 0);
});

test("plans no more than three focused single-intent queries", () => {
  const source = "最近人民币汇率明显上涨。2025年贸易顺差接近1.19万亿美元。2015年外汇储备减少5127亿美元。";
  const plan = planTrafficEvidenceSearch(source);
  assert.equal(plan.calls.length, 3);
  assert.equal(plan.calls[0].purpose, "topic_evidence");
  assert.ok(plan.calls.every((call) => call.query.length > 0));
  assert.ok(plan.calls.some((call) => call.query === "人民币汇率近期走势"));
  assert.ok(plan.calls.some((call) => call.query === "人民币汇率走强原因"));
  assert.ok(plan.calls.some((call) => call.query === "人民币汇率双向波动历史"));
  assert.equal(plan.calls[1].purpose, "claim_verification");
});

test("reuses topic search results as optional argument materials", async () => {
  let calls = 0;
  const pack = await buildTrafficEvidencePack("最近人民币汇率明显上涨。", async () => {
    calls += 1;
    return [{ title: "汇率变化对家庭支出的影响", url: "https://www.safe.gov.cn/example", content: "家庭应按照真实用汇需求配置币种。", provider: "volcengine" }];
  });
  assert.equal(calls, 1);
  assert.equal(pack.topicMaterials.length, 1);
  assert.equal(pack.topicMaterials[0].authorityTier, "official");
});

test("collects useful materials from every query without adding search calls", async () => {
  let calls = 0;
  const source = "最近人民币汇率明显上涨。2025年贸易顺差接近1.19万亿美元。";
  const pack = await buildTrafficEvidencePack(source, async (query) => {
    calls += 1;
    return query.includes("走强原因")
      ? [{ title: "货物贸易顺差数据", url: "https://customs.gov.cn/trade", content: "2025年货物贸易顺差及进出口数据。", provider: "volcengine" }]
      : [{ title: "人民币汇率走势", url: "https://www.safe.gov.cn/rate", content: "人民币汇率变化影响家庭换汇成本。", provider: "volcengine" }];
  });
  assert.equal(calls, pack.searchPlan.calls.length);
  assert.equal(pack.topicMaterials.length, 2);
  assert.ok(pack.topicMaterials.every((item) => item.materialReason));
});

test("deduplicates and caps the shared material pool at five", async () => {
  const pack = await buildTrafficEvidencePack("最近人民币汇率明显上涨。", async () => Array.from({ length: 8 }, (_, index) => ({
    title: `人民币汇率影响材料${index}`,
    url: `https://www.safe.gov.cn/rate-${index}`,
    content: "人民币汇率变化影响家庭换汇成本和美元支出。",
    provider: "volcengine",
  })));
  assert.equal(pack.topicMaterials.length, 5);
});

test("builds diversified high-value queries for the RMB source instead of malformed fragments", () => {
  const source = "最近人民币从7.3一路冲到了6.7附近，涨幅快7个点了。2015年8月11日汇改落地，随后外汇储备明显减少。去年货物贸易顺差冲到了1.19万亿美元。";
  const plan = planTrafficEvidenceSearch(source);
  assert.deepEqual(plan.calls.map((call) => call.query), [
    "人民币汇率近期走势",
    "人民币汇率双向波动历史",
    "人民币汇率走强原因",
  ]);
});

test("treats a target exchange-rate point as a forecast rather than a conflicting fact", async () => {
  const pack = await buildTrafficEvidencePack("人民币能不能冲到6.5？", async () => [{
    title: "人民币汇率中间价", url: "https://www.safe.gov.cn/rate", content: "当前中间价为6.78。", provider: "volcengine",
  }]);
  assert.equal(pack.claims[0].status, "partially_supported");
  assert.match(pack.claims[0].conflictNote, /目标点位/);
});

test("search planning prompt lets the model decide whether and what to search", () => {
  const source = "2015年末外汇储备减少了5127亿美元。";
  const prompt = buildTrafficEvidenceSearchPlanningPrompt(source);
  assert.match(prompt, /由你根据本题自主判断/);
  assert.match(prompt, /shouldSearch/);
  const plan = parseTrafficEvidenceSearchPlan(JSON.stringify({ searches: [{
    question: "2015年外汇储备变化是什么？", query: "2015年末外汇储备变化",
  }] }), source);
  assert.equal(plan.calls[0].query, "2015年末外汇储备变化");
});

test("accepts model-selected searches without forcing fixed roles", () => {
  const source = "最近人民币从7.3升至6.7附近。2015年8月汇改后外汇储备明显变化。去年货物贸易顺差达到新高。";
  const plan = parseTrafficEvidenceSearchPlan(JSON.stringify({ shouldSearch: true, searches: [{
    question: "近期汇率的真实变化是什么？", query: "人民币汇率近期走势",
  }] }), source);
  assert.equal(plan.calls.length, 1);
  assert.equal(plan.calls[0].factNeed, "近期汇率的真实变化是什么？");
});

test("rejects a mechanism query stuffed with presumed answers", () => {
  const source = "最近人民币汇率走强。今年货物贸易顺差、资本流动和美元走势都可能影响汇率。2015年汇率改革后市场发生变化。";
  const plan = parseTrafficEvidenceSearchPlan(JSON.stringify({ searches: [{
    question: "近期走势", query: "人民币汇率近期走势",
  }, {
    question: "走强原因", query: "人民币汇率近期走强驱动因素贸易顺差资本流动美元走势",
  }] }), source);
  assert.ok(!plan.calls.some((call) => call.query.includes("贸易顺差资本流动美元走势")));
  assert.equal(plan.calls.length, 1);
});

test("editor selects source chunks by index instead of rewriting them into assertions", async () => {
  const pack = await buildTrafficEvidencePack("最近人民币汇率明显上涨。", async () => [{
    title: "官方走势材料", url: "https://www.safe.gov.cn/rate", content: "原始摘要：人民币汇率近期变化及形成原因。", provider: "volcengine",
  }]);
  const planner = buildTrafficMaterialBriefPrompt("最近人民币汇率明显上涨。", "【素材#1】官方走势材料\n原始摘要：人民币汇率近期变化及形成原因。");
  assert.match(planner, /selectedMaterialIndexes/);
  assert.match(planner, /素材不改写/);
  const brief = parseTrafficMaterialBrief(JSON.stringify({ selectedMaterialIndexes: [1], creativeDirection: "用当前走势解释家庭换汇判断。" }));
  const formatted = formatTrafficMaterialBrief(brief, pack.topicMaterials);
  assert.match(formatted, /【素材#1】官方走势材料/);
  assert.match(formatted, /原始摘要：人民币汇率近期变化及形成原因/);
});
