import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const productionOrigin = 'https://xiaogu.nzeta.ai';
export function validateConfig(config) {
  if (!['production', 'development'].includes(config.environment)) throw new Error('Explicit environment required');
  const url = new URL(config.baseUrl);
  const production = config.environment === 'production';
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use a plain service origin');
  if (production ? url.origin !== productionOrigin : !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Environment and endpoint mismatch');
  if (!path.isAbsolute(config.workerRoot) || !path.isAbsolute(config.stateRoot)) throw new Error('Absolute runtime and state paths required');
  const expectedId = `xiaogu-${production ? 'prod' : 'dev'}-media`;
  if (config.agentId !== expectedId) throw new Error('Environment and agent identity mismatch');
  if (config.drainLegacy && production) throw new Error('Legacy drain is only supported for development');
  if (!Array.isArray(config.envFiles) || !config.envFiles.length) throw new Error('Credential source required');
  if (production && !fs.existsSync(path.join(config.workerRoot, 'manifest.sha256'))) throw new Error('Production requires a prepared immutable worker');
  return config;
}

export function summarizeStatus(config, payload, now = Date.now()) {
  const id = `${config.agentId}-${os.hostname()}`;
  const node = payload.nodes?.find(item => item.agent_id === id);
  const ageSeconds = node ? Math.max(0, Math.round((now - Date.parse(node.last_seen_at)) / 1000)) : null;
  const dependencies = Object.fromEntries(['codexCli', 'heygenCli', 'ffmpeg'].map(key => [key, node?.health?.[key] ?? 'missing']));
  const ready = payload.enabled === true && ['ready', 'busy'].includes(node?.status) && Number.isFinite(ageSeconds) && ageSeconds <= 45 && node?.protocol_version === 1 && node?.capabilities?.['digital-human.video.produce'] === true && Object.values(dependencies).every(value => value === 'healthy');
  return { environment: config.environment, agentId: id, endpoint: config.baseUrl, available: ready, enabled: payload.enabled === true, status: node?.status ?? 'missing', ageSeconds, dependencies, activeTasks: node?.active_task_count ?? 0 };
}

async function main() {
  const [configFile, mode] = process.argv.slice(2);
  const config = validateConfig(JSON.parse(fs.readFileSync(configFile, 'utf8')));
  // Read only the scoped credential. Project env files must not override the target,
  // identity or worker paths selected by the environment config.
  let token;
  let databaseUrl;
  for (const file of config.envFiles) {
    if (!fs.existsSync(file)) continue;
    const parsed = (await import('node:util')).parseEnv(fs.readFileSync(file, 'utf8'));
    if (parsed.LOCAL_AGENT_TOKEN) token = parsed.LOCAL_AGENT_TOKEN;
    if (parsed.DATABASE_URL) databaseUrl = parsed.DATABASE_URL;
  }
  if (!token) throw new Error('Scoped Agent credential is missing');
  if (mode === '--status') {
    const response = await fetch(`${config.baseUrl}/api/internal/local-agent/status`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Status endpoint HTTP ${response.status}`);
    const result = summarizeStatus(config, await response.json());
    console.log(JSON.stringify(result));
    process.exitCode = result.available ? 0 : 2;
    return;
  }
  if (mode && mode !== '--run') throw new Error('Unknown runtime mode');
  const state = config.stateRoot;
  fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  const lock = path.join(state, 'worker.lock');
  try { fs.mkdirSync(lock); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(fs.readFileSync(path.join(lock, 'pid'), 'utf8'));
    try { process.kill(pid, 0); throw new Error(`Worker already running (pid ${pid})`); }
    catch (cause) { if (cause.code !== 'ESRCH') throw cause; }
    fs.rmSync(lock, { recursive: true });
    fs.mkdirSync(lock);
  }
  fs.writeFileSync(path.join(lock, 'pid'), String(process.pid), { mode: 0o600 });
  process.on('exit', () => fs.rmSync(lock, { recursive: true, force: true }));
  if (config.drainLegacy) {
    if (!databaseUrl || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(databaseUrl).hostname)) throw new Error('Legacy drain requires a local database');
    const exec = promisify(execFile);
    const service = `gui/${process.getuid()}/ai.nzeta.xiaogu-local-spoken-agent`;
    const { Pool } = createRequire(path.join(config.workerRoot, 'package.json'))('pg');
    const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    try {
      for (;;) {
        try { await exec('/bin/launchctl', ['print', service]); }
        catch { break; }
        const id = `xiaogu-local-heygen-${os.hostname()}`;
        // Query task leases, not just the heartbeat: duplicate legacy processes
        // previously overwrote the same heartbeat with an incorrect idle status.
        const client = await pool.connect();
        let ready = false;
        try {
          await client.query('begin');
          await client.query("set local lock_timeout = '2s'");
          await client.query('lock table local_agent_tasks in access exclusive mode');
          const tasks = await client.query("select count(*)::int as count from local_agent_tasks where agent_id=$1 and status='leased'", [id]);
          const nodes = await client.query("select active_task_count, last_seen_at from local_agent_nodes where agent_id=$1", [id]);
          const legacy = nodes.rows[0];
          ready = tasks.rows[0].count === 0 && legacy?.active_task_count === 0 && Date.now() - Date.parse(legacy.last_seen_at) < 45000;
          if (ready) {
            await exec('/bin/launchctl', ['bootout', service]);
            await exec('/bin/launchctl', ['disable', service]);
            fs.appendFileSync(path.join(os.homedir(), '.xiaogu-agent/logs/host-agent-management.jsonl'), JSON.stringify({ at: new Date().toISOString(), environment: 'development', action: 'legacy-handover', reason: 'Authorized environment migration after active jobs finished' }) + '\n');
          }
          await client.query('commit');
        } catch (error) { await client.query('rollback'); throw error; }
        finally { client.release(); }
        if (ready) { console.log('[host-agent] Legacy jobs completed; development handover complete'); break; }
        console.log('[host-agent] Waiting for the active legacy development job to complete');
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    } finally { await pool.end(); }
  }
  // Keep credentials in the existing user login stores; isolate job files and
  // process identities, without copying or printing account credentials.
  const home = os.homedir();
  for (const key of Object.keys(process.env)) {
    if (/^(LOCAL_AGENT_|PPT_|HEYGEN_|CODEX_CLI_|OPENCHATCUT_|VIRAL_|DOUYIN_)/.test(key) || /^(HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|http_proxy|https_proxy|all_proxy)$/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, {
    LOCAL_AGENT_MANAGED_ENV: config.environment,
    LOCAL_AGENT_BASE_URL: config.baseUrl,
    LOCAL_AGENT_EXECUTOR_URL: config.baseUrl,
    LOCAL_AGENT_TOKEN: token,
    LOCAL_AGENT_ID: config.agentId,
    LOCAL_AGENT_CAPABILITIES: config.environment === 'production' ? 'ppt.generate,digital-human.video.produce,spoken.voice.clone' : 'heygen.video.generate,digital-human.video.produce,spoken.voice.clone',
    LOCAL_AGENT_VERSION: config.version,
    LOCAL_AGENT_READY_FILE: path.join(state, 'ready'),
    LOCAL_AGENT_HEYGEN_WORKDIR: path.join(state, 'heygen'),
    LOCAL_AGENT_PPT_WORKDIR: path.join(state, 'ppt'),
    LOCAL_AGENT_VIDEO_WORKDIR: path.join(state, 'video'),
    CODEX_CLI_BIN: path.join(home, '.local/bin/codex'),
    HEYGEN_CLI_BIN: path.join(home, '.local/bin/heygen'),
    HEYGEN_CLI_PROXY_URL: config.codexProxy || 'socks5h://127.0.0.1:7890',
    CODEX_CLI_MODEL: 'gpt-5.6-terra',
    CODEX_CLI_PROXY_URL: config.codexProxy || 'http://127.0.0.1:7890',
    PPT_TASK_TIMEOUT_MS: '1800000',
    TMPDIR: path.join(state, 'tmp'),
    PATH: `${home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
  });
  for (const directory of [process.env.TMPDIR, process.env.LOCAL_AGENT_VIDEO_WORKDIR]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  process.chdir(config.workerRoot);
  await import(pathToFileURL(path.join(config.workerRoot, 'scripts/local-agent.mjs')).href);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[host-agent] ${error.message}`); process.exitCode = 1; });
}
