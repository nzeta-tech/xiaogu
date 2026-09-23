#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 7 ]]; then
  echo "Usage: $0 <repo-path> <candidate-sha> <ssh-key> <ssh-target> <remote-project> <compose-file> <service>" >&2
  exit 2
fi

repo_path=$1
candidate_sha=$2
ssh_key=$3
ssh_target=$4
remote_project=$5
compose_file=$6
service_name=$7

# Query the running app container so the check uses the exact database selected
# by the production Compose environment. Never print DATABASE_URL or row data.
applied_versions=$(ssh -o BatchMode=yes -i "$ssh_key" "$ssh_target" bash -s -- "$remote_project" "$compose_file" "$service_name" <<'REMOTE'
set -euo pipefail
remote_project=$1
compose_file=$2
service_name=$3
cd "$remote_project"
docker compose -f "$compose_file" exec -T -w /app "$service_name" node -e '
const { Pool } = require("pg");
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query("select version from schema_migrations order by version");
    for (const row of result.rows) console.log(row.version);
  } finally {
    await pool.end();
  }
})().catch((error) => { console.error("Migration inventory query failed:", error.code || error.message); process.exitCode = 1; });'
REMOTE
)

printf '%s\n' "$applied_versions" | node "$repo_path/scripts/release-migration-inventory.mjs" "$repo_path" "$candidate_sha"
