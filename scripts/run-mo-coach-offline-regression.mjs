#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";

const fixturePath = new URL("../src/lib/creation/fixtures/mo-coach-regression-v2.json", import.meta.url);
const outputPath = new URL("../artifacts/mo-coach-v3-offline-regression.json", import.meta.url);
const coachId = "a054601d-c3a8-4403-943c-db42475a8667";
const v1 = "7c771e10-7a3d-484b-a842-1924277ccfb2";
const v3 = "4db2caff-4dfc-4b56-b3f8-dd0ebff1233a";

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("模型未返回 JSON");
  return JSON.parse(match[0]);
}

async function complete(prompt) {
  const base = (process.env.MODEL_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.MODEL_API_KEY}` },
    body: JSON.stringify({ model: process.env.MODEL_NAME ?? "gpt-5.6-terra", temperature: 0.2, max_tokens: 9000, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`模型调用失败 ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return String((await response.json()).choices?.[0]?.message?.content ?? "");
}

async function main() {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prompts = await pool.query(`select id,content_creation_prompt from creative_coach_versions where coach_id=$1 and id=any($2::uuid[])`, [coachId, [v1, v3]]);
  await pool.end();
  const byId = new Map(prompts.rows.map((row) => [row.id, row.content_creation_prompt]));
  if (!byId.has(v1) || !byId.has(v3) || fixture.cases.length !== 60) throw new Error("缺少对照版本或回归集");
  const output = { schemaVersion: 1, name: "Mo姐 V1 vs V3 离线回归结果", generatedAt: new Date().toISOString(), baselineVersion: 1, candidateVersion: 3, cases: [] };
  for (let offset = 0; offset < fixture.cases.length; offset += 5) {
    const cases = fixture.cases.slice(offset, offset + 5);
    const prompt = [
      "你在做内容教练离线回归。针对每个题，分别执行 V1 与 V3 的内容创作指令，输出两个精炼口播样稿（各 180-260 字）。不得虚构事实。",
      "严格输出 JSON：{items:[{id,v1,v3,comparison:{v3HasSpecificTension:boolean,v3AvoidsGenericInsurance:boolean,v3UsesEvidence:boolean,winner:'v1'|'v3'|'tie',reason:string}}]}。reason 不超过 50 字。",
      `V1 内容指令：\n${byId.get(v1)}`,
      `V3 内容指令：\n${byId.get(v3)}`,
      "题目：\n" + cases.map((item) => `${item.id}\n标题：${item.title}\n事实：${item.fact}\n可选切口：${item.suggestedAngle}\nMo回归要求：${item.regressionContract.mo}\n反例禁止：${item.regressionContract.genericNegative}`).join("\n\n"),
    ].join("\n\n");
    const parsed = parseJson(await complete(prompt));
    if (!Array.isArray(parsed.items) || parsed.items.length !== cases.length) throw new Error(`第 ${offset + 1} 批结果不完整`);
    output.cases.push(...parsed.items);
    await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ phase: "batch", completed: output.cases.length, total: fixture.cases.length }));
  }
  const wins = output.cases.reduce((count, item) => (count[item.comparison.winner] = (count[item.comparison.winner] ?? 0) + 1, count), {});
  console.log(JSON.stringify({ phase: "completed", output: outputPath.pathname, cases: output.cases.length, wins }));
}
await main();
