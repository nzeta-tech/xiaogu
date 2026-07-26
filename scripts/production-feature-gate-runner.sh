#!/usr/bin/env bash
set -euo pipefail

action=${1:?Usage: production-feature-gate-runner.sh <enable|disable|status>}
case "$action" in
  enable|disable|status) ;;
  *) echo "Unsupported feature-gate action: $action" >&2; exit 1 ;;
esac

repo_path=$(cd -- "$(dirname -- "$0")/.." && pwd)
ssh_key=${XIAOGU_SSH_KEY:-/Users/a2251/Downloads/router.pem}
primary=${XIAOGU_PRIMARY_SSH:-ubuntu@16.176.34.69}
remote_project=${XIAOGU_REMOTE_PROJECT:-/home/ubuntu/insurance-content-agent}

database_url=$(ssh -o BatchMode=yes -i "$ssh_key" "$primary" \
  "cd '$remote_project' && docker compose -f docker-compose.deployed.yml exec -T app printenv DATABASE_URL")
[[ -n "$database_url" ]] || { echo "Production DATABASE_URL is unavailable" >&2; exit 1; }

export RDS_DATABASE_URL="$database_url"
cd "$repo_path"
node scripts/set-local-agent-feature-gate.mjs "$action"
