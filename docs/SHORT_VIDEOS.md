# Short video feed contract

`GET /api/short-videos` is an authenticated, quota-metered reference feed. It does not scrape Douyin, use login cookies, download media, or bypass a platform restriction.

Configure `AUTHORIZED_SHORT_VIDEO_API_BASE` only for a provider whose contract permits this use. The provider endpoint is expected at `/short-videos` and must return:

```json
{
  "data": [
    {
      "id": "provider-id",
      "title": "示例标题",
      "platform": "douyin",
      "source_url": "https://example.invalid/video/1",
      "published_at": "2026-07-22T00:00:00Z",
      "metrics": { "views": 1000, "likes": 20, "comments": 3, "shares": 4, "statistics_at": "2026-07-22T01:00:00Z" },
      "themes": ["家庭责任", "健康医疗"],
      "labels": ["结构参考"],
      "authorized": true,
      "fact_status": "human_verified",
      "fact_type": "policy_term",
      "fact_claims": ["原文事实"],
      "evidence": [{ "officialUrl": "https://example.invalid/evidence", "institution": "官方机构", "publishedAt": "2026-07-21T00:00:00Z", "excerpt": "证据摘录" }],
      "jurisdiction": "CN",
      "effective_at": "2026-07-21T00:00:00Z",
      "reviewed_at": "2026-07-22T00:00:00Z",
      "reviewer_id": "reviewer-id",
      "rights_basis": "official_api_display",
      "rights_scope": "metadata_only",
      "rights_expires_at": "2026-12-31T00:00:00Z",
      "attribution": "平台及原作者",
      "platform_policy_checked_at": "2026-07-22T00:00:00Z"
    }
  ]
}
```

Items without `authorized: true`, an HTTPS source URL, a platform, statistics time, evidence, active rights, attribution, or a checked platform policy are filtered. `fact_status=human_verified` still requires fact type/claims, jurisdiction, effective time, review time and reviewer ID before `compliance.status=displayable`; missing evidence or review data remains `pending_review` with `publishable=false`. Absolute promises, sensitive personal information and platform-deleted items are filtered server-side.

`rights_basis` is one of `official_api_display`, `platform_embed`, `owner_license`, `public_domain`, or `other_approved`; `rights_scope` is one of `metadata_only`, `link_only`, `embed_only`, or `download_republish`. The current implementation never downloads or republishes media. Product/legal must confirm the rights scope, attribution, expiry and platform policy evidence before any non-metadata behavior is added.

The adapter refreshes at most once per 15 minutes per application process. Provider errors return the last in-memory feed with `degraded: true`; entries older than 24 hours are marked `availability: "stale"`, forced to `pending_review`, and are not publishable. With no provider or no eligible items, the endpoint returns an empty list and a degradation reason instead of seed or fabricated data.
