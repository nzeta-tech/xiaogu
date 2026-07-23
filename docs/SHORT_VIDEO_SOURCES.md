# Short-video source assessment

This assessment covers sources that can be integrated without reverse engineering,
restricted-page scraping, login-session collection, media downloading, or invented
metrics. No production provider is configured by this repository.

## Official options

| Source | Authorization and limits | Privacy/copyright boundary | Contract difference |
| --- | --- | --- | --- |
| [TikTok Display API](https://developers.tiktok.com/doc/display-api-get-started/) and [video list](https://developers.tiktok.com/doc/tiktok-api-v2-video-list/) | TikTok Developer account, approved Login Kit/TikTok API products, and user OAuth scopes `user.info.basic` and `video.list`. The list is for recent public videos of the authorized user, cursor-paginated and sorted by creation time; the official guide recommends refreshing recent videos every 12 hours. | Store only fields permitted by the approved product and user consent. The token and user identifiers must not enter client responses or logs. Display/link/embed rights do not grant media republication or a global trend feed. | Maps `id`, `title`, `video_description`, cover and `embed_link` to provider metadata. It is user-scoped, not a global “viral” ranking. Metrics and insurance evidence are not guaranteed, so `statistics_at` and evidence remain absent and the item is filtered or `pending_review`. |
| [TikTok Embed Player](https://developers.tiktok.com/doc/embed-player/) | Use the documented hosted iframe `https://www.tiktok.com/player/v1/{post_id}` for an ID the integrator is allowed to display. Confirm product terms, consent and regional availability before launch. | Playback stays hosted by TikTok; do not download, proxy, crop, or republish the media. The feed must retain attribution and an official source URL. | `rights_basis=platform_embed`, `rights_scope=embed_only`; this is a presentation capability, not a metrics or evidence source. The current API intentionally exposes metadata only and does not render media. |
| [TikTok embeds/oEmbed](https://developers.tiktok.com/doc/embed-videos/) | The documented oEmbed request accepts a public TikTok URL. Public availability and platform terms still apply; deleted posts are no longer available in the embed. | Keep the returned official embed/attribution and honor deletion/takedown. Do not treat returned HTML or thumbnail metadata as a license to download or commercially reuse media. | Metadata can populate title, author/source and embed reference. It does not supply reliable feed metrics or insurance evidence; without `metrics.statistics_at` the current server gate rejects it rather than fabricating a score. |
| [Douyin Open Platform](https://open.douyin.com/platform/doc/) | Official developer account, an approved application/product, documented scopes, quota and sandbox credentials are required. The exact product, endpoint, fields, retention/deletion rules and commercial terms must be confirmed with the operator before implementation. | No client reverse engineering, cookie use, restricted-page scraping, media download, or unapproved user data. Rights, privacy and takedown terms must be documented per product. | The adapter can accept a future approved endpoint through the existing provider contract, but `authorized=true`, HTTPS, rights/policy timestamps, statistics time and evidence are mandatory. No endpoint is assumed from the platform landing page. |
| [WeChat Open Platform developer docs](https://developers.weixin.qq.com/doc/oplatform/) and [WeChat Channels developer docs](https://developers.weixin.qq.com/doc/channels/) | Requires a verified WeChat developer/official-account or Channels capability, approved product scope and credentials. The public docs do not establish a general unauthenticated Channels trend feed; endpoint eligibility, quota, returned metrics, retention and deletion behavior are product-specific and must be confirmed in the approved console/docs. | Use only consented, authorized account data and documented platform links/embeds. Do not collect login cookies, scrape Channels pages, download media, or treat a public URL as a copyright license. Confirm personal-data minimization, takedown and commercial display rights before use. | Provider entries map to `platform=wechat_channels`, `platform_adapter=wechat_channels_official`. Until an approved API contract supplies real statistics plus rights/policy evidence, the current gate returns an empty/filtered or pending result; no fabricated “爆款” score or undocumented embed is added. |

## Open-source adapters

[nickjvm/tacotok](https://github.com/nickjvm/tacotok) is an MIT-licensed Next.js
example that uses TikTok oEmbed. It is a code-pattern reference, not an authorized
data provider and does not confer TikTok rights. Any copied code requires preserving
the MIT notice. Scraper, downloader, client-reverse-engineering and login-session
projects found during the survey are explicitly rejected and are not dependencies.

## Operational decision

The only deployable first step without a production credential is a fixed fixture or
an operator-owned sandbox provider. The provider contract remains
`AUTHORIZED_SHORT_VIDEO_API_BASE/short-videos`; the server rejects entries without
`authorized: true`, HTTPS, active rights, attribution, platform-policy timestamp and
metric `statistics_at`. Missing fact evidence/review fields produces `pending_review`
when structurally valid; missing structural fields such as statistics time is filtered.
No source means an empty list with `provider_not_configured`. Provider failure serves
the in-memory cache as `degraded`; cache older than 24 hours is `stale`, non-publishable
and marked `pending_review`.

Before a production source is approved, product/legal/domain review must provide:

- provider/app approval, OAuth scopes, quota and refresh rules;
- field-level data retention/deletion, privacy and user-consent terms;
- source URL, rights basis/scope, expiry, attribution and takedown procedure;
- official insurance evidence, jurisdiction/effective date, human reviewer and review time.

Until those materials exist, “爆款” is not a fact label. The UI uses “按供应商指标排序”
and labels entries as reference material; it does not claim platform-wide popularity.
