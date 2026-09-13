import sharp from "sharp";
import { isOperationalOnlyMaterial, stripOperationalMaterial } from "../workbuddy/material-quality.ts";

export function deriveVideoCoverHeadline(source: string) {
  const cleanSource = stripOperationalMaterial(source);
  const sectionTitle = cleanSource.match(/^##\s+(.+?)\s*$/m)?.[1]
    ?.replace(/\s+·[\s\S]*$/u, "")
    .replace(/[“”"]/g, "")
    .split(/[：:]/, 1)[0]
    ?.trim();
  if (sectionTitle && sectionTitle.length >= 6) return sectionTitle.slice(0, 16);
  const material = cleanSource
    .replace(/【[^】]+】/g, "\n")
    .replace(/[#*_>`]/g, " ")
    .trim();
  if (!material || isOperationalOnlyMaterial(material)) return "";
  const candidates = material.split(/\n+|[。！？!?]/)
    .map(line => line.replace(/^\s*(?:标题|主题|观点|口播文案)\s*[：:]\s*/u, "").trim())
    .filter(line => line.length >= 6 && line.length <= 32)
    .filter(line => !/(?:用户本次要求|应用执行目标|已经确认|生成|制作|继续处理)/u.test(line));
  const selected = candidates.find(line => /[，,:：]/.test(line)) ?? candidates[0]
    ?? material.replace(/\s+/g, "").slice(0, 16);
  return selected.replace(/[，,:：].*$/u, "").slice(0, 16).trim();
}

export function assertVideoCoverMaterial(source: string) {
  if (deriveVideoCoverHeadline(source)) return;
  throw new Error("视频封面缺少可用的正文素材，请返回上一步选择真实口播稿后重试；本次未开始生成。 ");
}

export async function renderVideoCoverHeadline(images: Array<{ id: string; url: string }>, headline: string) {
  return renderVideoCoverHeadlines(images, [headline]);
}

export async function renderVideoCoverHeadlines(images: Array<{ id: string; url: string }>, headlines: string[]) {
  if (!headlines.some(Boolean)) return images;
  return Promise.all(images.map(async (image, index) => {
    try {
      const headline = headlines[index] || headlines[0] || "";
      if (!headline) return image;
      const input = image.url.startsWith("data:image/")
        ? Buffer.from(image.url.slice(image.url.indexOf(",") + 1), "base64")
        : Buffer.from(await (await fetch(image.url)).arrayBuffer());
      const instance = sharp(input);
      const metadata = await instance.metadata();
      const width = metadata.width ?? 1024;
      const height = metadata.height ?? 1792;
      const lines = splitHeadline(headline, 7);
      const fontSize = Math.round(width * (lines.length > 2 ? 0.105 : 0.125));
      const lineHeight = Math.round(fontSize * 1.16);
      const blockHeight = lineHeight * lines.length + Math.round(fontSize * 0.7);
      const y = Math.round(height * 0.16);
      const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${Math.round(width * 0.07)}" y="${y - Math.round(fontSize * 0.5)}" width="${Math.round(width * 0.86)}" height="${blockHeight}" rx="${Math.round(fontSize * 0.22)}" fill="rgba(255,255,255,0.90)"/>
        <text x="50%" y="${y}" text-anchor="middle" dominant-baseline="hanging" font-family="PingFang SC, Heiti SC, Arial Unicode MS, sans-serif" font-size="${fontSize}" font-weight="800" fill="#102f29">${lines.map((line, index) => `<tspan x="50%" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>
      </svg>`;
      const output = await instance.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 90 }).toBuffer();
      return { ...image, url: `data:image/jpeg;base64,${output.toString("base64")}` };
    } catch {
      return image;
    }
  }));
}

function splitHeadline(value: string, size: number) {
  const characters = [...value.replace(/\s+/g, "")];
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += size) lines.push(characters.slice(index, index + size).join(""));
  return lines.slice(0, 3);
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ?? character);
}
