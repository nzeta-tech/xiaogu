# WeChat provider integration

The viral discovery pipeline bundles both complete upstream projects into the
main application image instead of deploying separate provider images.

## Single-image runtime

- The complete pinned WeRSS source tree is bundled under `/opt/werss`. Its UI, QR authorization,
  subscriptions, article storage, export and API remain available at
  `http://127.0.0.1:8001` from the main `app` container. Its full upstream
  requirements are installed into `/opt/wechat-venv`.
- The pinned upstream WechatSogou package is installed into the same Python
  environment and exposes
  all five public top-level operations through a small FastAPI boundary:
  account search, account info, article search, account history and hot lists.
  OpenAPI documentation is available at `http://127.0.0.1:8010/docs`.
  A build-time compatibility import maps its removed Werkzeug file-cache module
  to the maintained Cachelib implementation without changing provider behavior.

The Next.js application queries both loopback providers concurrently and merges their results
with the existing persistent Sogou browser and authenticated WeChat MP search.
Provider failure is isolated: a failed source contributes diagnostics but does
not abort the other sources or the database publication transaction.

## First-time setup

1. Set a strong `WERSS_PASSWORD` in `.env` and rebuild the main app image.
2. Open `http://127.0.0.1:8001`, sign in to WeRSS and complete its QR
   authorization.
3. Create a WeRSS Access Key and set
   `VIRAL_WERSS_AUTHORIZATION=AK-SK <access_key>:<secret_key>` in `.env`.
4. Add the required WeChat public accounts as WeRSS subscriptions. Their
   articles are then included in each viral data preparation run.
5. Trigger the existing creator discovery worker or internal discovery route.

WechatSogou challenges are returned as provider errors. The adapter never
blocks on terminal captcha input; the existing persistent Sogou browser remains
the manual verification path.

## Provider endpoints

WechatSogou adapter:

- `GET /v1/accounts/search?q=...&page=1`
- `GET /v1/accounts/info?q=...`
- `GET /v1/articles/search?q=...&page=1&timesn=0`
- `GET /v1/accounts/articles?q=...` or `?url=...`
- `GET /v1/articles/hot?hot_index=0&page=1`

WeRSS is consumed through its upstream API prefix `/api/v1/wx`:

- `GET /mps/search/{keyword}`
- `GET /mps`
- `GET /articles`

The remaining upstream WeRSS endpoints are unchanged and remain available to
operators and future integrations.
