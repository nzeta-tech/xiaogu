#!/usr/bin/env bash
set -euo pipefail
config="$HOME/.config/xiaogu-agent/production-media.json"
runtime="$HOME/.xiaogu-agent/bin/production-host-agent-runtime.mjs"
[[ -f "$config" && -f "$runtime" ]] || { echo 'Install the production media worker via scripts/host-agentctl.py first.' >&2; exit 1; }
exec /usr/local/bin/node "$runtime" "$config" --run
