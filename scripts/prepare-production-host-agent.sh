#!/usr/bin/env bash
set -euo pipefail
repo_path=${1:?repository required}
version=$(git -C "$repo_path" rev-parse --short=12 HEAD)
[[ -z "$(git -C "$repo_path" status --porcelain)" ]] || { echo 'Host worker requires clean source'; exit 1; }
worker_dir="$HOME/.xiaogu-agent/releases/$version/host-worker"
if [[ -f "$worker_dir/manifest.sha256" ]]; then
  (cd "$worker_dir" && shasum -a 256 -c manifest.sha256 >/dev/null)
  exit 0
fi
mkdir -p "$worker_dir/scripts"
cp "$repo_path/scripts/local-agent.mjs" "$repo_path/scripts/host-agent-runtime.mjs" "$repo_path"/scripts/spoken-*.mjs "$worker_dir/scripts/"
printf '{"private":true,"dependencies":{"sharp":"0.34.5"}}\n' > "$worker_dir/package.json"
npm install --prefix "$worker_dir" --omit=dev --no-audit --no-fund >/dev/null
(cd "$worker_dir" && node -e 'require("sharp")' && find . -type f ! -name manifest.sha256 -exec shasum -a 256 {} + > manifest.sha256)
echo "Host worker prepared: $version"
