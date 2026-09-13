import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";

const rankingUrl = "https://tophub.today/n/2me3N3xdwj";
const execFileAsync = promisify(execFile);
const items = parse(await readRankingHtml());
if (items.length === 0) throw new Error("TopHub 页面未解析到有效抖音作品");

const client = new pg.Client({ connectionString: required("DATABASE_URL") });
await client.connect();
let imported = 0;
let covers = 0;
for (const [index, item] of items.entries()) {
  const automaticKey = createHash("sha256").update(item.sourceUrl).digest("hex");
  const saved = await client.query(
    `insert into viral_contents
      (title,platform,content_type,category,tags,source_url,source_title,source_author,thumbnail_url,
       summary,metric_label,metric_value,metric_unit,insight,risk_note,source_type,status,is_featured,
       sort_order,automatic_key,example_type,viral_score,fetched_at,publish_at)
     values ($1,'抖音','短视频','财经',$2::jsonb,$3,'TopHub 抖音财经榜',$4,$5,$1,'播放量',$6,'次播放',
       $7,'来自 TopHub 抖音财经榜；请以原作品实际信息为准。','automatic','published',false,$8,$9,'短视频',55,now(),now())
     on conflict (automatic_key) where source_type='automatic' and automatic_key is not null
     do update set title=excluded.title,tags=excluded.tags,source_author=excluded.source_author,
       thumbnail_url=excluded.thumbnail_url,metric_value=excluded.metric_value,summary=excluded.summary,
       insight=excluded.insight,risk_note=excluded.risk_note,status='published',sort_order=excluded.sort_order,
       fetched_at=now(),updated_at=now()
     returning id`,
    [item.title, JSON.stringify(["财经", "财经爆款", "TopHub"]), item.sourceUrl, item.author, item.thumbnailUrl || null,
      item.playCount, `TopHub 榜单第 ${index + 1} 位，播放 ${item.playCount.toLocaleString("zh-CN")} 次。`, index + 1, automaticKey],
  );
  imported += 1;
  const contentId = saved.rows[0].id;
  if (item.thumbnailUrl && await cacheCover(client, contentId, item.thumbnailUrl)) covers += 1;
}
await client.end();
console.log(JSON.stringify({ parsed: items.length, imported, covers }));

function parse(html) {
  const items = [];
  const seen = new Set();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const markup = row[1];
    const match = markup.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!match) continue;
    const sourceUrl = decode(match[1]);
    if (!/^https:\/\/www\.douyin\.com\/video\/\d+$/i.test(sourceUrl) || seen.has(sourceUrl)) continue;
    const title = text(decode(match[2]));
    if (!title) continue;
    seen.add(sourceUrl);
    const author = text(decode(markup.match(/<div\b[^>]*class=["'][^"']*item-desc[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || ""));
    const plays = text(decode(markup.match(/<div\b[^>]*class=["'][^"']*item-extra[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || ""));
    const thumbnailUrl = decode(markup.match(/<img\b[^>]*src=["']([^"']+)["']/i)?.[1] || "");
    items.push({ sourceUrl, title, author, thumbnailUrl, playCount: chineseMetric(plays) });
    if (items.length >= 20) break;
  }
  return items;
}

async function readRankingHtml() {
  const headers = {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/139 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
  try {
    const response = await fetch(rankingUrl, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`TopHub HTTP ${response.status}`);
    return await response.text();
  } catch {
    // 部分 Node/Undici 网络路径到 TopHub 会偶发连接超时；curl 读取的是同一公开页面。
    const { stdout } = await execFileAsync("curl", ["--fail", "--silent", "--show-error", "--compressed", "--max-time", "30", "-A", headers["user-agent"], "-H", `accept: ${headers.accept}`, rankingUrl], { maxBuffer: 2_000_000 });
    return stdout;
  }
}

async function cacheCover(client, contentId, sourceUrl) {
  try {
    const response = await fetch(sourceUrl, { headers: { referer: rankingUrl, "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || !contentType || !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(contentType) || bytes.length === 0 || bytes.length > 10 * 1024 * 1024) return false;
    const normalizedType = contentType === "image/jpg" ? "image/jpeg" : contentType;
    await client.query(
      `insert into viral_content_cover_assets(viral_content_id,content_type,image_data,source_url,sha256,size_bytes)
       values($1,$2,$3,$4,$5,$6)
       on conflict(viral_content_id) do update set content_type=excluded.content_type,image_data=excluded.image_data,
         source_url=excluded.source_url,sha256=excluded.sha256,size_bytes=excluded.size_bytes,updated_at=now()`,
      [contentId, normalizedType, bytes, sourceUrl, createHash("sha256").update(bytes).digest("hex"), bytes.length],
    );
    return true;
  } catch { return false; }
}

function decode(value) { return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim(); }
function text(value) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function chineseMetric(value) {
  const match = value.replace(/,/g, "").match(/([\d.]+)\s*(亿|万)?/);
  return match ? Math.round(Number(match[1]) * (match[2] === "亿" ? 100_000_000 : match[2] === "万" ? 10_000 : 1)) : 0;
}
function required(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
