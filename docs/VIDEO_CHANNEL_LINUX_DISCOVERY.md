# Linux Video Channels Discovery

The `wx-channel` Compose service is built from the MIT-licensed
[`nobiyou/wx_channel`](https://github.com/nobiyou/wx_channel) source at commit
`3dd74f0e21f7d9f6bdc5bec9338e433c57cbe8d0`.

It is self-hosted. The service does not use the upstream project's cloud Hub
or a hosted parsing API. It runs a local HTTPS proxy and injects the upstream
open-source page adapter into the logged-in Video Channels assistant page.

Enable it with `VIRAL_WECHAT_DISCOVERY_ENABLED=1`, then open the container VNC
page and log in to Video Channels. Collection uses the following local flow:

1. Search Video Channels accounts by configured keywords.
2. Fetch the works of the matching accounts.
3. Keep only recent works with usable titles and platform detail URLs.

The Video Channels web application is not a public stable API. This adapter
depends on the logged-in page and may need maintenance when the page changes.
