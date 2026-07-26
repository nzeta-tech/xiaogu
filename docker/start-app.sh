#!/bin/sh
set -eu

export DISPLAY="${DISPLAY:-:99}"
export HOME="${HOME:-/root}"

# Docker restarts can leave an Xvfb lock file behind even though its process
# is gone. A stale lock prevents both the interactive browser and the CDP
# endpoint used by platform search from starting.
display_number="${DISPLAY#:}"
display_lock="/tmp/.X${display_number}-lock"
if [ -f "$display_lock" ]; then
  display_pid="$(cat "$display_lock" 2>/dev/null || true)"
  display_command="$(ps -p "$display_pid" -o comm= 2>/dev/null || true)"
  if [ "$display_command" != "Xvfb" ]; then
    rm -f "$display_lock" "/tmp/.X11-unix/X${display_number}"
  fi
fi

Xvfb "$DISPLAY" -screen 0 1440x900x24 -ac >/tmp/xvfb.log 2>&1 &

# Xvfb creates its socket before it is ready for clients, so retry the VNC server.
(
  until x11vnc -display "$DISPLAY" -forever -shared -nopw -rfbport 5900; do
    sleep 1
  done
) >/tmp/x11vnc.log 2>&1 &
sleep 1
openbox-session >/tmp/openbox.log 2>&1 &

novnc_server_path="$(command -v novnc_server || command -v novnc_proxy || true)"
if [ -n "$novnc_server_path" ]; then
  "$novnc_server_path" --vnc localhost:5900 --listen 6080 >/tmp/novnc.log 2>&1 &
elif command -v websockify >/dev/null 2>&1 && [ -d /usr/share/novnc ]; then
  websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &
else
  echo "noVNC/websockify is not installed" >&2
  exit 1
fi

werss_env="/opt/wechat-venv"
werss_app_dir="/opt/werss"
if [ ! -x "$werss_env/bin/python" ] || [ ! -f "$werss_app_dir/main.py" ]; then
  echo "Bundled WeRSS Python environment is unavailable" >&2
  exit 1
fi

# WechatSogou is a library inside the application image. Its public API is
# exposed by this process so it remains usable through the upstream-style
# adapter as well as by the TypeScript collection pipeline.
if [ "${VIRAL_WECHATSOGOU_ENABLED:-0}" = "1" ]; then
  "$werss_env/bin/python" -m uvicorn wechat_sogou_api:app \
    --app-dir /xiaogu --host 0.0.0.0 --port 8010 >/tmp/wechatsogou-api.log 2>&1 &
fi

# Run the complete WeRSS application from the same image and process tree.
# Its SQLite database and QR authorization state live in /opt/werss/data.
if [ "${WERSS_ENABLED:-1}" = "1" ]; then
  (
    cd "$werss_app_dir"
    env \
      PORT=8001 \
      DB="${WERSS_DB:-sqlite:////opt/werss/data/we_mp_rss.db}" \
      USERNAME="${WERSS_USERNAME:-admin}" \
      PASSWORD="${WERSS_PASSWORD:-change-me-before-production}" \
      "GATHER.CONTENT=${WERSS_GATHER_CONTENT:-True}" \
      "GATHER.MODEL=${WERSS_GATHER_MODEL:-app}" \
      CHROME_EXECUTABLE_PATH="${CHROME_EXECUTABLE_PATH:-/usr/bin/chromium}" \
      "$werss_env/bin/python" main.py -job True -init True
  ) >/tmp/werss.log 2>&1 &
fi

browser_profile_dir="${BROWSER_PROFILE_DIR:-${DOUYIN_BROWSER_PROFILE_DIR:-/data/douyin-profile}}"
if [ "${VIRAL_WECHAT_DISCOVERY_ENABLED:-0}" = "1" ]; then
  browser_profile_dir="${VIRAL_WECHAT_BROWSER_PROFILE_DIR:-/data/wechat-profile}"
fi
mkdir -p "$browser_profile_dir"
browser_proxy_args=""
browser_security_args=""
browser_start_url="${CONTAINER_BROWSER_START_URL:-${DOUYIN_BROWSER_START_URL:-https://yuanbao.tencent.com/}}"
if [ "${VIRAL_WECHAT_DISCOVERY_ENABLED:-0}" = "1" ]; then
  # wx-channel writes its MITM root certificate into the shared volume. The
  # browser only trusts it in this isolated profile, never at the host level.
  wx_channel_cert="/tmp/wx-channel-SunnyRoot.cer"
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if [ ! -s "$wx_channel_cert" ]; then
      wget -q -O "${wx_channel_cert}.tmp" http://wx-channel:2026/api/v1/certificate/download 2>/dev/null \
        && mv "${wx_channel_cert}.tmp" "$wx_channel_cert" \
        || rm -f "${wx_channel_cert}.tmp"
    fi
    [ -s "$wx_channel_cert" ] && break
    sleep 1
  done
  if [ -s "$wx_channel_cert" ] && command -v certutil >/dev/null 2>&1; then
    certutil -A -d "sql:$browser_profile_dir" -n "wx-channel-local" -t "C,," -i "$wx_channel_cert" 2>/dev/null || true
  fi
  browser_proxy_args="--proxy-server=http://wx-channel:2025"
  browser_security_args="--ignore-certificate-errors --disable-quic"
  browser_start_url="https://channels.weixin.qq.com/web/pages/home"

  # The injected page adapter connects to loopback. Bridge that local port to
  # the separate wx-channel service without exposing it on the host.
  node -e 'const net=require("net");net.createServer((client)=>{const upstream=net.connect(2026,"wx-channel");client.pipe(upstream);upstream.pipe(client);client.on("error",()=>upstream.destroy());upstream.on("error",()=>client.destroy())}).listen(2026,"127.0.0.1")' >/tmp/wx-channel-ws-bridge.log 2>&1 &
fi
# Keep the interactive browser alive for both noVNC login and the internal CDP parser.
# Closing its window or a Chromium crash must not disable video-channel parsing.
(
  while true; do
    # A persisted profile keeps stale process locks after a browser/container replacement.
    rm -f "$browser_profile_dir/SingletonLock" "$browser_profile_dir/SingletonCookie" "$browser_profile_dir/SingletonSocket"
    FONTCONFIG_FILE=/etc/fonts/fonts.conf chromium \
      --no-sandbox \
      --disable-dev-shm-usage \
      --disable-gpu \
      --no-first-run \
      --no-default-browser-check \
      --remote-debugging-address=127.0.0.1 \
      --remote-debugging-port="${CONTAINER_BROWSER_CDP_PORT:-9222}" \
      --user-data-dir="$browser_profile_dir" \
      --window-size=1440,900 \
      $browser_proxy_args \
      $browser_security_args \
      "$browser_start_url" >>/tmp/chromium.log 2>&1
    sleep 2
  done
) &

# Xiaohongshu uses its own persistent profile and a direct connection. Sharing
# the Video Channels MITM proxy/profile causes cross-platform risk controls and
# makes one platform's login invalidate another platform's collection session.
if [ "${VIRAL_XHS_BROWSER_ENABLED:-1}" = "1" ]; then
  xhs_profile_dir="${VIRAL_XHS_BROWSER_PROFILE_DIR:-/data/xhs-profile}"
  mkdir -p "$xhs_profile_dir"
  (
    while true; do
      rm -f "$xhs_profile_dir/SingletonLock" "$xhs_profile_dir/SingletonCookie" "$xhs_profile_dir/SingletonSocket"
      FONTCONFIG_FILE=/etc/fonts/fonts.conf chromium \
        --no-sandbox \
        --disable-dev-shm-usage \
        --disable-gpu \
        --no-first-run \
        --no-default-browser-check \
        --remote-debugging-address=127.0.0.1 \
        --remote-debugging-port="${VIRAL_XHS_CDP_PORT:-9223}" \
        --user-data-dir="$xhs_profile_dir" \
        --window-size=1280,900 \
        "${VIRAL_XHS_BROWSER_START_URL:-https://www.xiaohongshu.com/}" >>/tmp/chromium-xhs.log 2>&1
      sleep 2
    done
  ) &
fi

# Video Channels owns port 9222 when its injected browser is enabled. Keep
# Douyin on a separate direct profile/CDP endpoint so platform search never
# runs inside the WeChat MITM session.
if [ "${VIRAL_WECHAT_DISCOVERY_ENABLED:-0}" = "1" ] && [ "${VIRAL_DOUYIN_BROWSER_ENABLED:-1}" = "1" ]; then
  douyin_profile_dir="${VIRAL_DOUYIN_BROWSER_PROFILE_DIR:-${DOUYIN_BROWSER_PROFILE_DIR:-/data/douyin-profile}}"
  mkdir -p "$douyin_profile_dir"
  (
    while true; do
      rm -f "$douyin_profile_dir/SingletonLock" "$douyin_profile_dir/SingletonCookie" "$douyin_profile_dir/SingletonSocket"
      FONTCONFIG_FILE=/etc/fonts/fonts.conf chromium \
        --no-sandbox \
        --disable-dev-shm-usage \
        --disable-gpu \
        --no-first-run \
        --no-default-browser-check \
        --remote-debugging-address=127.0.0.1 \
        --remote-debugging-port="${VIRAL_DOUYIN_CDP_PORT:-9224}" \
        --user-data-dir="$douyin_profile_dir" \
        --window-size=1280,900 \
        "${VIRAL_DOUYIN_BROWSER_START_URL:-https://www.douyin.com/}" >>/tmp/chromium-douyin.log 2>&1
      sleep 2
    done
  ) &
fi

if [ "${VIRAL_SOGOU_BROWSER_ENABLED:-1}" = "1" ]; then
  sogou_profile_dir="${VIRAL_SOGOU_BROWSER_PROFILE_DIR:-/data/sogou-profile}"
  mkdir -p "$sogou_profile_dir"
  (
    while true; do
      rm -f "$sogou_profile_dir/SingletonLock" "$sogou_profile_dir/SingletonCookie" "$sogou_profile_dir/SingletonSocket"
      FONTCONFIG_FILE=/etc/fonts/fonts.conf chromium \
        --no-sandbox \
        --disable-dev-shm-usage \
        --disable-gpu \
        --no-first-run \
        --no-default-browser-check \
        --remote-debugging-address=127.0.0.1 \
        --remote-debugging-port="${VIRAL_SOGOU_CDP_PORT:-9225}" \
        --user-data-dir="$sogou_profile_dir" \
        --window-size=1280,900 \
        "${VIRAL_SOGOU_BROWSER_START_URL:-https://weixin.sogou.com/}" >>/tmp/chromium-sogou.log 2>&1
      sleep 2
    done
  ) &
fi

if [ "${VIRAL_WECHAT_MP_DISCOVERY_ENABLED:-0}" = "1" ]; then
  wechat_mp_profile_dir="${VIRAL_WECHAT_MP_BROWSER_PROFILE_DIR:-/data/wechat-mp-profile}"
  mkdir -p "$wechat_mp_profile_dir"
  (
    while true; do
      rm -f "$wechat_mp_profile_dir/SingletonLock" "$wechat_mp_profile_dir/SingletonCookie" "$wechat_mp_profile_dir/SingletonSocket"
      FONTCONFIG_FILE=/etc/fonts/fonts.conf chromium \
        --no-sandbox \
        --disable-dev-shm-usage \
        --disable-gpu \
        --no-first-run \
        --no-default-browser-check \
        --remote-debugging-address=127.0.0.1 \
        --remote-debugging-port="${VIRAL_WECHAT_MP_CDP_PORT:-9226}" \
        --user-data-dir="$wechat_mp_profile_dir" \
        --window-size=1280,900 \
        "${VIRAL_WECHAT_MP_BROWSER_START_URL:-https://mp.weixin.qq.com/}" >>/tmp/chromium-wechat-mp.log 2>&1
      sleep 2
    done
  ) &
fi

# The viral scheduler starts with the Next server. Wait until both CDP
# endpoints have a page target, then give the SPAs a short render window so
# the first forced refresh cannot race browser startup.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  wechat_ready=1
  xhs_ready=1
  douyin_ready=1
  sogou_ready=1
  wechat_mp_ready=1
  wget -qO- "http://127.0.0.1:${CONTAINER_BROWSER_CDP_PORT:-9222}/json/list" 2>/dev/null | grep -q '"type": "page"' || wechat_ready=0
  if [ "${VIRAL_XHS_BROWSER_ENABLED:-1}" = "1" ]; then
    wget -qO- "http://127.0.0.1:${VIRAL_XHS_CDP_PORT:-9223}/json/list" 2>/dev/null | grep -q '"type": "page"' || xhs_ready=0
  fi
  if [ "${VIRAL_WECHAT_DISCOVERY_ENABLED:-0}" = "1" ] && [ "${VIRAL_DOUYIN_BROWSER_ENABLED:-1}" = "1" ]; then
    wget -qO- "http://127.0.0.1:${VIRAL_DOUYIN_CDP_PORT:-9224}/json/list" 2>/dev/null | grep -q '"type": "page"' || douyin_ready=0
  fi
  if [ "${VIRAL_SOGOU_BROWSER_ENABLED:-1}" = "1" ]; then
    wget -qO- "http://127.0.0.1:${VIRAL_SOGOU_CDP_PORT:-9225}/json/list" 2>/dev/null | grep -q '"type": "page"' || sogou_ready=0
  fi
  if [ "${VIRAL_WECHAT_MP_DISCOVERY_ENABLED:-0}" = "1" ]; then
    wget -qO- "http://127.0.0.1:${VIRAL_WECHAT_MP_CDP_PORT:-9226}/json/list" 2>/dev/null | grep -q '"type": "page"' || wechat_mp_ready=0
  fi
  [ "$wechat_ready" = "1" ] && [ "$xhs_ready" = "1" ] && [ "$douyin_ready" = "1" ] && [ "$sogou_ready" = "1" ] && [ "$wechat_mp_ready" = "1" ] && break
  sleep 1
done
sleep 5

if [ "${LOCAL_AGENT_RUNNER:-0}" != "1" ]; then
  exec node server.js
fi

rm -f "${LOCAL_AGENT_READY_FILE:-/tmp/local-agent.ready}"
node server.js >/tmp/local-executor.log 2>&1 &
executor_pid=$!
node /xiaogu/scripts/local-agent.mjs >/tmp/local-agent.log 2>&1 &
agent_pid=$!

shutdown_critical() {
  kill "$agent_pid" "$executor_pid" 2>/dev/null || true
  wait "$agent_pid" "$executor_pid" 2>/dev/null || true
}
trap shutdown_critical INT TERM EXIT

while kill -0 "$executor_pid" 2>/dev/null && kill -0 "$agent_pid" 2>/dev/null; do
  sleep 2
done

if ! kill -0 "$executor_pid" 2>/dev/null; then
  echo "local executor exited; stopping container for restart" >&2
fi
if ! kill -0 "$agent_pid" 2>/dev/null; then
  echo "local Agent exited; stopping container for restart" >&2
fi
exit 1
