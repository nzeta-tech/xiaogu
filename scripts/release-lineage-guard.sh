#!/usr/bin/env bash
set -euo pipefail

repo_path=${1:?Usage: release-lineage-guard.sh <repo-path> <production-sha> <candidate-sha>}
production_sha=${2:?Usage: release-lineage-guard.sh <repo-path> <production-sha> <candidate-sha>}
candidate_sha=${3:?Usage: release-lineage-guard.sh <repo-path> <production-sha> <candidate-sha>}

git -C "$repo_path" cat-file -e "${production_sha}^{commit}" 2>/dev/null || {
  echo "Production SHA is not available in the candidate repository: $production_sha" >&2
  exit 1
}
git -C "$repo_path" cat-file -e "${candidate_sha}^{commit}" 2>/dev/null || {
  echo "Candidate SHA is not a commit: $candidate_sha" >&2
  exit 1
}

allow_override=${XIAOGU_ALLOW_NON_FORWARD_RELEASE:-0}
override_reason=${XIAOGU_NON_FORWARD_RELEASE_REASON:-}
lineage_result=forward
if ! git -C "$repo_path" merge-base --is-ancestor "$production_sha" "$candidate_sha"; then
  if [[ "$allow_override" != 1 || -z "$override_reason" ]]; then
    echo "Blocked non-forward production release: $candidate_sha is not a descendant of $production_sha" >&2
    echo "Merge the current production SHA into the candidate. Emergency overrides require XIAOGU_ALLOW_NON_FORWARD_RELEASE=1 and XIAOGU_NON_FORWARD_RELEASE_REASON." >&2
    git -C "$repo_path" log --oneline --max-count=20 "$candidate_sha..$production_sha" >&2 || true
    exit 1
  fi
  lineage_result=override
  echo "[xiaogu-deploy] WARNING: authorized non-forward release: $override_reason" >&2
fi

deleted_protected=()
while IFS=$'\t' read -r status file_path; do
  [[ "$status" == D* ]] || continue
  case "$file_path" in
    migrations/*|src/app/api/*|src/app/today/*|scripts/regression-*|src/instrumentation.ts|src/lib/*/*scheduler*|src/lib/topics/*)
      deleted_protected+=("$file_path")
      ;;
  esac
done < <(git -C "$repo_path" diff --name-status "$production_sha..$candidate_sha")

if (( ${#deleted_protected[@]} > 0 )); then
  if [[ "${XIAOGU_ALLOW_CAPABILITY_REMOVAL:-0}" != 1 || -z "${XIAOGU_CAPABILITY_REMOVAL_REASON:-}" ]]; then
    echo "Blocked release because protected capability files would be deleted:" >&2
    printf '  %s\n' "${deleted_protected[@]}" >&2
    echo "Reviewed removals require XIAOGU_ALLOW_CAPABILITY_REMOVAL=1 and XIAOGU_CAPABILITY_REMOVAL_REASON." >&2
    exit 1
  fi
  echo "[xiaogu-deploy] WARNING: authorized capability removal: ${XIAOGU_CAPABILITY_REMOVAL_REASON}" >&2
fi

printf '[xiaogu-deploy] lineage=%s production_sha=%s candidate_sha=%s protected_deletions=%s\n' \
  "$lineage_result" \
  "$(git -C "$repo_path" rev-parse --short=12 "$production_sha")" \
  "$(git -C "$repo_path" rev-parse --short=12 "$candidate_sha")" \
  "${#deleted_protected[@]}"
