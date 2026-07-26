#!/usr/bin/env bash
set -euo pipefail

repo_path=$(cd -- "$(dirname -- "$0")/.." && pwd)
release_root=${XIAOGU_AGENT_RELEASE_ROOT:-"$HOME/.xiaogu-agent"}
bin_dir="$release_root/bin"
log_dir="$release_root/logs"
agent_dir="$HOME/Library/LaunchAgents"
label="ai.nzeta.xiaogu-local-agent"
plist="$agent_dir/$label.plist"

mkdir -p "$bin_dir" "$log_dir" "$agent_dir"
install -m 755 "$repo_path/scripts/local-agent-reconcile.sh" "$bin_dir/local-agent-reconcile.sh"
install -m 755 "$repo_path/scripts/validate-local-agent-env.sh" "$bin_dir/validate-local-agent-env.sh"

tmp_plist=$(mktemp "${TMPDIR:-/tmp}/xiaogu-agent-plist.XXXXXX")
trap 'rm -f "$tmp_plist"' EXIT
sed \
  -e "s|__LABEL__|$label|g" \
  -e "s|__PROGRAM__|$bin_dir/local-agent-reconcile.sh|g" \
  -e "s|__STDOUT__|$log_dir/launchd.out.log|g" \
  -e "s|__STDERR__|$log_dir/launchd.err.log|g" \
  "$repo_path/docker/launchd/xiaogu-local-agent.plist.template" > "$tmp_plist"
install -m 600 "$tmp_plist" "$plist"

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
launchctl kickstart -k "gui/$(id -u)/$label"
echo "[xiaogu-agent] launchd installed: $plist"
