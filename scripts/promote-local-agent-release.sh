#!/usr/bin/env bash
set -euo pipefail

repo_path=$(cd -- "$(dirname -- "$0")/.." && pwd)
release_root=${XIAOGU_AGENT_RELEASE_ROOT:-"$HOME/.xiaogu-agent"}
env_file=${XIAOGU_AGENT_ENV_FILE:-"$HOME/.config/xiaogu-agent/prod.env"}
version=${1:-$(git -C "$repo_path" rev-parse --short=12 HEAD)}
release_dir="$release_root/releases/$version"

if [[ ! "$version" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "[xiaogu-agent] invalid release version: $version" >&2
  exit 1
fi
if [[ ! -f "$env_file" ]]; then
  echo "[xiaogu-agent] production env file is missing: $env_file" >&2
  exit 1
fi
"$repo_path/scripts/validate-local-agent-env.sh" "$env_file"

export LOCAL_AGENT_IMAGE="xiaogu/local-agent:$version"
export LOCAL_AGENT_TRANSCRIBER_IMAGE="xiaogu/transcriber:$version"
export LOCAL_AGENT_WX_CHANNEL_IMAGE="xiaogu/wx-channel:$version"
export LOCAL_AGENT_VERSION="$version"
export XIAOGU_AGENT_ENV_FILE="$env_file"

for image in "$LOCAL_AGENT_IMAGE" "$LOCAL_AGENT_TRANSCRIBER_IMAGE" "$LOCAL_AGENT_WX_CHANNEL_IMAGE"; do
  docker image inspect "$image" >/dev/null 2>&1 || {
    echo "[xiaogu-agent] tested release image is missing; build it before promotion: $image" >&2
    exit 1
  }
done
docker compose --env-file "$env_file" -f "$repo_path/docker-compose.local-agent.yml" -f "$repo_path/docker-compose.local-agent.prod.yml" config >/dev/null

candidate_manifest=$(mktemp "${TMPDIR:-/tmp}/xiaogu-agent-manifest.XXXXXX")
trap 'rm -f "$candidate_manifest"' EXIT
{
  printf 'version=%s\n' "$version"
  printf 'web_protocol=%s\n' "${LOCAL_AGENT_PROTOCOL_VERSION:-1}"
  docker image inspect --format '{{.RepoTags}} {{.Id}}' "$LOCAL_AGENT_IMAGE" "$LOCAL_AGENT_TRANSCRIBER_IMAGE" "$LOCAL_AGENT_WX_CHANNEL_IMAGE"
} > "$candidate_manifest"

if [[ -f "$release_dir/manifest.txt" ]]; then
  cmp -s "$candidate_manifest" "$release_dir/manifest.txt" || {
    echo "[xiaogu-agent] refusing to overwrite release $version with different image digests" >&2
    exit 1
  }
  for release_file in docker-compose.local-agent.yml docker-compose.local-agent.prod.yml release.env; do
    [[ -f "$release_dir/$release_file" ]] || { echo "[xiaogu-agent] existing release is incomplete: $release_dir" >&2; exit 1; }
  done
else
  mkdir -p "$release_dir"
  install -m 644 "$repo_path/docker-compose.local-agent.yml" "$release_dir/docker-compose.local-agent.yml"
  install -m 644 "$repo_path/docker-compose.local-agent.prod.yml" "$release_dir/docker-compose.local-agent.prod.yml"
  {
    printf 'LOCAL_AGENT_IMAGE=%s\n' "$LOCAL_AGENT_IMAGE"
    printf 'LOCAL_AGENT_TRANSCRIBER_IMAGE=%s\n' "$LOCAL_AGENT_TRANSCRIBER_IMAGE"
    printf 'LOCAL_AGENT_WX_CHANNEL_IMAGE=%s\n' "$LOCAL_AGENT_WX_CHANNEL_IMAGE"
    printf 'LOCAL_AGENT_VERSION=%s\n' "$LOCAL_AGENT_VERSION"
  } > "$release_dir/release.env"
  install -m 644 "$candidate_manifest" "$release_dir/manifest.txt"
fi

mkdir -p "$release_root"
next_link="$release_root/.current-$version"
ln -sfn "$release_dir" "$next_link"
mv -fh "$next_link" "$release_root/current"
"$repo_path/scripts/local-agent-reconcile.sh"
echo "[xiaogu-agent] promoted $version from tested local images"
