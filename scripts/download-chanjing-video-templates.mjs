import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const API_BASE = "https://www.chanjing.cc/api";
const SOURCE_PAGE = "https://www.chanjing.cc/template/";
const outputRoot = path.resolve(
  process.argv[2] || "research/chanjing-video-templates",
);

async function post(endpoint, body) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 0) throw new Error(`${endpoint}: ${result.msg}`);
  return result.data;
}

function extensionFor(url, fallback) {
  try {
    const extension = path.extname(new URL(url).pathname);
    return extension && extension.length <= 8 ? extension : fallback;
  } catch {
    return fallback;
  }
}

async function exists(file) {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  if (await exists(destination)) {
    return { file: path.relative(outputRoot, destination), bytes: (await stat(destination)).size };
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  if (!response.body) throw new Error(`${url}: empty response`);
  const temporary = `${destination}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return { file: path.relative(outputRoot, destination), bytes: (await stat(destination)).size };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

await mkdir(outputRoot, { recursive: true });
const categoryData = await post("/template/category_for_save", { show_app: "pc" });
const templates = [];

for (const direction of ["vertical", "horizontal"]) {
  let page = 1;
  let totalPages = 1;
  do {
    const data = await post("/template/list", {
      page,
      page_size: 50,
      direction,
      categories: [],
    });
    templates.push(...(data.list || []));
    totalPages = data.page_info?.total_page || 1;
    page += 1;
  } while (page <= totalPages);
}

const errors = [];
const downloadedTemplates = await mapLimit(templates, 32, async (template, index) => {
  const directory = path.join(outputRoot, "templates", template.id);
  await mkdir(directory, { recursive: true });
  const assets = {};
  for (const [key, url, basename, fallback] of [
    ["cover", template.cover, "cover", ".jpg"],
    ["preview_video", template.preview_video, "preview", ".mp4"],
  ]) {
    if (!url) continue;
    const destination = path.join(directory, `${basename}${extensionFor(url, fallback)}`);
    try {
      assets[key] = { source_url: url, ...(await download(url, destination)) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assets[key] = { source_url: url, error: message };
      errors.push({ template_id: template.id, asset: key, error: message });
    }
  }
  const metadata = { ...template, local_assets: assets };
  await writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  process.stdout.write(`[${index + 1}/${templates.length}] ${template.name}\n`);
  return metadata;
});

const catalog = {
  source_page: SOURCE_PAGE,
  source_api: `${API_BASE}/template/list`,
  fetched_at: new Date().toISOString(),
  usage: "Research copy only. Re-check Chanjing licensing before product or commercial reuse.",
  categories: categoryData.list || [],
  count: downloadedTemplates.length,
  counts_by_direction: Object.fromEntries(
    ["vertical", "horizontal"].map((direction) => [
      direction,
      downloadedTemplates.filter((template) => template.direction === direction).length,
    ]),
  ),
  templates: downloadedTemplates,
  errors,
};
await writeFile(path.join(outputRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(
  path.join(outputRoot, "README.md"),
  `# 蝉镜视频模板库研究副本\n\n` +
    `- 来源：${SOURCE_PAGE}\n` +
    `- 抓取时间：${catalog.fetched_at}\n` +
    `- 分类数：${catalog.categories.length}\n` +
    `- 模板数：${catalog.count}\n` +
    `- 竖屏：${catalog.counts_by_direction.vertical}\n` +
    `- 横屏：${catalog.counts_by_direction.horizontal}\n` +
    `- 下载异常：${errors.length}\n\n` +
    `每个模板目录包含公开可访问的封面、预览视频和 metadata.json。` +
    `这些文件仅作为产品研究副本；接入产品或商用前需重新确认素材授权和平台条款。\n`,
);
console.log(`Saved ${downloadedTemplates.length} templates to ${outputRoot}`);
if (errors.length) console.log(`${errors.length} assets could not be downloaded; see catalog.json`);
