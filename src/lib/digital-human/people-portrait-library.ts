import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";

const snapshotRoot = process.env.SPOKEN_PUBLIC_ASSET_ROOT || path.join(process.cwd(), "research", "provider-scene-catalog", "2026-08-27");
const catalogPath = path.join(snapshotRoot, "chanjing", "public-digital-humans.json");

type RawPerson = {
  id: string;
  name?: string;
  gender?: string;
  tag_names?: string[];
  figures?: Array<{ type?: string; downloaded_cover?: { file?: string } }>;
};
export type PeoplePortrait = {
  id: string;
  name: string;
  description: string;
  category: string;
  figureType: string;
  imageUrl: string;
  filePath: string;
};

let cache: { modified: number; items: PeoplePortrait[] } | null = null;
const categoryPriority = ["金融保险", "金融保险顾问", "商务", "休闲", "国风", "教育", "法律", "大健康", "带货博主", "主持人", "教师", "律师", "电商", "运动"];
const figureLabels: Record<string, string> = { sit_body: "坐姿", whole_body: "站姿", circle_view: "圆形半身", half_body: "半身" };

export async function listPeoplePortraits() {
  const info = await stat(catalogPath);
  if (cache?.modified === info.mtimeMs) return cache.items;
  const source = JSON.parse(await readFile(catalogPath, "utf8")) as { items?: RawPerson[] };
  const items: PeoplePortrait[] = [];
  const seenPeople = new Set<string>();
  for (const person of source.items || []) {
    if (seenPeople.has(person.id)) continue;
    seenPeople.add(person.id);
    const tags = (person.tag_names || []).filter(Boolean);
    if (tags.includes("农业")) continue;
    // The first figure is the main cover; subsequent figures are alternate crops of the same person.
    const figure = person.figures?.[0];
    if (!figure) continue;
    const relative = figure.downloaded_cover?.file || "";
    if (!relative.startsWith("chanjing/covers/") || !/^[\p{L}\p{N}._/-]+$/u.test(relative) || relative.split("/").includes("..")) continue;
    const filePath = path.join(snapshotRoot, relative);
    // Transparent cutout covers render as white background cards in the photo library.
    if ((await sharp(filePath).metadata()).hasAlpha) continue;
    const id = `${person.id}-0`;
    const category = categoryPriority.find((tag) => tags.includes(tag)) || "其他";
    const age = tags.find((tag) => ["青年", "中年", "老年"].includes(tag)) || "";
    const pose = figureLabels[figure.type || ""] || "口播形象";
    items.push({
      id,
      name: person.name || "口播形象",
      description: [person.gender, category, age, pose].filter(Boolean).join(" · "),
      category,
      figureType: figure.type || "",
      imageUrl: `/api/spoken-photo-templates/${encodeURIComponent(id)}/image`,
      filePath,
    });
  }
  cache = { modified: info.mtimeMs, items };
  return items;
}

export async function getPeoplePortrait(id: string) {
  if (!/^[a-zA-Z0-9-]{2,100}$/.test(id)) return null;
  return (await listPeoplePortraits()).find((item) => item.id === id) || null;
}
