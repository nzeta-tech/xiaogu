import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createOriginLookup, validateConfig, summarizeStatus } from './host-agent-runtime.mjs';
import { readFileSync } from 'node:fs';
const config = { environment: 'development', baseUrl: 'http://localhost:3000', agentId: 'xiaogu-dev-media', workerRoot: '/tmp/worker', stateRoot: '/tmp/state', envFiles: ['/tmp/dev.env'] };
test('development rejects production destinations and identities', () => {
  assert.equal(validateConfig(config), config);
  assert.throws(() => validateConfig({ ...config, baseUrl: 'https://xiaogu.nzeta.ai' }), /mismatch/);
  assert.throws(() => validateConfig({ ...config, agentId: 'xiaogu-prod-media' }), /mismatch/);
  assert.throws(() => validateConfig({ ...config, baseUrl: 'http://localhost:3000/?token=x' }), /origin/);
});
test('production origin override accepts only an AWS ALB hostname', async () => {
  const workerRoot = await mkdtemp(path.join(os.tmpdir(), 'xiaogu-origin-test-'));
  try {
    await writeFile(path.join(workerRoot, 'manifest.sha256'), 'fixture');
    const production = { ...config, environment: 'production', baseUrl: 'https://xiaogu.nzeta.ai', agentId: 'xiaogu-prod-media', workerRoot, originDnsName: 'xiaogu-origin.ap-southeast-2.elb.amazonaws.com' };
    assert.equal(validateConfig(production), production);
    assert.throws(() => validateConfig({ ...production, originDnsName: 'example.com' }), /Origin DNS override mismatch/);
    assert.throws(() => validateConfig({ ...config, originDnsName: production.originDnsName }), /Origin DNS override mismatch/);
  } finally { await rm(workerRoot, { recursive: true, force: true }); }
});
test('origin lookup preserves the service hostname while rotating ALB addresses', async () => {
  const calls = [];
  const lookup = createOriginLookup({ baseUrl: 'https://xiaogu.nzeta.ai', originDnsName: 'origin.elb.amazonaws.com' }, {
    lookup(hostname, options, callback) { calls.push({ hostname, options }); callback(null, '203.0.113.7', 4); },
    resolve4(hostname, callback) { assert.equal(hostname, 'origin.elb.amazonaws.com'); callback(null, ['192.0.2.10', '192.0.2.11']); },
  });
  const resolve = (hostname, options) => new Promise((resolvePromise, reject) => lookup(hostname, options, (error, address, family) => error ? reject(error) : resolvePromise({ address, family })));
  assert.deepEqual(await resolve('xiaogu.nzeta.ai', {}), { address: '192.0.2.10', family: 4 });
  assert.deepEqual(await resolve('xiaogu.nzeta.ai', {}), { address: '192.0.2.11', family: 4 });
  assert.deepEqual(await resolve('example.com', {}), { address: '203.0.113.7', family: 4 });
  assert.equal(calls[0].hostname, 'example.com');
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

test('production image packages the local Agent lease runtime', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(
    dockerfile,
    /COPY scripts\/local-agent\.mjs scripts\/local-agent-lease\.mjs \/xiaogu\/scripts\//,
  );
});
