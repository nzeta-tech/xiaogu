import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(process.argv[2] || "research/provider-scene-catalog/2026-08-27");
const chanjingSkill = "/Users/a2251/.codex/skills/chanjing-video-compose/scripts/list_figures.py";
const videoSampleLimit = 12;

function safeName(value) {
  return String(value || "asset").normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "asset";
}

function extension(url, contentType, fallback) {
  const pathname = new URL(url).pathname;
  const found = pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (found) return found;
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return fallback;
}

async function command(file, args) {
  const { stdout } = await execFileAsync(file, args, { maxBuffer: 30 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function listHeygenStyles() {
  const all = [];
  let token = "";
  for (let page = 0; page < 5; page += 1) {
    const args = ["video-agent", "styles", "list", "--limit", "100"];
    if (token) args.push("--token", token);
    const payload = await command("heygen", args);
    all.push(...(payload.data || []));
    token = payload.next_token || "";
    if (!payload.has_more || !token) break;
  }
  return all;
}

async function listChanjingFigures() {
  const all = [];
  let pageInfo = null;
  for (let page = 1; page <= 4; page += 1) {
    const payload = await command("python3", [chanjingSkill, "--source", "common", "--page", String(page), "--page-size", "50", "--json"]);
    all.push(...(payload.data?.list || []));
    pageInfo = payload.data?.page_info || pageInfo;
    if (!pageInfo || page >= Number(pageInfo.total_page || page)) break;
  }
  return { list: all, pageInfo };
}

async function download(url, directory, stem, fallbackExtension) {
  if (!url) return null;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 80 * 1024 * 1024) throw new Error("asset exceeds 80MB research limit");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 80 * 1024 * 1024) throw new Error("asset exceeds 80MB research limit");
  const ext = extension(url, response.headers.get("content-type") || "", fallbackExtension);
  const file = path.join(directory, `${safeName(stem)}.${ext}`);
  await writeFile(file, bytes);
  return { file: path.relative(root, file), bytes: bytes.length, source_url: url };
}

async function mapLimit(items, limit, worker) {
  const result = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try { result[index] = await worker(items[index], index); }
      catch (error) { result[index] = { error: error instanceof Error ? error.message : String(error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return result;
}

function csv(rows) {
  const keys = ["provider", "id", "name", "category", "tags", "aspect_ratio", "figure_type", "width", "height", "bg_replace", "thumbnail_file", "preview_video_file", "source_url"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [keys.join(","), ...rows.map((row) => keys.map((key) => quote(row[key])).join(","))].join("\n") + "\n";
}

await Promise.all([
  mkdir(path.join(root, "heygen", "thumbnails"), { recursive: true }),
  mkdir(path.join(root, "heygen", "preview-videos"), { recursive: true }),
  mkdir(path.join(root, "chanjing", "covers"), { recursive: true }),
  mkdir(path.join(root, "chanjing", "preview-videos"), { recursive: true }),
]);

const [heygenStyles, chanjing] = await Promise.all([listHeygenStyles(), listChanjingFigures()]);
const heygenThumbs = await mapLimit(heygenStyles, 6, (item) => download(item.thumbnail_url, path.join(root, "heygen", "thumbnails"), `${item.style_id}-${item.name}`, "jpg"));
const heygenVideos = await mapLimit(heygenStyles.slice(0, videoSampleLimit), 3, (item) => download(item.preview_video_url, path.join(root, "heygen", "preview-videos"), `${item.style_id}-${item.name}`, "mp4"));

const chanjingFigures = chanjing.list.flatMap((person) => (person.figures || []).map((figure, index) => ({ person, figure, index })));
const chanjingCovers = await mapLimit(chanjingFigures, 6, ({ person, figure, index }) => download(figure.cover, path.join(root, "chanjing", "covers"), `${person.id}-${index}-${person.name}-${figure.type}`, "png"));
const chanjingVideos = await mapLimit(chanjingFigures.slice(0, videoSampleLimit), 3, ({ person, figure, index }) => download(figure.display_video_url || figure.preview_video_url, path.join(root, "chanjing", "preview-videos"), `${person.id}-${index}-${person.name}-${figure.type}`, "mp4"));

const heygenCatalog = heygenStyles.map((item, index) => ({ ...item, downloaded_thumbnail: heygenThumbs[index] || null, downloaded_preview_video: index < videoSampleLimit ? heygenVideos[index] || null : null }));
const chanjingCatalog = chanjing.list.map((person) => ({ ...person, figures: (person.figures || []).map((figure, figureIndex) => { const flatIndex = chanjingFigures.findIndex((entry) => entry.person.id === person.id && entry.index === figureIndex); return { ...figure, downloaded_cover: chanjingCovers[flatIndex] || null, downloaded_preview_video: flatIndex < videoSampleLimit ? chanjingVideos[flatIndex] || null : null }; }) }));

const normalized = [
  ...heygenCatalog.map((item) => ({ provider: "heygen", id: item.style_id, name: item.name, category: item.tags?.[0] || "", tags: (item.tags || []).join("|"), aspect_ratio: item.aspect_ratio, thumbnail_file: item.downloaded_thumbnail?.file || "", preview_video_file: item.downloaded_preview_video?.file || "", source_url: item.thumbnail_url })),
  ...chanjingCatalog.flatMap((person) => person.figures.map((figure) => ({
    provider: "chanjing",
    id: person.id,
    name: person.name,
    category: person.tag_names?.[0] || "",
    tags: (person.tag_names || []).join("|"),
    aspect_ratio: figure.width > figure.height ? "16:9" : figure.width === figure.height ? "1:1" : "9:16",
    figure_type: figure.type,
    width: figure.width,
    height: figure.height,
    bg_replace: figure.bg_replace,
    thumbnail_file: figure.downloaded_cover?.file || "",
    preview_video_file: figure.downloaded_preview_video?.file || "",
    source_url: figure.cover,
  }))),
];

const fetchedAt = new Date().toISOString();
await Promise.all([
  writeFile(path.join(root, "heygen", "styles.json"), JSON.stringify({ fetched_at: fetchedAt, source: "HeyGen CLI OAuth / GET video-agent styles", count: heygenCatalog.length, items: heygenCatalog }, null, 2)),
  writeFile(path.join(root, "chanjing", "public-digital-humans.json"), JSON.stringify({ fetched_at: fetchedAt, source: "Chanjing Open API /open/v1/list_common_dp", page_info: chanjing.pageInfo, count: chanjingCatalog.length, items: chanjingCatalog }, null, 2)),
  writeFile(path.join(root, "catalog.csv"), csv(normalized)),
  writeFile(path.join(root, "README.md"), `# 禅境与 HeyGen 官方展示素材研究快照\n\n抓取时间：${fetchedAt}\n\n- HeyGen：Video Agent 官方 Style 元数据、全部可访问缩略图、前 ${videoSampleLimit} 个预览视频。\n- 禅境：公共数字人模板元数据、人物形态、标签、封面和前 ${videoSampleLimit} 个展示视频。\n- \`catalog.csv\`：跨平台归一化索引。\n- 原始 URL、平台 ID、名称、标签、画幅及本地文件路径均保留在 JSON 中。\n\n仅用于内部研究实验。素材版权及平台使用限制归原平台或原权利人所有，不应直接用于小谷正式产品或再分发。\n`),
]);

const failures = [...heygenThumbs, ...heygenVideos, ...chanjingCovers, ...chanjingVideos].filter((item) => item?.error);
console.log(JSON.stringify({ root, fetchedAt, heygenStyles: heygenCatalog.length, chanjingPeople: chanjingCatalog.length, chanjingFigures: chanjingFigures.length, downloadedFiles: normalized.filter((item) => item.thumbnail_file).length + normalized.filter((item) => item.preview_video_file).length, failures: failures.length }, null, 2));
