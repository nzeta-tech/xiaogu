#!/bin/sh
set -eu

ready_file="${LOCAL_AGENT_READY_FILE:-/tmp/local-agent.ready}"
test -s "$ready_file"

now="$(date +%s)"
modified="$(stat -c %Y "$ready_file")"
max_age="${LOCAL_AGENT_HEALTH_MAX_AGE_SECONDS:-60}"
test "$((now - modified))" -le "$max_age"

wget -qO- http://127.0.0.1:3000/api/internal/local-agent/executor-health >/dev/null
wget -qO- "${VIRAL_TRANSCRIBE_API_BASE:-http://transcriber:8000}/health" >/dev/null
wget -qO- "http://127.0.0.1:${CONTAINER_BROWSER_CDP_PORT:-9222}/json/version" >/dev/null
wget -qO- "${VIRAL_WECHAT_DISCOVERY_API_BASE:-http://wx-channel:2026}/api/v1/certificate/download" >/dev/null
yt-dlp --version >/dev/null
