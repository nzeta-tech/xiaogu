FROM node:22-alpine AS deps
WORKDIR /app
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry https://registry.npmmirror.com && \
    corepack enable && \
    corepack prepare pnpm@11.2.2 --activate && \
    pnpm config set registry https://registry.npmmirror.com
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
RUN pnpm install pg

FROM node:22-alpine AS builder
WORKDIR /app
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry https://registry.npmmirror.com && \
    corepack enable && \
    corepack prepare pnpm@11.2.2 --activate && \
    pnpm config set registry https://registry.npmmirror.com
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_OUTPUT=standalone
ENV NODE_ENV=production
# Prevent instrumentation from starting long-lived background timers while
# Next evaluates server modules during the image build.
ENV NEXT_PHASE=phase-production-build
RUN --mount=type=cache,target=/app/.next/cache pnpm exec next build --webpack

# AWS Web runtime: only the standalone Next server and static assets. Heavy
# browser, media and provider dependencies belong exclusively to local-agent.
FROM node:22-alpine AS web-runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]

FROM debian:bookworm-slim AS provider-sources
ARG WERSS_REF=6ca61c19a2606c7e85b290f975ca70c77d4b9532
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/werss \
    && curl -fsSL "https://github.com/rachelos/we-mp-rss/archive/${WERSS_REF}.tar.gz" \
      | tar -xz --strip-components=1 -C /opt/werss

# Bundle both upstream codebases into the main application image. WeRSS remains
# complete under /opt/werss; Xiaogu is isolated under /xiaogu.
FROM node:22-bookworm-slim AS local-agent
WORKDIR /xiaogu
RUN sed -i \
      -e 's|http://deb.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' \
      -e 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' \
      /etc/apt/sources.list.d/debian.sources
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get -o Acquire::Retries=5 -o Acquire::https::Timeout=30 update \
    && apt-get -o Acquire::Retries=5 -o Acquire::https::Timeout=30 install -y --no-install-recommends \
      python3 python3-venv python3-pip ffmpeg yt-dlp chromium xvfb x11vnc dumb-init \
      novnc openbox libnss3-tools wget ca-certificates fonts-noto-cjk \
    && python3 -m venv /opt/wechat-venv
# Debian's yt-dlp package lags behind Douyin's changing public response shape.
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --no-cache-dir --upgrade yt-dlp \
    && ln -s /opt/yt-dlp-venv/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=provider-sources /opt/werss /opt/werss
RUN cp /opt/werss/config.example.yaml /opt/werss/config.yaml
ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    /opt/wechat-venv/bin/pip install \
      -r /opt/werss/requirements.txt \
      "cachelib==0.13.0" \
      "https://github.com/chyroc/WechatSogou/archive/6a7e08caa82dd7cf47331d7c303f578a4b325360.tar.gz"
# WechatSogou still imports Werkzeug's removed contrib cache module. Cachelib
# is the maintained extraction of that implementation with the same API.
RUN sed -i \
      's/from werkzeug.contrib.cache import FileSystemCache/from cachelib.file import FileSystemCache/' \
      /opt/wechat-venv/lib/python3.11/site-packages/wechatsogou/filecache.py
ENV NODE_ENV=production
ENV PORT=3000
ENV FONTCONFIG_FILE=/xiaogu/public/fonts/fonts.conf
ENV VIRAL_WERSS_API_BASE=http://127.0.0.1:8001
ENV VIRAL_WECHATSOGOU_API_BASE=http://127.0.0.1:8010
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium
COPY --from=builder /app/public /xiaogu/public
COPY --from=builder /app/.next/standalone /xiaogu/
COPY --from=builder /app/.next/static /xiaogu/.next/static
COPY docker/start-app.sh /xiaogu/start-app.sh
COPY docker/local-agent-healthcheck.sh /xiaogu/local-agent-healthcheck.sh
COPY docker/wechat-sogou/app.py /xiaogu/wechat_sogou_api.py
COPY scripts/local-agent.mjs /xiaogu/scripts/local-agent.mjs
# Next's standalone output preserves Sharp but can omit its optional
# platform packages. Install those packages in a Debian temp prefix, then
# copy them beside Sharp so Node resolves the matching linux-x64 runtime.
RUN npm install --prefix /tmp/sharp-runtime --include=optional --os=linux --cpu=x64 sharp@0.34.5 \
    && mkdir -p /xiaogu/node_modules/.pnpm/sharp@0.34.5/node_modules/@img \
    && cp -R /tmp/sharp-runtime/node_modules/@img/sharp-linux-x64 /tmp/sharp-runtime/node_modules/@img/sharp-libvips-linux-x64 /xiaogu/node_modules/.pnpm/sharp@0.34.5/node_modules/@img/ \
    && rm -rf /tmp/sharp-runtime \
    && chmod 755 /xiaogu/start-app.sh /xiaogu/local-agent-healthcheck.sh
EXPOSE 3000 6080 8001 8010
ENTRYPOINT ["dumb-init", "--"]
CMD ["./start-app.sh"]

# Keep an unqualified Docker build lightweight for the AWS Web fleet.
FROM web-runner AS runner
