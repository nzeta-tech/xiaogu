#!/usr/bin/env python3
"""Manage only the named host media worker; never act on Docker or other envs."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import time

HOME = Path.home()
ROOT = HOME / '.xiaogu-agent'
REPO = Path(__file__).resolve().parents[1]
DOMAIN = f'gui/{os.getuid()}'
CONTROL_PROXY = 'http://127.0.0.1:7890'


def run(args, check=True, **kwargs):
    return subprocess.run([str(a) for a in args], check=check, **kwargs)


def node_env():
    env = os.environ.copy()
    env.update(NODE_USE_ENV_PROXY='1', HTTP_PROXY=CONTROL_PROXY, HTTPS_PROXY=CONTROL_PROXY,
               ALL_PROXY=CONTROL_PROXY, NO_PROXY='127.0.0.1,localhost,::1')
    return env


def loaded(label):
    return run(['launchctl', 'print', f'{DOMAIN}/{label}'], check=False, capture_output=True).returncode == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'start', 'stop', 'restart', 'status'])
    parser.add_argument('--env', required=True, choices=['production', 'development'])
    parser.add_argument('--confirm-production', action='store_true')
    parser.add_argument('--reason', default='')
    parser.add_argument('--release', help='Production install only: verified immutable release SHA')
    parser.add_argument('--drain-legacy', action='store_true', help='Development only: wait for legacy tasks before handing over')
    args = parser.parse_args()
    production = args.env == 'production'
    if args.release and (not production or args.action != 'install' or len(args.release) < 12 or len(args.release) > 40 or any(c not in '0123456789abcdef' for c in args.release)):
        parser.error('--release requires install --env production and a Git SHA')
    if args.drain_legacy and (production or args.action != 'start'):
        parser.error('--drain-legacy is supported only by start --env development')
    if production and args.action in ['stop', 'restart'] and (not args.confirm_production or not args.reason.strip()):
        parser.error('Production stop/restart requires --confirm-production and --reason')
    label = f'ai.nzeta.xiaogu-{args.env}-media-agent'
    legacy = 'ai.nzeta.xiaogu-ppt-agent' if production else 'ai.nzeta.xiaogu-local-spoken-agent'
    config_dir = HOME / '.config/xiaogu-agent'
    config_file = config_dir / f'{args.env}-media.json'
    installed = ROOT / 'bin/host-agent-runtime.mjs'
    plist = HOME / 'Library/LaunchAgents' / f'{label}.plist'
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node.js is required')
    state = ROOT / 'state' / args.env
    state.mkdir(parents=True, exist_ok=True)
    lock_file = (state / 'management.lock').open('a')
    fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if args.action == 'install':
        if loaded(label):
            raise RuntimeError('Stop the target environment before replacing its launcher')
        worker = (ROOT / 'releases' / args.release / 'host-worker').resolve() if args.release else (ROOT / 'current/host-worker').resolve() if production else REPO
        if not (worker / 'scripts/local-agent.mjs').is_file():
            raise RuntimeError('Worker runtime is missing')
        if production:
            if not (worker / 'manifest.sha256').is_file():
                raise RuntimeError('Production immutable manifest is missing')
            result = run(['shasum', '-a', '256', '-c', 'manifest.sha256'], cwd=worker, capture_output=True, check=False)
            if result.returncode:
                raise RuntimeError('Production runtime integrity check failed; use the release workflow')
        config_dir.mkdir(parents=True, exist_ok=True)
        (ROOT / 'bin').mkdir(parents=True, exist_ok=True)
        (ROOT / 'logs' / args.env).mkdir(parents=True, exist_ok=True)
        # Separate copies prevent a development install modifying production launch code.
        installed = ROOT / 'bin' / f'{args.env}-host-agent-runtime.mjs'
        shutil.copyfile((worker if production else REPO) / 'scripts/host-agent-runtime.mjs', installed)
        config = dict(environment=args.env, baseUrl='https://xiaogu.nzeta.ai' if production else 'http://localhost:3000',
                      agentId=f'xiaogu-{"prod" if production else "dev"}-media', workerRoot=str(worker),
                      stateRoot=str(state), version=worker.parent.name if production else 'development',
                      envFiles=[str(config_dir / 'prod.env')] if production else [str(REPO / name) for name in ['.env', '.env.local', '.env.development.local']],
                      controlProxy=CONTROL_PROXY if production else '')
        config_file.write_text(json.dumps(config, indent=2) + '\n')
        config_file.chmod(0o600)
        data = dict(Label=label, ProgramArguments=[node, str(installed), str(config_file), '--run'],
                    RunAtLoad=True, KeepAlive=True, ThrottleInterval=15, ProcessType='Interactive',
                    EnvironmentVariables={'HOME': str(HOME), 'PATH': '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',
                                          'NODE_USE_ENV_PROXY': '1', 'HTTP_PROXY': CONTROL_PROXY, 'HTTPS_PROXY': CONTROL_PROXY,
                                          'ALL_PROXY': CONTROL_PROXY, 'NO_PROXY': '127.0.0.1,localhost,::1'},
                    StandardOutPath=str(ROOT / 'logs' / args.env / 'media-agent.out.log'),
                    StandardErrorPath=str(ROOT / 'logs' / args.env / 'media-agent.err.log'))
        plist.write_bytes(plistlib.dumps(data)); plist.chmod(0o600)
    elif args.action == 'status':
        print(json.dumps({'environment': args.env, 'service': label, 'loaded': loaded(label), 'legacyLoaded': loaded(legacy)}), flush=True)
        if not config_file.exists():
            raise RuntimeError('Environment is not installed')
        result = run([node, ROOT / 'bin' / f'{args.env}-host-agent-runtime.mjs', config_file, '--status'], check=False, env=node_env())
        return result.returncode
    else:
        if not plist.exists():
            raise RuntimeError('Run install for this environment first')
        if args.action in ['stop', 'restart'] and loaded(label):
            # Fail closed on status errors or active jobs before terminating a worker.
            result = run([node, ROOT / 'bin' / f'{args.env}-host-agent-runtime.mjs', config_file, '--status'], check=False, capture_output=True, text=True, env=node_env())
            if result.returncode not in [0, 2]:
                raise RuntimeError('Cannot verify active jobs; refusing to stop')
            status = json.loads(result.stdout)
            if status['activeTasks']:
                raise RuntimeError('Worker has active jobs; wait for completion before stopping')
            run(['launchctl', 'bootout', f'{DOMAIN}/{label}'])
            for _ in range(40):
                if not loaded(label):
                    break
                time.sleep(0.25)
            else:
                raise RuntimeError('Service is still shutting down; do not start a duplicate')
        if args.action in ['start', 'restart']:
            if loaded(legacy) and not args.drain_legacy:
                raise RuntimeError(f'Legacy service {legacy} is running; migrate it explicitly before starting another worker')
            if not loaded(label):
                if args.drain_legacy:
                    config = json.loads(config_file.read_text())
                    config['drainLegacy'] = True
                    config_file.write_text(json.dumps(config, indent=2) + '\n')
                run(['launchctl', 'enable', f'{DOMAIN}/{label}'])
                run(['launchctl', 'bootstrap', DOMAIN, plist])
    with (ROOT / 'logs' / 'host-agent-management.jsonl').open('a') as log:
        log.write(json.dumps({'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'environment': args.env,
                              'action': args.action, 'reason': args.reason, 'pid': os.getpid(), 'parentPid': os.getppid()}) + '\n')
    print(f'{args.env}: {args.action} complete ({label})')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'host-agentctl: {error}', file=sys.stderr)
        sys.exit(1)
