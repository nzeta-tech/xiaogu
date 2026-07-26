import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Pool } = require("/xiaogu/node_modules/.pnpm/pg@8.20.0/node_modules/pg");
const CDP_ENDPOINT = "http://127.0.0.1:9222";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const contents = await pool.query(`
    select id, source_url
    from viral_contents
    where source_type = 'manual' and platform = '视频号' and status = 'published'
    order by sort_order
  `);
  const results = [];

  for (const content of contents.rows) {
    let pageId = null;
    try {
      pageId = await openPage(content.source_url);
      const metadata = await waitForMetadata(pageId);
      const publishedAt = dateToIso(metadata.publishedDate);
      await pool.query(
        `update viral_contents
         set title = $2,
             source_title = $2,
             source_author = coalesce(nullif($3, ''), source_author),
             thumbnail_url = coalesce(nullif($4, ''), thumbnail_url),
             summary = $2,
             publish_at = coalesce($5::timestamptz, publish_at),
             article_body = case when $6 <> '' then $6 else article_body end,
             metric_label = '互动待核验',
             metric_value = null,
             metric_unit = '',
             risk_note = concat_ws(E'\\n',
               nullif(regexp_replace(risk_note, E'\\n?自动解析状态：[^\\n]*', '', 'g'), ''),
               '自动解析状态：已通过已登录视频号作品页回填公开元数据。'
             ),
             updated_at = now()
         where id = $1`,
        [content.id, metadata.title.slice(0, 160), metadata.author, metadata.coverUrl, publishedAt, metadata.text.slice(0, 20_000)],
      );
      results.push({ status: "updated", title: metadata.title, author: metadata.author, publishedAt });
    } catch (error) {
      results.push({ status: "failed", sourceUrl: content.source_url, error: error instanceof Error ? error.message : "未知错误" });
    } finally {
      if (pageId) await closePage(pageId).catch(() => {});
    }
  }
  console.log(JSON.stringify(results, null, 2));
}

async function openPage(sourceUrl) {
  const response = await fetch(`${CDP_ENDPOINT}/json/new?${encodeURIComponent(sourceUrl)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`无法打开视频号页面（HTTP ${response.status}）。`);
  const page = await response.json();
  if (!page.id) throw new Error("浏览器没有返回新页面标识。");
  return page.id;
}

async function waitForMetadata(pageId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const page = await getPage(pageId);
    if (!page?.webSocketDebuggerUrl) throw new Error("视频号页面已关闭。");
    const response = await sendCdpCommand(page.webSocketDebuggerUrl, "Runtime.evaluate", {
      expression: `JSON.stringify((() => {
        const root = document.querySelector('.page-feed');
        const title = document.querySelector('.feed-desc-wrap.clickable-area')?.textContent?.trim() || '';
        const author = document.querySelector('.author-name')?.textContent?.trim() || '';
        const text = root?.innerText?.trim() || '';
        const coverUrl = document.querySelector('img.video-player')?.src || '';
        const publishedDate = text.match(/\\d{4}年\\d{1,2}月\\d{1,2}日/)?.[0] || '';
        return { title, author, text, coverUrl, publishedDate };
      })())`,
      returnByValue: true,
    });
    const metadata = JSON.parse(response.result?.value || "{}");
    // The title is rendered before the date. Waiting for it avoids preserving the
    // seed-time timestamp as though it were the video's actual publish date.
    if (metadata.title && metadata.author && metadata.text && metadata.publishedDate) return metadata;
    await delay(1_500);
  }
  throw new Error("视频号作品页加载超时或未返回标题、作者。请确认浏览器仍保持登录。 ");
}

async function getPage(pageId) {
  const pages = await fetch(`${CDP_ENDPOINT}/json/list`).then((response) => response.json());
  return pages.find((page) => page.id === pageId);
}

async function closePage(pageId) {
  await fetch(`${CDP_ENDPOINT}/json/close/${pageId}`);
}

function dateToIso(value) {
  const match = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(value || "");
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T00:00:00+08:00` : null;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function sendCdpCommand(url, method, params = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => { socket.close(); reject(new Error("CDP 请求超时。")); }, 10_000);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ id: 1, method, params })));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timeout); socket.close();
      message.error ? reject(new Error(`CDP 请求失败：${message.error.message || "未知错误"}`)) : resolve(message.result ?? {});
    });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("CDP 连接失败。")); });
  });
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
