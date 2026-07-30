#!/usr/bin/env bash
set -euo pipefail

env_file=${XIAOGU_AGENT_ENV_FILE:-"$HOME/.config/xiaogu-agent/prod.env"}
node_bin=${NODE_BIN:-/usr/local/bin/node}
codex_bin=${CODEX_CLI_BIN:-/Applications/ChatGPT.app/Contents/Resources/codex}
agent_script=${PPT_AGENT_SCRIPT_PATH:-"$HOME/.xiaogu-agent/bin/ppt-local-agent.mjs"}

[[ -f "$env_file" ]] || { echo "[xiaogu-ppt-agent] production env is missing: $env_file" >&2; exit 1; }
[[ -x "$node_bin" ]] || { echo "[xiaogu-ppt-agent] Node.js is unavailable: $node_bin" >&2; exit 1; }
[[ -x "$codex_bin" ]] || { echo "[xiaogu-ppt-agent] Codex CLI is unavailable: $codex_bin" >&2; exit 1; }
[[ -f "$agent_script" ]] || { echo "[xiaogu-ppt-agent] Agent runtime is unavailable: $agent_script" >&2; exit 1; }

set -a
# The shared production Agent env supplies only the public URL and scoped token.
source "$env_file"
set +a

export LOCAL_AGENT_ID=${PPT_AGENT_ID:-macbook-ppt}
export LOCAL_AGENT_VERSION=${PPT_AGENT_VERSION:-$(basename "$(readlink "$HOME/.xiaogu-agent/current")")}
export LOCAL_AGENT_CAPABILITIES=ppt.generate
export LOCAL_AGENT_EXECUTOR_URL=${LOCAL_AGENT_EXECUTOR_URL:-$LOCAL_AGENT_BASE_URL}
export CODEX_CLI_BIN="$codex_bin"
# Codex invokes the companion `rg` binary while working. The ChatGPT.app
# bundle is not on launchd's default PATH, so make the bundled tools visible.
export PATH="$(dirname "$codex_bin"):$PATH"
export CODEX_CLI_MODEL=${CODEX_CLI_MODEL:-gpt-5.6-sol}
export CODEX_CLI_PROXY_URL=${CODEX_CLI_PROXY_URL:-http://127.0.0.1:7890}
export PPT_TASK_TIMEOUT_MS=${PPT_TASK_TIMEOUT_MS:-600000}

exec "$node_bin" "$agent_script"
