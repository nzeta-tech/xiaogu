#!/usr/bin/env bash
set -euo pipefail

repo_path=${1:?Usage: production-migration-runner.sh <repo-path>}
ssh_key=${XIAOGU_SSH_KEY:-/Users/a2251/Downloads/router.pem}
primary=${XIAOGU_PRIMARY_SSH:-ubuntu@16.176.34.69}
remote_project=${XIAOGU_REMOTE_PROJECT:-/home/ubuntu/insurance-content-agent}
remote_stage="$remote_project/.release-migrations"

ssh -o BatchMode=yes -i "$ssh_key" "$primary" "mkdir -p '$remote_stage/migrations'"
rsync -a --delete -e "ssh -i $ssh_key" "$repo_path/migrations/" "$primary:$remote_stage/migrations/"
rsync -a -e "ssh -i $ssh_key" "$repo_path/scripts/migrate.mjs" "$primary:$remote_stage/migrate.mjs"

ssh -o BatchMode=yes -i "$ssh_key" "$primary" "
  set -eu
  cd '$remote_project'
  container=\$(docker compose -f docker-compose.deployed.yml ps -q app)
  test -n \"\$container\"
  docker exec \"\$container\" rm -rf /tmp/xiaogu-release-migrations
  docker cp '$remote_stage' \"\$container:/tmp/xiaogu-release-migrations\"
  docker exec -w /tmp/xiaogu-release-migrations \"\$container\" node migrate.mjs
  docker exec \"\$container\" rm -rf /tmp/xiaogu-release-migrations
  rm -rf '$remote_stage'
"
