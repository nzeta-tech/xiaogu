#!/usr/bin/env bash
set -euo pipefail

repo_path=${1:?Usage: production-migration-runner.sh <repo-path>}
ssh_key=${XIAOGU_SSH_KEY:-/Users/a2251/Downloads/router.pem}
primary=${XIAOGU_PRIMARY_SSH:-ubuntu@16.176.34.69}
remote_project=${XIAOGU_REMOTE_PROJECT:-/home/ubuntu/insurance-content-agent}

database_url=$(ssh -o BatchMode=yes -i "$ssh_key" "$primary" \
  "cd '$remote_project' && docker compose -f docker-compose.deployed.yml exec -T app printenv DATABASE_URL")
[[ -n "$database_url" ]] || { echo "Production DATABASE_URL is unavailable" >&2; exit 1; }

export DATABASE_URL="$database_url"
cd "$repo_path"
node scripts/migrate.mjs
