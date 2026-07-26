import { downloadDouyinPublic, inspectDouyinPublicMetadata, transcribeDownloadedDouyin } from "@/lib/creation/douyin-download";
import { inspectWechatChannelsWithContainerBrowser } from "@/lib/creation/wechat-channels-container";
import { query } from "@/lib/db/client";

type CuratedContent = { id: string; platform: string; source_url: string };
type BackfillStatus = "updated" | "failed" | "skipped";
type BackfillResult = { id: string; platform: string; sourceUrl: string; status: BackfillStatus; detail: string };

const backfillStatusSql = "concat_ws(E'\\n', nullif(regexp_replace(risk_note, E'\\n?自动解析状态：[^\\n]*', '', 'g'), ''), $BACKFILL_STATUS)";

export async function backfillCuratedViralContents() {
  const contents = await query<CuratedContent>(
    `select id, platform, source_url from viral_contents
     where source_type = 'manual' and status = 'published'
     order by sort_order asc, created_at asc`,
  );
  const results: BackfillResult[] = [];
  for (const content of contents.rows) {
    if (content.platform === "抖音") results.push(await backfillDouyin(content));
    else if (content.platform === "视频号") results.push(await backfillWechatChannel(content));
    else results.push({ id: content.id, platform: content.platform, sourceUrl: content.source_url, status: "skipped", detail: "当前批量任务仅处理抖音和视频号素材。" });
  }
  return {
    total: results.length,
    updated: results.filter((item) => item.status === "updated").length,
    failed: results.filter((item) => item.status === "failed").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    results,
  };
}

async function backfillDouyin(content: CuratedContent): Promise<BackfillResult> {
  const metadata = await inspectDouyinPublicMetadata(content.source_url);
  if (!metadata?.title) {
    const detail = "抖音公开元数据未返回。请确认 yt-dlp 已升级且抖音浏览器登录态有效。";
    await saveBackfillStatus(content.id, detail);
    return result(content, "failed", detail);
  }
  let transcript = "";
  let detail = "已回填公开元数据";
  try {
    const downloaded = await downloadDouyinPublic(metadata.sourceUrl || content.source_url);
    transcript = await transcribeDownloadedDouyin(downloaded.videoFile);
    detail = transcript ? "已回填公开元数据和视频转写" : "已回填公开元数据；视频下载成功但未取得转写";
  } catch (error) {
    detail = `已回填公开元数据；视频下载或转写未完成：${errorMessage(error)}`;
  }
  await query(
    `update viral_contents
     set title = $2, source_title = $2,
         source_author = coalesce(nullif($3, ''), source_author),
         source_url = coalesce(nullif($4, ''), source_url),
         thumbnail_url = coalesce(nullif($5, ''), thumbnail_url),
         metric_label = case when $6::integer is null then metric_label else '点赞' end,
         metric_value = coalesce($6::integer, metric_value),
         metric_unit = case when $6::integer is null then metric_unit else '赞' end,
         article_body = case when $7 <> '' then $7 else article_body end,
         risk_note = ${backfillStatusSql.replace("$BACKFILL_STATUS", "$8")}, updated_at = now()
     where id = $1`,
    [content.id, metadata.title.slice(0, 160), metadata.authorName, metadata.sourceUrl, metadata.thumbnailUrl,
      metricValue(metadata.metricValue), transcript, `自动解析状态：${detail}`],
  );
  return result(content, "updated", detail);
}

async function backfillWechatChannel(content: CuratedContent): Promise<BackfillResult> {
  const inspected = await inspectWechatChannelsWithContainerBrowser(content.source_url);
  if (inspected.status !== "success") {
    const detail = inspected.status === "needs_login" ? inspected.reason : "视频号容器浏览器不可用，无法读取公开作品详情。";
    await saveBackfillStatus(content.id, detail);
    return result(content, "failed", detail);
  }
  const nestedData = objectValue(inspected.payload.data);
  const data = Object.keys(nestedData).length > 0 ? nestedData : inspected.payload;
  const feed = objectValue(data.feedInfo);
  const author = objectValue(data.authorInfo);
  const title = stringValue(feed.description);
  if (!title) {
    const detail = "视频号解析器未返回作品标题。";
    await saveBackfillStatus(content.id, detail);
    return result(content, "failed", detail);
  }
  // The public page exposes bare interaction counts without semantic labels.
  // Never guess that a number is a like count.
  const pageText = stringValue(feed.pageText);
  await query(
    `update viral_contents
     set title = $2, source_title = $2,
         source_author = coalesce(nullif($3, ''), source_author),
         thumbnail_url = coalesce(nullif($4, ''), thumbnail_url),
         metric_label = '互动待核验',
         metric_value = null,
         metric_unit = '',
         summary = $2,
         publish_at = coalesce($5::timestamptz, publish_at),
         article_body = case when $6 <> '' then $6 else article_body end,
         risk_note = ${backfillStatusSql.replace("$BACKFILL_STATUS", "'自动解析状态：已通过容器浏览器回填视频号公开元数据'")}, updated_at = now()
     where id = $1`,
    [content.id, title.slice(0, 160), stringValue(author.nickname), stringValue(feed.coverUrl), unixTimeValue(feed.createtime), pageText.slice(0, 20_000)],
  );
  return result(content, "updated", "已回填视频号公开元数据");
}

async function saveBackfillStatus(id: string, detail: string) {
  await query(
    `update viral_contents set risk_note = ${backfillStatusSql.replace("$BACKFILL_STATUS", "$2")}, updated_at = now() where id = $1`,
    [id, `自动解析状态：${detail}`],
  );
}

function result(content: CuratedContent, status: BackfillStatus, detail: string): BackfillResult {
  return { id: content.id, platform: content.platform, sourceUrl: content.source_url, status, detail };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim(); }
function metricValue(value: number | undefined) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function unixTimeValue(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message.slice(0, 300) : "未知错误"; }
