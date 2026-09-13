#!/usr/bin/env bash
set -euo pipefail

script_path=$(cd -- "$(dirname -- "$0")" && pwd)/release-lineage-guard.sh
fixture_root=$(mktemp -d "${TMPDIR:-/tmp}/xiaogu-lineage-test.XXXXXX")
trap 'rm -rf "$fixture_root"' EXIT

git -C "$fixture_root" init -q
git -C "$fixture_root" config user.email release-test@xiaogu.invalid
git -C "$fixture_root" config user.name xiaogu-release-test
mkdir -p "$fixture_root/src/app/today"
printf 'v1\n' > "$fixture_root/src/app/today/page.tsx"
git -C "$fixture_root" add .
git -C "$fixture_root" commit -qm baseline
baseline=$(git -C "$fixture_root" rev-parse HEAD)

printf 'v2\n' > "$fixture_root/forward.txt"
git -C "$fixture_root" add .
git -C "$fixture_root" commit -qm forward
forward=$(git -C "$fixture_root" rev-parse HEAD)
"$script_path" "$fixture_root" "$baseline" "$forward" >/dev/null

git -C "$fixture_root" switch -q --detach "$baseline"
printf 'branch\n' > "$fixture_root/divergent.txt"
git -C "$fixture_root" add .
git -C "$fixture_root" commit -qm divergent
divergent=$(git -C "$fixture_root" rev-parse HEAD)
if "$script_path" "$fixture_root" "$forward" "$divergent" >/dev/null 2>&1; then
  echo "Expected divergent release to fail" >&2
  exit 1
fi
XIAOGU_ALLOW_NON_FORWARD_RELEASE=1 XIAOGU_NON_FORWARD_RELEASE_REASON=test \
  "$script_path" "$fixture_root" "$forward" "$divergent" >/dev/null

git -C "$fixture_root" switch -q --detach "$forward"
git -C "$fixture_root" rm -q src/app/today/page.tsx
git -C "$fixture_root" commit -qm remove-today
removal=$(git -C "$fixture_root" rev-parse HEAD)
if "$script_path" "$fixture_root" "$forward" "$removal" >/dev/null 2>&1; then
  echo "Expected protected capability removal to fail" >&2
  exit 1
fi
XIAOGU_ALLOW_CAPABILITY_REMOVAL=1 XIAOGU_CAPABILITY_REMOVAL_REASON=test \
  "$script_path" "$fixture_root" "$forward" "$removal" >/dev/null

echo "release lineage guard tests passed"
