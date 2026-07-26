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
remote_script="$remote_project/.release-set-local-agent-feature-gate.mjs"

rsync -a -e "ssh -i $ssh_key" "$repo_path/scripts/set-local-agent-feature-gate.mjs" "$primary:$remote_script"

ssh -o BatchMode=yes -i "$ssh_key" "$primary" "
  set -eu
  cd '$remote_project'
  container=\$(docker compose -f docker-compose.deployed.yml ps -q app)
  test -n \"\$container\"
  docker cp '$remote_script' \"\$container:/tmp/set-local-agent-feature-gate.mjs\"
  docker exec \"\$container\" node /tmp/set-local-agent-feature-gate.mjs '$action'
  docker exec \"\$container\" rm -f /tmp/set-local-agent-feature-gate.mjs
  rm -f '$remote_script'
"
