#!/usr/bin/env bash

set -euo pipefail

MONITOR_ENV_FILE="${MONITOR_ENV_FILE:-/etc/xiaogu-monitor/monitor.env}"
if [[ -f "$MONITOR_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$MONITOR_ENV_FILE"
  set +a
fi

BASE_URL="${BASE_URL:-https://xiaogu.nzeta.ai}"
HOME_URL="${HOME_URL:-${BASE_URL}/}"
LOGIN_URL="${LOGIN_URL:-${BASE_URL}/login}"
READINESS_URL="${READINESS_URL:-${BASE_URL}/api/system/readiness}"
PUBLIC_CONFIG_URL="${PUBLIC_CONFIG_URL:-${BASE_URL}/api/system/public-config}"
EXPECTED_HOME_HTTP_CODE="${EXPECTED_HOME_HTTP_CODE:-302}"
EXPECTED_HOME_LOCATION="${EXPECTED_HOME_LOCATION:-/login}"
EXPECTED_LOGIN_HTTP_CODE="${EXPECTED_LOGIN_HTTP_CODE:-200}"
EXPECTED_LOGIN_CONTENT_TYPE="${EXPECTED_LOGIN_CONTENT_TYPE:-text/html}"
EXPECTED_READINESS_HTTP_CODE="${EXPECTED_READINESS_HTTP_CODE:-200}"
EXPECTED_PUBLIC_HTTP_CODE="${EXPECTED_PUBLIC_HTTP_CODE:-200}"
EXPECTED_SITE_NAME="${EXPECTED_SITE_NAME:-小谷}"
REQUEST_TIMEOUT_SECONDS="${REQUEST_TIMEOUT_SECONDS:-20}"
DINGTALK_WEBHOOK="${DINGTALK_WEBHOOK:-}"
DINGTALK_SECRET="${DINGTALK_SECRET:-}"
DINGTALK_KEYWORD="${DINGTALK_KEYWORD:-小谷告警}"
MONITOR_SOURCE="${MONITOR_SOURCE:-$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo unknown-host)}"
STATE_DIR="${STATE_DIR:-/var/lib/xiaogu-monitor}"
UPTIME_STATE_FILE="${UPTIME_STATE_FILE:-$STATE_DIR/uptime.state}"
BUSINESS_ERROR_STATE_FILE="${BUSINESS_ERROR_STATE_FILE:-$STATE_DIR/business.state}"
NEW_USERS_CURSOR_FILE="${NEW_USERS_CURSOR_FILE:-$STATE_DIR/new-users.cursor}"
PAID_ORDERS_CURSOR_FILE="${PAID_ORDERS_CURSOR_FILE:-$STATE_DIR/paid-orders.cursor}"
FAILED_ORDERS_CURSOR_FILE="${FAILED_ORDERS_CURSOR_FILE:-$STATE_DIR/failed-orders.cursor}"
PENDING_ORDER_ALERTED_FILE="${PENDING_ORDER_ALERTED_FILE:-$STATE_DIR/pending-orders.alerted}"
MODEL_FAILURE_ALERTED_FILE="${MODEL_FAILURE_ALERTED_FILE:-$STATE_DIR/model-failures.alerted}"
PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/insurance-content-agent}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
DB_CONTAINER="${DB_CONTAINER:-insurance-content-agent-postgres-1}"
DB_NAME="${DB_NAME:-insurance_content_agent}"
DB_USER="${DB_USER:-postgres}"
NEW_USERS_ENABLED="${NEW_USERS_ENABLED:-true}"
PAID_ORDERS_ENABLED="${PAID_ORDERS_ENABLED:-true}"
FAILED_ORDERS_ENABLED="${FAILED_ORDERS_ENABLED:-true}"
PENDING_ORDERS_ENABLED="${PENDING_ORDERS_ENABLED:-true}"
PENDING_ORDER_THRESHOLD_MINUTES="${PENDING_ORDER_THRESHOLD_MINUTES:-1}"
BUSINESS_MONITOR_BATCH_LIMIT="${BUSINESS_MONITOR_BATCH_LIMIT:-10}"
MODEL_FAILURES_ENABLED="${MODEL_FAILURES_ENABLED:-true}"
MODEL_FAILURE_WINDOW_MINUTES="${MODEL_FAILURE_WINDOW_MINUTES:-5}"
MODEL_FAILURE_THRESHOLD="${MODEL_FAILURE_THRESHOLD:-1}"
TZ="${TZ:-Asia/Shanghai}"

log() {
  printf '[xiaogu-monitor] %s\n' "$*"
}

usage() {
  cat <<'EOF'
Usage:
  xiaogu-monitor.sh [--check|--test]

Modes:
  --check  Probe the site and inspect business events.
  --test   Send a DingTalk test message immediately.
EOF
}

send_dingtalk() {
  local title="$1"
  local details="$2"

  if [[ -z "$DINGTALK_WEBHOOK" ]]; then
    log "DINGTALK_WEBHOOK is not set"
    return 1
  fi

  DINGTALK_TITLE="$title" DINGTALK_DETAILS="$details" python3 - <<'PY'
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.parse
import urllib.request

webhook = os.environ["DINGTALK_WEBHOOK"].strip()
secret = os.environ.get("DINGTALK_SECRET", "").strip()
keyword = os.environ.get("DINGTALK_KEYWORD", "小谷告警").strip()
title = os.environ["DINGTALK_TITLE"].strip()
details = os.environ["DINGTALK_DETAILS"].strip()

timestamp_ms = str(round(time.time() * 1000))
if secret:
    string_to_sign = f"{timestamp_ms}\n{secret}".encode("utf-8")
    sign = base64.b64encode(
        hmac.new(secret.encode("utf-8"), string_to_sign, digestmod=hashlib.sha256).digest()
    ).decode("utf-8")
    separator = "&" if "?" in webhook else "?"
    webhook = f"{webhook}{separator}timestamp={timestamp_ms}&sign={urllib.parse.quote(sign)}"

payload = {
    "msgtype": "text",
    "text": {
        "content": "\n".join([keyword, title, details]),
    },
}

request = urllib.request.Request(
    webhook,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urllib.request.urlopen(request, timeout=20) as response:
    body = response.read().decode("utf-8", errors="replace")
    result = json.loads(body)
    if result.get("errcode") not in (0, "0"):
        raise SystemExit(f"DingTalk returned errcode={result.get('errcode')}: {result.get('errmsg')}")
PY
}

read_state() {
  local file="$1"
  local default_value="$2"
  if [[ -f "$file" ]]; then
    cat "$file"
  else
    printf '%s' "$default_value"
  fi
}

write_state() {
  local file="$1"
  local value="$2"
  mkdir -p "$STATE_DIR"
  printf '%s' "$value" >"$file"
}

read_cursor() {
  read_state "$1" $'1970-01-01T00:00:00.000000Z\t00000000-0000-0000-0000-000000000000'
}

write_cursor() {
  local file="$1"
  local ts="$2"
  local id="$3"
  write_state "$file" "$(printf '%s\t%s' "$ts" "$id")"
}

feature_enabled() {
  case "${1,,}" in
    false|0|off|disabled|no)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

psql_query() {
  local sql="$1"
  local monitor_database_url="${MONITOR_DATABASE_URL:-}"
  if [[ -n "$monitor_database_url" ]]; then
    # node-postgres accepts sslmode=no-verify, while libpq/psql requires the
    # equivalent non-verifying TLS mode to be spelled sslmode=require.
    monitor_database_url="${monitor_database_url//sslmode=no-verify/sslmode=require}"
    docker exec "$DB_CONTAINER" \
      psql "$monitor_database_url" -X -v ON_ERROR_STOP=1 -At -F $'\t' -c "$sql"
    return
  fi

  (
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
    monitor_database_url="${RDS_DATABASE_URL:-}"
    if [[ -n "$monitor_database_url" ]]; then
      docker exec "$DB_CONTAINER" \
        psql "$monitor_database_url" -X -v ON_ERROR_STOP=1 -At -F $'\t' -c "$sql"
    else
      docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
        psql -X -v ON_ERROR_STOP=1 -At -F $'\t' -U "$DB_USER" -d "$DB_NAME" -c "$sql"
    fi
  )
}

probe_status() {
  local home_body home_headers login_body login_headers readiness_body readiness_headers public_body public_headers
  home_body="$(mktemp)"
  home_headers="$(mktemp)"
  login_body="$(mktemp)"
  login_headers="$(mktemp)"
  readiness_body="$(mktemp)"
  readiness_headers="$(mktemp)"
  public_body="$(mktemp)"
  public_headers="$(mktemp)"

  local home_http="000" home_exit=0
  local login_http="000" login_exit=0
  local readiness_http="000" readiness_exit=0
  local public_http="000" public_exit=0

  set +e
  home_http="$(curl --http1.1 -sS --connect-timeout 5 --max-time "$REQUEST_TIMEOUT_SECONDS" -D "$home_headers" -o "$home_body" -w '%{http_code}' "$HOME_URL")"
  home_exit="$?"
  login_http="$(curl --http1.1 -sS --connect-timeout 5 --max-time "$REQUEST_TIMEOUT_SECONDS" -D "$login_headers" -o "$login_body" -w '%{http_code}' "$LOGIN_URL")"
  login_exit="$?"
  readiness_http="$(curl --http1.1 -sS --connect-timeout 5 --max-time "$REQUEST_TIMEOUT_SECONDS" -D "$readiness_headers" -o "$readiness_body" -w '%{http_code}' "$READINESS_URL")"
  readiness_exit="$?"
  public_http="$(curl --http1.1 -sS --connect-timeout 5 --max-time "$REQUEST_TIMEOUT_SECONDS" -D "$public_headers" -o "$public_body" -w '%{http_code}' "$PUBLIC_CONFIG_URL")"
  public_exit="$?"
  set -e

  PROBE_HOME_HTTP="$home_http" \
  PROBE_HOME_EXIT="$home_exit" \
  PROBE_HOME_HEADERS="$home_headers" \
  PROBE_HOME_BODY="$home_body" \
  PROBE_LOGIN_HTTP="$login_http" \
  PROBE_LOGIN_EXIT="$login_exit" \
  PROBE_LOGIN_HEADERS="$login_headers" \
  PROBE_LOGIN_BODY="$login_body" \
  PROBE_READINESS_HTTP="$readiness_http" \
  PROBE_READINESS_EXIT="$readiness_exit" \
  PROBE_READINESS_HEADERS="$readiness_headers" \
  PROBE_READINESS_BODY="$readiness_body" \
  PROBE_PUBLIC_HTTP="$public_http" \
  PROBE_PUBLIC_EXIT="$public_exit" \
  PROBE_PUBLIC_HEADERS="$public_headers" \
  PROBE_PUBLIC_BODY="$public_body" \
  PROBE_EXPECTED_HOME_HTTP="$EXPECTED_HOME_HTTP_CODE" \
  PROBE_EXPECTED_HOME_LOCATION="$EXPECTED_HOME_LOCATION" \
  PROBE_EXPECTED_LOGIN_HTTP="$EXPECTED_LOGIN_HTTP_CODE" \
  PROBE_EXPECTED_LOGIN_TYPE="$EXPECTED_LOGIN_CONTENT_TYPE" \
  PROBE_EXPECTED_READINESS_HTTP="$EXPECTED_READINESS_HTTP_CODE" \
  PROBE_EXPECTED_PUBLIC_HTTP="$EXPECTED_PUBLIC_HTTP_CODE" \
  PROBE_EXPECTED_SITE_NAME="$EXPECTED_SITE_NAME" \
  python3 - <<'PY'
import json
import os
from pathlib import Path


def read_text(name: str) -> str:
    return Path(os.environ[name]).read_text(encoding="utf-8", errors="replace")


def first_header_value(headers: str, key: str) -> str:
    for line in headers.splitlines():
        if line.lower().startswith(key.lower() + ":"):
            return line.split(":", 1)[1].strip()
    return ""


home_http = os.environ["PROBE_HOME_HTTP"]
home_exit = int(os.environ["PROBE_HOME_EXIT"])
home_headers = read_text("PROBE_HOME_HEADERS")
home_location = first_header_value(home_headers, "location")
home_ok = home_exit == 0 and home_http == os.environ["PROBE_EXPECTED_HOME_HTTP"] and home_location.endswith(os.environ["PROBE_EXPECTED_HOME_LOCATION"])

login_http = os.environ["PROBE_LOGIN_HTTP"]
login_exit = int(os.environ["PROBE_LOGIN_EXIT"])
login_headers = read_text("PROBE_LOGIN_HEADERS")
login_body = read_text("PROBE_LOGIN_BODY")
login_type = first_header_value(login_headers, "content-type").lower()
login_ok = login_exit == 0 and login_http == os.environ["PROBE_EXPECTED_LOGIN_HTTP"] and os.environ["PROBE_EXPECTED_LOGIN_TYPE"] in login_type

readiness_http = os.environ["PROBE_READINESS_HTTP"]
readiness_exit = int(os.environ["PROBE_READINESS_EXIT"])
readiness_body = read_text("PROBE_READINESS_BODY")
readiness_ok = False
readiness_ready = None
try:
    readiness_payload = json.loads(readiness_body)
    readiness_ready = bool(readiness_payload.get("ready"))
    readiness_ok = readiness_exit == 0 and readiness_http == os.environ["PROBE_EXPECTED_READINESS_HTTP"] and readiness_ready
except Exception:
    readiness_payload = None

public_http = os.environ["PROBE_PUBLIC_HTTP"]
public_exit = int(os.environ["PROBE_PUBLIC_EXIT"])
public_body = read_text("PROBE_PUBLIC_BODY")
public_ok = False
site_name = ""
try:
    public_payload = json.loads(public_body)
    site_name = str(public_payload.get("site", {}).get("siteName", ""))
    public_ok = public_exit == 0 and public_http == os.environ["PROBE_EXPECTED_PUBLIC_HTTP"] and site_name == os.environ["PROBE_EXPECTED_SITE_NAME"]
except Exception:
    public_payload = None

checks = [
    f"home ok={home_ok} http={home_http} location={home_location or 'missing'}",
    f"login ok={login_ok} http={login_http} type={login_type or 'missing'}",
    f"readiness ok={readiness_ok} http={readiness_http} ready={readiness_ready}",
    f"public ok={public_ok} http={public_http} site={site_name or 'missing'}",
]

ok = home_ok and login_ok and readiness_ok and public_ok
error = ""
if not home_ok:
    error = f"home failed: curl={home_exit} http={home_http} location={home_location or 'missing'}"
elif not login_ok:
    error = f"login failed: curl={login_exit} http={login_http} type={login_type or 'missing'}"
elif not readiness_ok:
    error = f"readiness failed: curl={readiness_exit} http={readiness_http} ready={readiness_ready}"
elif not public_ok:
    error = f"public config failed: curl={public_exit} http={public_http} site={site_name or 'missing'}"

preview = " | ".join(checks)[:900]
print("healthy" if ok else "unhealthy")
print(error)
print(preview)
PY

  rm -f "$home_body" "$home_headers" "$login_body" "$login_headers" \
    "$readiness_body" "$readiness_headers" "$public_body" "$public_headers"
}

send_business_summary() {
  local title="$1"
  local details="$2"
  local now
  now="$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S %Z')"
  send_dingtalk "$title" "时间: ${now}
监控来源: ${MONITOR_SOURCE}
${details}"
}

bootstrap_cursor_if_missing() {
  local file="$1"
  local sql="$2"
  if [[ -f "$file" ]]; then
    return 0
  fi

  local latest
  latest="$(psql_query "$sql" 2>&1)" || {
    log "failed to bootstrap cursor for $file: $latest"
    return 1
  }

  local ts id
  ts="$(printf '%s' "$latest" | awk -F $'\t' 'NR==1 {print $1}')"
  id="$(printf '%s' "$latest" | awk -F $'\t' 'NR==1 {print $2}')"
  [[ -n "$ts" ]] || ts="1970-01-01T00:00:00.000000Z"
  [[ -n "$id" ]] || id="00000000-0000-0000-0000-000000000000"
  write_cursor "$file" "$ts" "$id"
}

check_new_users() {
  feature_enabled "$NEW_USERS_ENABLED" || return 0

  bootstrap_cursor_if_missing \
    "$NEW_USERS_CURSOR_FILE" \
    "select coalesce(to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'), '1970-01-01T00:00:00.000000Z'), coalesce(id::text, '00000000-0000-0000-0000-000000000000') from users order by created_at desc, id desc limit 1;" || return 1

  local cursor last_ts last_id sql rows
  cursor="$(read_cursor "$NEW_USERS_CURSOR_FILE")"
  last_ts="$(printf '%s' "$cursor" | awk -F $'\t' '{print $1}')"
  last_id="$(printf '%s' "$cursor" | awk -F $'\t' '{print $2}')"
  sql=$(cat <<EOF
select
  id,
  coalesce(to_char(created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'), ''),
  coalesce(to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
  coalesce(name, ''),
  coalesce(email, ''),
  coalesce(role, ''),
  coalesce(status, '')
from users
where created_at > timestamptz '$last_ts'
   or (created_at = timestamptz '$last_ts' and id::text > '$last_id')
order by created_at asc, id asc
limit $BUSINESS_MONITOR_BATCH_LIMIT;
EOF
)
  rows="$(psql_query "$sql" 2>&1)" || {
    log "new-user query failed: $rows"
    return 1
  }
  [[ -n "$rows" ]] || return 0

  local count last_cursor_ts last_cursor_id summary
  count="$(printf '%s\n' "$rows" | sed '/^$/d' | wc -l | tr -d ' ')"
  last_cursor_ts="$(printf '%s\n' "$rows" | tail -n 1 | awk -F $'\t' '{print $3}')"
  last_cursor_id="$(printf '%s\n' "$rows" | tail -n 1 | awk -F $'\t' '{print $1}')"
  summary=""
  while IFS=$'\t' read -r id created_local created_cursor name email role status; do
    [[ -n "$id" ]] || continue
    summary+="- 用户#${id} | 邮箱:${email:-"-"} | 名称:${name:-"-"} | 角色:${role:-"-"} | 状态:${status:-"-"} | 注册:${created_local}"$'\n'
  done <<<"$rows"
  summary="${summary%$'\n'}"
  send_business_summary "小谷新增用户提醒" "新增用户数: ${count}
${summary}"
  write_cursor "$NEW_USERS_CURSOR_FILE" "$last_cursor_ts" "$last_cursor_id"
}

check_paid_orders() {
  feature_enabled "$PAID_ORDERS_ENABLED" || return 0

  bootstrap_cursor_if_missing \
    "$PAID_ORDERS_CURSOR_FILE" \
    "select coalesce(to_char(coalesce(paid_at, created_at) at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'), '1970-01-01T00:00:00.000000Z'), coalesce(id::text, '00000000-0000-0000-0000-000000000000') from orders where status = 'paid' order by coalesce(paid_at, created_at) desc, id desc limit 1;" || return 1

  local cursor last_ts last_id sql rows
  cursor="$(read_cursor "$PAID_ORDERS_CURSOR_FILE")"
  last_ts="$(printf '%s' "$cursor" | awk -F $'\t' '{print $1}')"
  last_id="$(printf '%s' "$cursor" | awk -F $'\t' '{print $2}')"
  sql=$(cat <<EOF
select
  o.id,
  coalesce(to_char(coalesce(o.paid_at, o.created_at) at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'), ''),
  coalesce(to_char(coalesce(o.paid_at, o.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
  coalesce(u.email, ''),
  coalesce(u.name, ''),
  coalesce(o.provider, ''),
  coalesce(o.status, ''),
  coalesce(o.amount_cents::text, '0'),
  coalesce(o.quota_amount::text, '0')
from orders o
join users u on u.id = o.user_id
where o.status = 'paid'
  and (
    coalesce(o.paid_at, o.created_at) > timestamptz '$last_ts'
    or (coalesce(o.paid_at, o.created_at) = timestamptz '$last_ts' and o.id::text > '$last_id')
  )
order by coalesce(o.paid_at, o.created_at) asc, o.id asc
limit $BUSINESS_MONITOR_BATCH_LIMIT;
EOF
)
  rows="$(psql_query "$sql" 2>&1)" || {
    log "paid-order query failed: $rows"
    return 1
  }
  [[ -n "$rows" ]] || return 0

  local count last_cursor_ts last_cursor_id summary
  count="$(printf '%s\n' "$rows" | sed '/^$/d' | wc -l | tr -d ' ')"
  last_cursor_ts="$(printf '%s\n' "$rows" | tail -n 1 | awk -F $'\t' '{print $3}')"
  last_cursor_id="$(printf '%s\n' "$rows" | tail -n 1 | awk -F $'\t' '{print $1}')"
  summary=""
  while IFS=$'\t' read -r id paid_local paid_cursor email name provider status amount_cents quota_amount; do
    [[ -n "$id" ]] || continue
    summary+="- 订单#${id} | 用户:${email:-"-"} | 名称:${name:-"-"} | 渠道:${provider:-"-"} | 状态:${status:-"-"} | 金额:${amount_cents:-"0"}分 | 积分:${quota_amount:-"0"} | 支付:${paid_local}"$'\n'
  done <<<"$rows"
  summary="${summary%$'\n'}"
  send_business_summary "小谷新增已支付订单提醒" "新增已支付订单数: ${count}
${summary}"
  write_cursor "$PAID_ORDERS_CURSOR_FILE" "$last_cursor_ts" "$last_cursor_id"
}

check_failed_orders() {
  feature_enabled "$FAILED_ORDERS_ENABLED" || return 0

  bootstrap_cursor_if_missing \
    "$FAILED_ORDERS_CURSOR_FILE" \
    "select coalesce(to_char(created_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'), '1970-01-01T00:00:00.000000Z'), coalesce(id::text, '00000000-0000-0000-0000-000000000000') from orders where status = 'failed' order by created_at desc, id desc limit 1;" || return 1

  local cursor last_ts last_id sql rows
  cursor="$(read_cursor "$FAILED_ORDERS_CURSOR_FILE")"
  last_ts="$(printf '%s' "$cursor" | awk -F $'\t' '{print $1}')"
  last_id="$(printf '%s' "$cursor" | awk -F $'\t' '{print $2}')"
  sql=$(cat <<EOF
select
  o.id,
  coalesce(to_char(o.created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'), ''),
  coalesce(to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ''),
  coalesce(u.email, ''),
  coalesce(u.name, ''),
  coalesce(o.provider, ''),
  coalesce(o.amount_cents::text, '0'),
  coalesce(o.quota_amount::text, '0')
from orders o
join users u on u.id = o.user_id
where o.status = 'failed'
  and (
    o.created_at > timestamptz '$last_ts'
    or (o.created_at = timestamptz '$last_ts' and o.id::text > '$last_id')
  )
order by o.created_at asc, o.id asc
limit $BUSINESS_MONITOR_BATCH_LIMIT;
EOF
)
  rows="$(psql_query "$sql" 2>&1)" || {
    log "failed-order query failed: $rows"
    return 1
  }
  [[ -n "$rows" ]] || return 0

  local count last_cursor_ts last_cursor_id summary
  count="$(printf '%s\n' "$rows" | sed '/^$/d' | wc -l | tr -d ' ')"
  last_cursor_ts="$(printf '%s\n' "$rows" | tail -n 1 | awk -F $'\t' '{print $3}')"
  last_cursor_id="$(printf '%s\n' "$rows" | tail -n 1 | awk -F $'\t' '{print $1}')"
  summary=""
  while IFS=$'\t' read -r id created_local created_cursor email name provider amount_cents quota_amount; do
    [[ -n "$id" ]] || continue
    summary+="- 失败订单#${id} | 用户:${email:-"-"} | 名称:${name:-"-"} | 渠道:${provider:-"-"} | 金额:${amount_cents:-"0"}分 | 积分:${quota_amount:-"0"} | 创建:${created_local}"$'\n'
  done <<<"$rows"
  summary="${summary%$'\n'}"
  send_business_summary "小谷订单异常告警" "新增失败订单数: ${count}
${summary}"
  write_cursor "$FAILED_ORDERS_CURSOR_FILE" "$last_cursor_ts" "$last_cursor_id"
}

check_pending_orders() {
  feature_enabled "$PENDING_ORDERS_ENABLED" || return 0

  local rows
  rows="$(psql_query "
select
  o.id,
  coalesce(to_char(o.created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'), ''),
  coalesce(u.email, ''),
  coalesce(u.name, ''),
  coalesce(o.provider, ''),
  coalesce(o.amount_cents::text, '0'),
  coalesce(o.quota_amount::text, '0')
from orders o
join users u on u.id = o.user_id
where o.status = 'pending'
  and o.created_at <= now() - interval '${PENDING_ORDER_THRESHOLD_MINUTES} minute'
order by o.created_at asc, o.id asc
limit $BUSINESS_MONITOR_BATCH_LIMIT;
" 2>&1)" || {
    log "pending-order query failed: $rows"
    return 1
  }
  [[ -n "$rows" ]] || return 0

  touch "$PENDING_ORDER_ALERTED_FILE"
  local summary="" count=0 id created_local email name provider amount_cents quota_amount
  while IFS=$'\t' read -r id created_local email name provider amount_cents quota_amount; do
    [[ -n "$id" ]] || continue
    if grep -qx "$id" "$PENDING_ORDER_ALERTED_FILE"; then
      continue
    fi
    printf '%s\n' "$id" >>"$PENDING_ORDER_ALERTED_FILE"
    count=$((count + 1))
    summary+="- 待支付超时订单#${id} | 用户:${email:-"-"} | 名称:${name:-"-"} | 渠道:${provider:-"-"} | 金额:${amount_cents:-"0"}分 | 积分:${quota_amount:-"0"} | 创建:${created_local}"$'\n'
  done <<<"$rows"

  if (( count > 0 )); then
    summary="${summary%$'\n'}"
    send_business_summary "小谷待支付订单告警" "超时待支付订单数: ${count}
阈值: ${PENDING_ORDER_THRESHOLD_MINUTES} 分钟
${summary}"
  fi
}

check_model_failures() {
  feature_enabled "$MODEL_FAILURES_ENABLED" || return 0

  local window_minutes threshold rows count latest_id latest_time provider model outcome latency error previous_id
  window_minutes="${MODEL_FAILURE_WINDOW_MINUTES//[^0-9]/}"
  threshold="${MODEL_FAILURE_THRESHOLD//[^0-9]/}"
  [[ -n "$window_minutes" && "$window_minutes" -gt 0 ]] || window_minutes=5
  [[ -n "$threshold" && "$threshold" -gt 0 ]] || threshold=1

  rows="$(psql_query "
select
  (select count(*) from model_runtime_events where created_at >= now() - interval '${window_minutes} minute' and outcome in ('error', 'timeout'))::text,
  coalesce(id::text, ''),
  coalesce(to_char(created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'), ''),
  coalesce(provider, ''),
  coalesce(model, ''),
  coalesce(outcome, ''),
  coalesce(latency_ms::text, '0'),
  left(coalesce(error_message, ''), 180)
from model_runtime_events
where created_at >= now() - interval '${window_minutes} minute'
  and outcome in ('error', 'timeout')
order by created_at desc
limit 1;
" 2>&1)" || {
    log "model-failure query failed: $rows"
    return 1
  }
  [[ -n "$rows" ]] || return 0

  IFS=$'\t' read -r count latest_id latest_time provider model outcome latency error <<<"$rows"
  [[ -n "$latest_id" && "$count" -ge "$threshold" ]] || return 0

  previous_id="$(read_state "$MODEL_FAILURE_ALERTED_FILE" "")"
  if [[ -z "$previous_id" ]]; then
    write_state "$MODEL_FAILURE_ALERTED_FILE" "$latest_id"
    log "model-failure alert baseline initialized: $latest_id"
    return 0
  fi
  [[ "$previous_id" == "$latest_id" ]] && return 0

  send_business_summary "小谷模型生成异常告警" "过去 ${window_minutes} 分钟模型失败数: ${count}（阈值: ${threshold}）
最新事件: ${latest_time}
服务商: ${provider:-"-"} · 模型: ${model:-"-"}
结果: ${outcome:-"-"} · 耗时: ${latency:-"0"} ms
错误: ${error:-"-"}"
  write_state "$MODEL_FAILURE_ALERTED_FILE" "$latest_id"
}

run_business_monitor() {
  local previous_state
  previous_state="$(read_state "$BUSINESS_ERROR_STATE_FILE" "ok")"

  if check_new_users && check_paid_orders && check_failed_orders && check_pending_orders; then
    if [[ "$previous_state" == "failed" ]]; then
      send_business_summary "小谷业务监控已恢复" "说明: 新用户/订单相关轮询已恢复正常。"
    fi
    write_state "$BUSINESS_ERROR_STATE_FILE" "ok"
    return 0
  fi

  if [[ "$previous_state" != "failed" ]]; then
    send_business_summary "小谷业务监控异常" "说明: 新用户/订单监控脚本执行失败，请检查日志与数据库连接。"
  fi
  write_state "$BUSINESS_ERROR_STATE_FILE" "failed"
  return 1
}

run_test() {
  local now
  now="$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S %Z')"
  send_dingtalk \
    "小谷监控测试" \
    "时间: ${now}
监控来源: ${MONITOR_SOURCE}
站点地址: ${BASE_URL}
说明: 这是一条手动测试消息，用于验证钉钉机器人可正常接收小谷监控告警。"
}

run_check() {
  local overall_status=0
  local result current_state error_text preview previous_state now
  mapfile -t result < <(probe_status)
  current_state="${result[0]}"
  error_text="${result[1]}"
  preview="${result[2]}"
  previous_state="$(read_state "$UPTIME_STATE_FILE" "unknown")"
  now="$(TZ="$TZ" date '+%Y-%m-%d %H:%M:%S %Z')"

  if [[ "$current_state" == "healthy" ]]; then
    if [[ "$previous_state" != "healthy" ]]; then
      send_dingtalk \
        "小谷站点已恢复" \
        "时间: ${now}
监控来源: ${MONITOR_SOURCE}
站点地址: ${BASE_URL}
说明: 站点探测已恢复正常。"
    fi
    write_state "$UPTIME_STATE_FILE" "healthy"
    log "probe healthy"
  else
    overall_status=1
    if [[ "$previous_state" != "unhealthy" ]]; then
      send_dingtalk \
        "小谷站点异常告警" \
        "时间: ${now}
监控来源: ${MONITOR_SOURCE}
站点地址: ${BASE_URL}
错误摘要: ${error_text}
响应片段: ${preview}"
    fi
    write_state "$UPTIME_STATE_FILE" "unhealthy"
    log "probe unhealthy: ${error_text}"
  fi

  if ! run_business_monitor; then
    overall_status=1
  fi

  if ! check_model_failures; then
    overall_status=1
  fi

  return "$overall_status"
}

main() {
  local mode="${1:---check}"
  case "$mode" in
    --check)
      run_check
      ;;
    --test)
      run_test
      ;;
    -h|--help)
      usage
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
