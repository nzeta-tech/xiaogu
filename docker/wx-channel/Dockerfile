FROM golang:1.24-alpine AS builder

ARG WX_CHANNEL_REF=3dd74f0e21f7d9f6bdc5bec9338e433c57cbe8d0
WORKDIR /src
RUN apk add --no-cache build-base git
COPY docker/wx-channel/guard-api-host.awk /tmp/guard-api-host.awk
# utils.js and decrypt.js are injected into the same classic-script scope.
# Upstream mixes let/const with duplicate var declarations, which aborts the
# Video Channels SPA before it mounts and leaves every API request hanging.
RUN git init . \
  && git remote add origin https://github.com/nobiyou/wx_channel.git \
  && git fetch --depth=1 origin "${WX_CHANNEL_REF}" \
  && git checkout --detach FETCH_HEAD \
  && sed -i 's/^let decryptor;$/var decryptor;/; s/^const __decrypt_cache__ = new Map();$/var __decrypt_cache__ = new Map();/' internal/assets/inject/utils.js \
  && awk -f /tmp/guard-api-host.awk internal/router/api_routes.go > internal/router/api_routes.go.patched \
  && mv internal/router/api_routes.go.patched internal/router/api_routes.go \
  && test "$(grep -c 'requestHost := strings.ToLower' internal/router/api_routes.go)" -eq 1 \
  && gofmt -w internal/router/api_routes.go
# The upstream repository references two Windows-only DLLs through go:embed,
# but does not ship them. Linux never loads these resources; empty placeholders
# only let the Go embed check complete for this self-hosted Linux build.
RUN mkdir -p pkg/sunnynet/Resource/nfapi/dll/win32 pkg/sunnynet/Resource/nfapi/dll/x64 \
  && : > pkg/sunnynet/Resource/nfapi/dll/win32/nfapi.dll \
  && : > pkg/sunnynet/Resource/nfapi/dll/x64/nfapi.dll
# go-libutp v1.3.1 defines its own C++ `bool` typedef. GCC 14 treats bool as a
# built-in type, so remove only that obsolete typedef before compilation.
RUN go mod download \
  && libutp_dir="$(go list -m -f '{{.Dir}}' github.com/anacrolix/go-libutp)" \
  && sed -i '/^[[:space:]]*typedef[[:space:]]\+uint8[[:space:]]\+bool;[[:space:]]*$/d' "${libutp_dir}/utp_types.h"
# gopeed pulls a second bundled SQLite implementation through an indirect
# dependency. wx_channel uses mattn/go-sqlite3; keep the first linked symbols.
RUN CGO_ENABLED=1 CGO_LDFLAGS='-Wl,--allow-multiple-definition' \
  go build -trimpath -ldflags='-s -w' -o /out/wx_channel .

FROM alpine:3.21

WORKDIR /data
RUN apk add --no-cache ca-certificates libstdc++ libgcc
COPY --from=builder /out/wx_channel /usr/local/bin/wx_channel
COPY docker/wx-channel/config.yaml /etc/wx-channel/config.yaml
EXPOSE 2025 2026
ENTRYPOINT ["/usr/local/bin/wx_channel", "--config", "/etc/wx-channel/config.yaml"]
