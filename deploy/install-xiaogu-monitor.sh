#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/xiaogu-monitor"
ENV_DIR="/etc/xiaogu-monitor"
SERVICE_FILE="xiaogu-monitor.service"
TIMER_FILE="xiaogu-monitor.timer"

for file in xiaogu-monitor.sh "$SERVICE_FILE" "$TIMER_FILE"; do
  if [[ ! -f "$SCRIPT_DIR/$file" ]]; then
    echo "missing required file: $SCRIPT_DIR/$file" >&2
    exit 1
  fi
done

sudo mkdir -p "$INSTALL_DIR" "$ENV_DIR" /var/lib/xiaogu-monitor
sudo install -m 0755 "$SCRIPT_DIR/xiaogu-monitor.sh" "$INSTALL_DIR/xiaogu-monitor.sh"
sudo install -m 0644 "$SCRIPT_DIR/$SERVICE_FILE" "/etc/systemd/system/$SERVICE_FILE"
sudo install -m 0644 "$SCRIPT_DIR/$TIMER_FILE" "/etc/systemd/system/$TIMER_FILE"

if [[ ! -f "$ENV_DIR/monitor.env" ]]; then
  sudo tee "$ENV_DIR/monitor.env" >/dev/null <<'EOF'
# Required for real notifications:
# DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=replace-me
# DINGTALK_SECRET=

DINGTALK_KEYWORD=小谷告警
BASE_URL=https://xiaogu.nzeta.ai
MONITOR_SOURCE=xiaogu-primary-16.176.34.69
REQUEST_TIMEOUT_SECONDS=20
STATE_DIR=/var/lib/xiaogu-monitor
PROJECT_DIR=/home/ubuntu/insurance-content-agent
ENV_FILE=/home/ubuntu/insurance-content-agent/.env
DB_CONTAINER=insurance-content-agent-postgres-1
DB_NAME=insurance_content_agent
DB_USER=postgres
# Optional when production app reads/writes an external RDS instead of the local Postgres container:
# MONITOR_DATABASE_URL=postgresql://user:password@host:5432/insurance_content_agent?sslmode=no-verify

# Thresholds are intentionally set to 1 for the first rollout.
NEW_USERS_ENABLED=true
PAID_ORDERS_ENABLED=true
FAILED_ORDERS_ENABLED=true
PENDING_ORDERS_ENABLED=true
PENDING_ORDER_THRESHOLD_MINUTES=1
BUSINESS_MONITOR_BATCH_LIMIT=10
TZ=Asia/Shanghai
EOF
  sudo chmod 0600 "$ENV_DIR/monitor.env"
fi

if [[ ! -f /var/lib/xiaogu-monitor/uptime.state ]]; then
  echo healthy | sudo tee /var/lib/xiaogu-monitor/uptime.state >/dev/null
fi

if [[ ! -f /var/lib/xiaogu-monitor/business.state ]]; then
  echo ok | sudo tee /var/lib/xiaogu-monitor/business.state >/dev/null
fi

sudo systemctl daemon-reload
sudo systemctl enable --now xiaogu-monitor.timer

echo "xiaogu monitor installed."
echo "env file: $ENV_DIR/monitor.env"
echo "test command:"
echo "  sudo /opt/xiaogu-monitor/xiaogu-monitor.sh --test"
echo "logs:"
echo "  sudo journalctl -u xiaogu-monitor.service -n 50"
