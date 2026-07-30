#!/usr/bin/env bash
set -euo pipefail

repo_path=$(cd -- "$(dirname -- "$0")/.." && pwd)
plist_source="$repo_path/deploy/ai.nzeta.xiaogu-ppt-agent.plist"
plist_target="$HOME/Library/LaunchAgents/ai.nzeta.xiaogu-ppt-agent.plist"
agent_bin="$HOME/.xiaogu-agent/bin"
service="gui/$(id -u)/ai.nzeta.xiaogu-ppt-agent"

[[ -f "$plist_source" ]] || { echo "PPT Agent launchd template is missing: $plist_source" >&2; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.xiaogu-agent/logs" "$agent_bin"
launchctl bootout "$service" 2>/dev/null || true
install -m 755 "$repo_path/scripts/run-production-ppt-agent.sh" "$agent_bin/run-production-ppt-agent.sh"
install -m 644 "$repo_path/scripts/local-agent.mjs" "$agent_bin/ppt-local-agent.mjs"
install -m 644 "$plist_source" "$plist_target"
launchctl bootstrap "gui/$(id -u)" "$plist_target"
launchctl kickstart -k "$service"
echo "[xiaogu-ppt-agent] launchd service installed"
