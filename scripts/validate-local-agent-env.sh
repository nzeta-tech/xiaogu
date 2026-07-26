#!/usr/bin/env bash
set -euo pipefail

env_file=${1:?Usage: validate-local-agent-env.sh <prod-env-file>}
[[ -f "$env_file" ]] || { echo "Agent env file is missing: $env_file" >&2; exit 1; }

for key in LOCAL_AGENT_BASE_URL LOCAL_AGENT_TOKEN; do
  if ! grep -Eq "^${key}=.+" "$env_file"; then
    echo "Required Agent setting is missing: $key" >&2
    exit 1
  fi
done

forbidden='^(DATABASE_URL|RDS_DATABASE_URL|REDIS_URL|AUTH_SECRET|MODEL_API_KEY|GROQ_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY|OPENAI_IMAGE_API_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|OPENMETER_API_KEY|POSTGRES_PASSWORD)='
if grep -Eq "$forbidden" "$env_file"; then
  echo "Production Agent env contains Web/database credentials; use a dedicated minimal env file." >&2
  exit 1
fi

base_url=$(sed -n 's/^LOCAL_AGENT_BASE_URL=//p' "$env_file" | tail -n 1)
if [[ ! "$base_url" =~ ^https:// ]]; then
  echo "LOCAL_AGENT_BASE_URL must use outbound HTTPS in production." >&2
  exit 1
fi
