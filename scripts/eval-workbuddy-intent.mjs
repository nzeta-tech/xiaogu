// Opt-in model evaluation; sends synthetic cases only, never creates tasks or invokes apps.
// node --env-file=.env --experimental-strip-types scripts/eval-workbuddy-intent.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { buildSemanticRoutingPrompt, semanticRequestRouteSchema, intentRouteIssues } from '../src/lib/workbuddy/route-intent.ts';
import { resolveConfiguredTextModel } from '../src/lib/agent/model-config.ts';
const manifest = [
  { id: 'agent.fast-research', name: 'Fast Research', description: '核实具体事实，动态补充搜索', operations: ['research', 'verify'], outputs: ['data'] },
  { id: 'agent.deep-research', name: 'Deep Research', description: '深度报告、复杂证据冲突与高风险判断', operations: ['research', 'verify'], outputs: ['data'] },
  { id: 'tool.hot-topic-discovery', name: '热点发现', description: '发现热榜候选', operations: ['research'], outputs: ['data'] },
  { id: 'app.traffic-copy', name: '流量口播', description: '创作流量口播文案', operations: ['create', 'revise'], outputs: ['text'], formats: ['spoken-script'] },
];
const evidence = '以下是用户提供的完整活动公告原文：海湾市图书节9月19日开幕，活动仅限室内，免费预约，每日限500人。主办方已于当日确认人数上限用于保障阅读体验。用户只讨论这段公告的表达。';
const cases = [
  ['original-hot-topic', '聊聊这个热点：陈建州病房众人齐聚拍照 医院回应', '仅有热榜标题及简短摘要，没有完整报道和医院声明。', 'fast-research'],
  ['same-intent-paraphrase', '病房合照那件事到底怎么回事？', '指刚才热榜上的陈建州病房合照事件，仅有标题。', 'fast-research'],
  ['missing-evidence', '你怎么看？', '用户选中标题：某公司今天宣布大规模裁员。目前只有标题，细节未提供。', 'fast-research'],
  ['sufficient-evidence', '你怎么看这个人数上限的表达？只讨论公告文字。', evidence, 'direct'],
  ['translate-news', '把上面这段公告翻译成英文', evidence, 'direct'],
  ['summarize-provided', '总结一下', evidence, 'direct'],
  ['summarize-missing', '总结一下它今天的最新进展', '上一轮讨论某航空公司停飞事件，资料截至昨日。', 'fast-research'],
  ['stable-knowledge', '聊聊为什么会有彩虹', '', 'direct'],
  ['social', '今天有点累，陪我随便聊两句吧', '', 'chat'],
  ['greeting', '你好', '', 'chat'],
  ['followup-new-evidence', '后来呢？', '先前只查到了某地昨日停电的初步报道，尚无恢复供电消息。', 'fast-research'],
  ['leave-research', '先不查那个了，解释一下什么是比喻', '当前阶段：research；之前正在查停电事件。', 'direct'],
  ['hypothetical', '假设一个虚构城市每周停电一天，会怎样影响生活？不讨论真实事件。', '', 'direct'],
  ['source-limited', '不要联网，只根据上面的摘要分析表达方式', '外部摘要：某公司今天宣布重组。没有核验其真实性。', 'direct'],
  ['research-then-create', '先查清这个新闻的经过，再帮我写成一篇口播', '只有某公司今天大规模裁员的标题。', 'capability'],
  ['deep-explicit', '做一份深入研究报告，比较三国养老制度的可持续性', '', 'deep-research'],
];
const repetitions = Math.max(1, Number(process.env.INTENT_EVAL_REPETITIONS) || 1);
const jobs = Array.from({ length: repetitions }, (_, repeat) => cases.map(item => ({ item, repeat: repeat + 1 }))).flat();
const results = [];
if (!process.env.MODEL_API_KEY) throw new Error('MODEL_API_KEY is required');
if (process.env.MODEL_PROVIDER && process.env.MODEL_PROVIDER !== 'openai') throw new Error('This evaluator requires the configured OpenAI-compatible provider');
async function worker() {
  while (jobs.length) {
    const { item: [id, request, context, expected], repeat } = jobs.shift();
    const prompt = buildSemanticRoutingPrompt({ request, objective: request, context, capabilityManifest: manifest, now: '2026年9月19日 下午1时' });
    let result;
    try {
      const response = await fetch(`${(process.env.MODEL_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: resolveConfiguredTextModel(), messages: [{ role: 'user', content: prompt }], temperature: 0.1, response_format: { type: 'json_object' } }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
      const payload = await response.json();
      const route = JSON.parse(payload.choices?.[0]?.message?.content || 'null');
      semanticRequestRouteSchema.parse(route);
      const issues = intentRouteIssues(route);
      const dependencyOk = id !== 'research-then-create' || (route.targetCapabilityId === 'app.traffic-copy' && route.prerequisites?.some(p => p.capabilityId === 'agent.fast-research'));
      result = { id, repeat, expected, passed: route.mode === expected && !issues.length && dependencyOk, route, issues };
    } catch (error) { result = { id, repeat, expected, passed: false, error: error.message }; }
    results.push(result);
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${id} #${repeat}: ${result.route?.mode || result.error}`);
  }
}
await Promise.all([worker(), worker(), worker()]);
const report = { scope: 'Shared production routing prompt with a fixed capability fixture; not an end-to-end runtime test', model: resolveConfiguredTextModel(), total: results.length, passed: results.filter(r => r.passed).length, results };
await mkdir('artifacts/workbuddy-intent', { recursive: true });
await writeFile(`artifacts/workbuddy-intent/evaluation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(report, null, 2));
console.log(`${report.passed}/${report.total} passed`);
if (report.passed !== report.total) process.exitCode = 1;
