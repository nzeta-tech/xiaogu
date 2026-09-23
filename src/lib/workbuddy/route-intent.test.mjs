import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSemanticRoutingPrompt, intentRouteIssues } from './route-intent.ts';

const assessment = { goal: 'discuss', contextRelation: 'new', factualBasis: 'current', materialSufficiency: 'partial', externalEvidenceNeeded: true };
test('contradictory chat decision is rejected for semantic repair', () => {
  const issues = intentRouteIssues({ mode: 'chat', requiresFreshInformation: false, evidenceRequirement: 'current', intentAssessment: assessment });
  assert.ok(issues.length >= 2);
});
test('research-dependent creation must preserve its prerequisites', () => {
  const route = { mode: 'capability', requiresFreshInformation: true, evidenceRequirement: 'current', intentAssessment: { ...assessment, goal: 'create' } };
  assert.equal(intentRouteIssues(route).length, 1);
  assert.deepEqual(intentRouteIssues({ ...route, prerequisites: [{ capabilityId: 'agent.fast-research' }] }), []);
});
test('sufficient evidence allows direct discussion and rejects redundant research', () => {
  const route = { mode: 'direct', requiresFreshInformation: false, evidenceRequirement: 'none', intentAssessment: { ...assessment, materialSufficiency: 'sufficient', externalEvidenceNeeded: false } };
  assert.deepEqual(intentRouteIssues(route), []);
  assert.equal(intentRouteIssues({ ...route, mode: 'fast-research' }).length, 1);
});
test('routing receives the current request and source without a guessed creation stage', () => {
  const prompt = buildSemanticRoutingPrompt({ request: '后来呢', objective: '聊聊这个事件', context: '此前只看过标题', sourceContext: '报道摘要', capabilityManifest: [], now: '2026-09-19' });
  assert.match(prompt, /后来呢/);
  assert.match(prompt, /报道摘要/);
  assert.doesNotMatch(prompt, /<execution_mode|当前处于创作阶段/);
});
