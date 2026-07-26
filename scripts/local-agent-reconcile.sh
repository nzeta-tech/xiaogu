#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

release_root=${XIAOGU_AGENT_RELEASE_ROOT:-"$HOME/.xiaogu-agent"}
env_file=${XIAOGU_AGENT_ENV_FILE:-"$HOME/.config/xiaogu-agent/prod.env"}
current_dir="$release_root/current"
release_env="$current_dir/release.env"

if ! docker info >/dev/null 2>&1; then
  open -gja Docker 2>/dev/null || true
  echo "[xiaogu-agent] Docker Desktop is starting; launchd will retry." >&2
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  echo "[xiaogu-agent] production env file is missing: $env_file" >&2
  exit 1
fi
"$(dirname "$0")/validate-local-agent-env.sh" "$env_file"
if [[ ! -f "$current_dir/docker-compose.local-agent.yml" || ! -f "$current_dir/docker-compose.local-agent.prod.yml" || ! -f "$release_env" ]]; then
  echo "[xiaogu-agent] current release is incomplete: $current_dir" >&2
  exit 1
fi

export XIAOGU_AGENT_ENV_FILE="$env_file"
compose=(docker compose --env-file "$release_env" --env-file "$env_file" -f "$current_dir/docker-compose.local-agent.yml" -f "$current_dir/docker-compose.local-agent.prod.yml")
"${compose[@]}" up -d --no-build --remove-orphans

container_id=$("${compose[@]}" ps -q local-agent)
if [[ -z "$container_id" ]]; then
  echo "[xiaogu-agent] local-agent container was not created" >&2
  exit 1
fi

health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
if [[ "$health" == "unhealthy" || "$health" == "exited" || "$health" == "dead" ]]; then
  echo "[xiaogu-agent] unhealthy state detected; restarting local-agent" >&2
  "${compose[@]}" restart local-agent
fi
