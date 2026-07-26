# 爆款二创来源服务

“爆款二创”会把平台解析和内容生成分成两层：主应用负责鉴权、作品记录、转写和生成；平台解析器负责拿到公开作品信息。解析器失败时，仍可手动填写标题、作者、证据摘要或转写稿继续创作。

## 已支持的来源

| 来源 | 默认行为 | 可选增强 |
| --- | --- | --- |
| 抖音 | 使用容器内的 `yt-dlp` 读取单条视频并保存临时媒体 | 配置 `DOUYIN_COOKIES_FROM_BROWSER` 处理风控 |
| 微信视频号 | 调用兼容 `wx_channels_download` 分享链接解析流程的服务 | 配置 `VIRAL_WECHAT_INSPECT_API_BASE` 指向自建服务 |
| 微信公众号 | 直接提取公开文章标题、作者、发布时间和 `#js_content` 正文 | 登录态或受限文章需手动粘贴正文 |
| 小红书 | 先尝试公开页面元信息 | 配置 `VIRAL_XHS_INSPECT_API_BASE` 接入 XHS-Downloader API |

## 小红书 API

XHS-Downloader 的 API 模式默认监听 `5556`，主应用会请求：

```text
POST {VIRAL_XHS_INSPECT_API_BASE}/xhs/detail
{"url":"作品链接","download":false}
```

本地 Docker 场景可以把 `VIRAL_XHS_INSPECT_API_BASE` 设置为 `http://host.docker.internal:5556`；Linux 环境需要按部署环境将该地址替换为宿主机 IP 或同一 Docker 网络中的服务名。

## 微信视频号

`wx_channels_download` 的完整下载器依赖本机微信客户端、代理和证书。主应用不把微信登录态放进 Next.js 服务，而是通过 `VIRAL_WECHAT_INSPECT_API_BASE` 连接一个兼容的分享链接解析服务。默认值是参考项目 README 中的公开 Worker 地址，生产环境建议自建并限制访问来源。

推荐使用该项目最新版本的本地 API：启动桌面客户端的普通模式（直接运行 `wx_video_download`，不要运行 `wx_video_download server`）。普通模式默认监听 `http://127.0.0.1:2022`，并提供 `GET /api/channels/parse_sph?url=...`；`server` 模式是远端服务模式，会关闭这个本地路由。

将主应用配置为 `VIRAL_WECHAT_LOCAL_API_BASE=http://127.0.0.1:2022`，主应用会优先调用本地 API。普通模式需要证书和本机代理权限：打开 Yuanbao 并访问页面后，`wx_channels_download` 会捕获必要的 Yuanbao Cookie；也可以手动把 Cookie 配到 `cloudflare.sphCookie`。Cookie 获取方式见参考项目的 `docs/cli/sph.md`。微信/Yuanbao 的登录态只保留在本机。

### Docker 部署

正式部署不依赖宿主机微信或浏览器。应用容器内置 Chromium 和 noVNC：访问 `http://<部署地址>:6080/vnc.html`，在容器浏览器中登录 Yuanbao。浏览器 profile 会保存在 Docker volume 中，视频号链接解析时，应用仅通过容器内部 CDP 读取该会话并请求 Yuanbao 与视频号接口；Cookie 不会返回给前端、不会写入 `.env`，CDP 端口也不会暴露到容器外。

Docker Compose 默认开启该方案：

```dotenv
VIRAL_WECHAT_CONTAINER_BROWSER_ENABLED=1
CONTAINER_BROWSER_START_URL=https://yuanbao.tencent.com/
```

登录完成后回到“爆款二创”点击“自动读取作品信息”即可。6080 只应用于管理员登录维护，应放在内网、VPN 或反向代理认证之后，不要直接公开到互联网。

## 转写与生成

Docker Compose 默认启动内置的 `faster-whisper` CPU 服务，模型缓存保存在 `whisper_models` volume；首次转写会下载模型，默认 `small` 模型更适合中文。可通过 `WHISPER_MODEL=base` 降低首次下载体积和 CPU 占用。

如需改用兼容 OpenAI 的远程转写服务，可将 `VIRAL_TRANSCRIBE_API_BASE` 留空，再配置：

```dotenv
VIRAL_INSPECT_OPENAI_API_KEY=...
VIRAL_INSPECT_OPENAI_API_BASE=https://api.openai.com/v1
VIRAL_INSPECT_OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
```

转写结果只作为参考素材进入二创提示。系统不会把原作品标题、句子、案例、人物、数据或独特比喻直接复刻到输出中；产品规则、收益、理赔、核保和政策信息仍需发布前人工核验。

## 许可证与使用边界

接入前请分别核对解析器仓库的许可证和平台条款。特别是 GPL 项目、许可证为 `Other` 的项目以及依赖 Cookie、代理或登录态的项目，不应未经审查直接复制进商业服务。只处理用户有权参考的公开内容，并为每条生成结果保留来源链接。
