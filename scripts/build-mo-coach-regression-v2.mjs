#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { Pool } from "pg";

const previewPath = new URL("../public/xiaogu-hot-topic-preview.html", import.meta.url);
const financePath = new URL("../public/xiaogu-finance-run.js", import.meta.url);
const outputPath = new URL("../src/lib/creation/fixtures/mo-coach-regression-v2.json", import.meta.url);
const clean = (value, limit = 360) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
const pickEvenly = (items, count) => items.length <= count ? items : Array.from({ length: count }, (_, i) => items[Math.floor(i * items.length / count)]);

function extractPreviewTopics(html) {
  const start = html.indexOf("    const categoryVisuals");
  const end = html.indexOf("    const list = document.querySelector", start);
  if (start < 0 || end < 0) throw new Error("热点预览页 topics 数据不完整");
  const sandbox = {};
  vm.runInNewContext(`${html.slice(start, end)}\nglobalThis.__topics = topics;`, sandbox, { timeout: 2_000 });
  return sandbox.__topics;
}

function extractExternalTopics(script) {
  const sandbox = { window: { XIAOGU_RESEARCH_CACHE: [] } };
  vm.runInNewContext(script, sandbox, { timeout: 2_000 });
  return sandbox.window.XIAOGU_RESEARCH_CACHE;
}

function toCase(topic, index, sourceGroup) {
  const highRisk = ["高", "中高"].includes(topic.risk ?? topic.insurance_relevance);
  return {
    id: `mo-v2-${String(index + 1).padStart(2, "0")}`,
    sourceGroup,
    tab: clean(topic.tab ?? "当前热点", 30),
    title: clean(topic.title, 180),
    fact: clean(topic.fact ?? topic.summary, 420),
    suggestedAngle: clean(topic.angle ?? topic.recommended_angle, 300),
    regressionContract: {
      xiaogu: "应将热点翻译成明确的家庭决策问题，给出可执行的准备或核对动作；不必模仿 Mo 姐的表达节奏。",
      mo: "应先捕捉一个具体人的矛盾或误判，再用反直觉判断推进；允许停在一个让人重新思考的收束，不把每题写成现金流、长期主义或保障清单。",
      genericNegative: "不得只把热点替换进‘风险来了—提前规划—咨询专业人士’的通用保险模板。",
      evidence: highRisk ? "涉及政策、医疗、事故、市场或个案时，只能依据给定事实表达，不补造数字、责任、案例或确定性结论。" : "优先使用题目提供的场景与事实；信息不足时收窄判断，不用大词补强。",
    },
    assertions: ["正文必须有且只有一个可复述的核心判断。", "开头 3 句内必须出现与目标家庭有关的具体张力、场景或误判。", "素材只能服务论证，不能把热点摘要重述一遍。", "不得虚构创作者经历、客户案例、团队或服务承诺。"],
  };
}

async function main() {
  const basePreview = extractPreviewTopics(await readFile(previewPath, "utf8")).filter((item) => item?.title);
  const financePreview = extractExternalTopics(await readFile(financePath, "utf8")).filter((item) => item?.title && item.tab === "财经");
  const preview = [...basePreview, ...pickEvenly(financePreview, 6)];
  const normalizedTabs = new Map([["热点", "社会热点"], ["实时热点", "社会热点"], ["政策", "社会热点"]]);
  const previewCases = ["社会热点", "财经", "香港", "国际"].flatMap((tab) => preview.filter((item) => (normalizedTabs.get(item.tab) ?? item.tab) === tab).map((item) => ({ ...item, tab })));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let current;
  try {
    const result = await pool.query("select title,summary,insurance_relevance,recommended_angle from topic_snapshots where created_at >= now() - interval '30 days' order by created_at desc limit 100");
    current = pickEvenly(result.rows, 60 - previewCases.length).map((row) => ({ ...row, tab: "当前热点" }));
  } finally { await pool.end(); }
  if (previewCases.length < 4 || current.length < 60 - previewCases.length) throw new Error(`回归题源不足：预览页 ${previewCases.length}，当前热点 ${current.length}/${60 - previewCases.length}`);
  const cases = [...previewCases, ...current].slice(0, 60).map((topic, index) => toCase(topic, index, index < 40 ? "热点预览页" : "当前热点库"));
  const document = { schemaVersion: 1, name: "Mo姐 V2 离线对比回归集", generatedAt: new Date().toISOString(), sources: { preview: previewCases.length, currentHotTopics: 60 - previewCases.length }, comparisonAxes: ["小谷：家庭决策可执行性", "Mo姐：矛盾切口与判断推进", "通用保险反例：模板化检测"], cases };
  await mkdir(new URL("../src/lib/creation/fixtures/", import.meta.url), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: outputPath.pathname, count: cases.length, preview: previewCases.length, current: 60 - previewCases.length }));
}
await main();
