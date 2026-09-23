#!/usr/bin/env bash
set -euo pipefail
repo_path=$(cd -- "$(dirname -- "$0")/.." && pwd)
echo 'Legacy PPT entry point: install the production media worker; no automatic stop/restart.'
exec python3 "$repo_path/scripts/host-agentctl.py" install --env production
