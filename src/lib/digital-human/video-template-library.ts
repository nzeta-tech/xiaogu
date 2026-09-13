import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type VideoTemplateCollection = "expressive" | "production";

export type XiaoguVideoTemplate = {
  id: string;
  collection: VideoTemplateCollection;
  name: string;
  category: string;
  categories: string[];
  aspectRatio: "9:16" | "16:9";
  width: number;
  height: number;
  durationSeconds: number | null;
  structure: string[];
  coverUrl: string;
  previewUrl: string;
};

type JsonRecord = Record<string, unknown>;
type Catalog = { templates?: JsonRecord[] };

const roots: Record<VideoTemplateCollection, string> = {
  expressive: path.join(process.cwd(), "research", "chanjing-ai-templates"),
  production: path.join(process.cwd(), "research", "chanjing-video-templates"),
};

const cache = new Map<VideoTemplateCollection, { modified: number; templates: XiaoguVideoTemplate[] }>();
const allowedCategories: Record<VideoTemplateCollection, Set<string>> = {
  expressive: new Set(["IP打造", "教育培训", "营销带货"]),
  production: new Set(["知识口播", "情感口播", "法律科普"]),
};

function asRecord(value: unknown) {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function localMediaUrl(collection: VideoTemplateCollection, id: string, kind: "cover" | "preview") {
  return `/api/digital-human-template-library/media/${collection}/${encodeURIComponent(id)}/${kind}`;
}

function normalize(collection: VideoTemplateCollection, row: JsonRecord): XiaoguVideoTemplate | null {
  const id = String(collection === "expressive" ? row.video_id || "" : row.id || "");
  if (!id) return null;
  const localAssets = asRecord(row.local_assets);
  const categories = collection === "expressive"
    ? (Array.isArray(row.tag_names) ? row.tag_names.map(String) : [])
    : (Array.isArray(row.categories) ? row.categories.map((item) => String(asRecord(item).name || "")).filter(Boolean) : []);
  const aspect = String(collection === "expressive" ? row.aspect_ratio || "9:16" : row.direction === "horizontal" ? "16:9" : "9:16") as "9:16" | "16:9";
  const coverAvailable = Boolean(asRecord(localAssets.cover).file || asRecord(localAssets.avatar).file);
  const previewAvailable = Boolean(asRecord(localAssets.preview_video).file);
  return {
    id,
    collection,
    name: String(collection === "expressive" ? row.title || "高表现力模板" : row.name || "成片模板"),
    category: categories[0] || "精选",
    categories,
    aspectRatio: aspect,
    width: Number(row.width || (aspect === "9:16" ? 1080 : 1920)),
    height: Number(row.height || (aspect === "9:16" ? 1920 : 1080)),
    durationSeconds: collection === "expressive" && Number(row.duration) ? Math.round(Number(row.duration) / 1000) : null,
    structure: Array.isArray(row.time_line) ? row.time_line.map(String) : [],
    coverUrl: coverAvailable ? localMediaUrl(collection, id, "cover") : "",
    previewUrl: previewAvailable ? localMediaUrl(collection, id, "preview") : "",
  };
}

async function loadCollection(collection: VideoTemplateCollection) {
  const catalogFile = path.join(roots[collection], "catalog.json");
  const info = await stat(catalogFile);
  const cached = cache.get(collection);
  if (cached?.modified === info.mtimeMs) return cached.templates;
  const catalog = JSON.parse(await readFile(catalogFile, "utf8")) as Catalog;
  const normalized = (catalog.templates || []).map((row) => normalize(collection, row)).filter((item): item is XiaoguVideoTemplate => item !== null);
  const templates = collection === "expressive"
    ? normalized.filter((item) => item.categories.some((category) => allowedCategories.expressive.has(category)))
    : (() => {
        const knowledge = normalized.filter((item) => item.categories.includes("知识口播")).slice(0, 50);
        const emotion = normalized.filter((item) => item.categories.includes("情感口播")).slice(0, 50);
        const law = normalized.filter((item) => item.categories.includes("法律科普"));
        const selected = new Set([...knowledge, ...emotion, ...law].map((item) => item.id));
        return normalized.filter((item) => selected.has(item.id));
      })();
  cache.set(collection, { modified: info.mtimeMs, templates });
  return templates;
}

export async function listXiaoguVideoTemplates(input: { collection: VideoTemplateCollection; category?: string; aspectRatio?: string; search?: string; page: number; pageSize: number }) {
  const templates = await loadCollection(input.collection).catch(() => []);
  const search = input.search?.trim().toLocaleLowerCase("zh-CN") || "";
  const filtered = templates.filter((template) => {
    if (input.category && input.category !== "全部" && !template.categories.includes(input.category)) return false;
    if (input.aspectRatio && input.aspectRatio !== "all" && template.aspectRatio !== input.aspectRatio) return false;
    return !search || `${template.name} ${template.categories.join(" ")} ${template.structure.join(" ")}`.toLocaleLowerCase("zh-CN").includes(search);
  });
  const categories = [...new Set(templates.flatMap((template) => template.categories))];
  const start = (input.page - 1) * input.pageSize;
  return { templates: filtered.slice(start, start + input.pageSize), categories, total: filtered.length, page: input.page, pageSize: input.pageSize };
}

export async function resolveXiaoguVideoTemplateMedia(collection: VideoTemplateCollection, id: string, kind: "cover" | "preview") {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return null;
  const directory = path.join(roots[collection], "templates", id);
  const files = await readdir(directory).catch(() => []);
  const prefix = kind === "cover" ? "cover." : kind === "preview" ? "preview." : "";
  let name = files.find((file) => file.startsWith(prefix));
  if (!name && kind === "cover" && collection === "expressive") name = files.find((file) => file.startsWith("avatar."));
  if (!name) return null;
  const file = path.join(directory, name);
  const info = await stat(file);
  const extension = path.extname(name).toLowerCase();
  const contentType = extension === ".mp4" ? "video/mp4" : extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return { file, size: info.size, contentType };
}
