import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://www.chanjing.cc/api";
const SOURCE_PAGE = "https://www.chanjing.cc/ai-template/?from=sidebar_template";
const outputRoot = path.resolve(
  process.argv[2] || "research/chanjing-ai-templates",
);

async function post(endpoint, body) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(`${endpoint}: ${result.msg || `code ${result.code}`}`);
  }
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

async function download(url, destination) {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
  return { file: path.relative(outputRoot, destination), bytes: bytes.length };
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

const tagData = await post("/template_video/tag/list", {
  video_type: 1,
  page: 1,
  size: 100,
});

const templates = [];
let page = 1;
let totalPages = 1;
do {
  const data = await post("/template_video/list", {
    video_type: 1,
    tag_id: [],
    page,
    size: 50,
  });
  templates.push(...(data.list || []));
  totalPages = data.page_info?.total_page || 1;
  page += 1;
} while (page <= totalPages);

const tagById = new Map((tagData.list || []).map((tag) => [tag.id, tag.tag_name]));
const errors = [];

const downloadedTemplates = await mapLimit(templates, 4, async (template, index) => {
  const directory = path.join(outputRoot, "templates", String(template.video_id));
  await mkdir(directory, { recursive: true });

  const assets = {};
  const jobs = [
    ["preview_video", template.video_url, "preview"],
    ["cover", template.cover, "cover"],
    ["avatar", template.avatar, "avatar"],
    ...((template.ref_resources || []).map((asset, assetIndex) => [
      `reference_${assetIndex + 1}`,
      asset.url,
      `reference-${assetIndex + 1}`,
    ])),
  ].filter(([, url]) => Boolean(url));

  await Promise.all(jobs.map(async ([key, url, basename]) => {
    const fallback = key === "preview_video" ? ".mp4" : ".jpg";
    const destination = path.join(directory, `${basename}${extensionFor(url, fallback)}`);
    try {
      assets[key] = { source_url: url, ...(await download(url, destination)) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assets[key] = { source_url: url, error: message };
      errors.push({ video_id: template.video_id, asset: key, error: message });
    }
  }));

  const metadata = {
    ...template,
    tag_names: (template.tag_id || []).map((id) => tagById.get(id)).filter(Boolean),
    local_assets: assets,
  };
  await writeFile(
    path.join(directory, "metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  process.stdout.write(`[${index + 1}/${templates.length}] ${template.title}\n`);
  return metadata;
});

const catalog = {
  source_page: SOURCE_PAGE,
  source_api: `${API_BASE}/template_video/list`,
  fetched_at: new Date().toISOString(),
  usage: "Research copy only. Re-check Chanjing licensing before product or commercial reuse.",
  categories: tagData.list || [],
  count: downloadedTemplates.length,
  templates: downloadedTemplates,
  errors,
};

await writeFile(
  path.join(outputRoot, "catalog.json"),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
await writeFile(
  path.join(outputRoot, "README.md"),
  `# 蝉镜 AI 模板研究副本\n\n` +
    `- 来源：${SOURCE_PAGE}\n` +
    `- 抓取时间：${catalog.fetched_at}\n` +
    `- 分类数：${catalog.categories.length}\n` +
    `- 模板数：${catalog.count}\n` +
    `- 下载异常：${errors.length}\n\n` +
    `每个模板目录包含 \`metadata.json\`，以及公开可访问的预览视频、封面、人物图和参考图。` +
    `这些文件仅作为产品研究副本；接入产品或商用前需重新确认蝉镜的素材授权和平台条款。\n`,
);

console.log(`Saved ${downloadedTemplates.length} templates to ${outputRoot}`);
if (errors.length) console.log(`${errors.length} assets could not be downloaded; see catalog.json`);
