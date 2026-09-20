import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import { validateConfig, summarizeStatus } from './host-agent-runtime.mjs';
const config = { environment: 'development', baseUrl: 'http://localhost:3000', agentId: 'xiaogu-dev-media', workerRoot: '/tmp/worker', stateRoot: '/tmp/state', envFiles: ['/tmp/dev.env'] };
test('development rejects production destinations and identities', () => {
  assert.equal(validateConfig(config), config);
  assert.throws(() => validateConfig({ ...config, baseUrl: 'https://xiaogu.nzeta.ai' }), /mismatch/);
  assert.throws(() => validateConfig({ ...config, agentId: 'xiaogu-prod-media' }), /mismatch/);
  assert.throws(() => validateConfig({ ...config, baseUrl: 'http://localhost:3000/?token=x' }), /origin/);
});
test('status requires the exact environment worker and every production dependency', () => {
  const now = Date.now();
  const node = { agent_id: `${config.agentId}-${os.hostname()}`, status: 'ready', protocol_version: 1, last_seen_at: new Date(now - 10000).toISOString(), capabilities: { 'digital-human.video.produce': true }, health: { codexCli: 'healthy', heygenCli: 'healthy', ffmpeg: 'healthy' }, active_task_count: 0 };
  const check = (patch = {}, enabled = true) => summarizeStatus(config, { enabled, nodes: [{ ...node, ...patch }] }, now);
  assert.equal(check().available, true);
  assert.equal(check({ agent_id: 'xiaogu-prod-media' }).available, false);
  assert.equal(check({ last_seen_at: new Date(now - 46000).toISOString() }).available, false);
  assert.equal(check({ last_seen_at: 'invalid' }).available, false);
  assert.equal(check({ status: 'offline' }).available, false);
  assert.equal(check({ protocol_version: 2 }).available, false);
  assert.equal(check({ health: { ...node.health, heygenCli: 'unhealthy' } }).available, false);
  assert.equal(check({}, false).available, false);
});
