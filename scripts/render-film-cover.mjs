import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const generated = "/Users/a2251/.codex/generated_images/019fba20-0f58-7bd1-82aa-0d65f83c2b51/exec-4b856acf-0a79-4ef8-b0ee-f5f117936849.png";
const outDir = path.join(root, "marketing-film", "assets", "covers");
const out = path.join(outDir, "xiaogu-brand-film-cover.png");
const source = path.join(outDir, "xiaogu-brand-film-cover-base.png");
const logo = path.join(root, "marketing-film", "assets", "brand", "xiaogu-logo.png");

await mkdir(outDir, { recursive: true });
await copyFile(generated, source);

const text = Buffer.from(`<svg width="2048" height="1152" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title { font-family: 'PingFang SC', 'Hiragino Sans GB', sans-serif; font-weight: 700; fill: #123b35; }
    .brand { font-family: 'PingFang SC', 'Hiragino Sans GB', sans-serif; font-weight: 600; fill: #167f72; }
    .sub { font-family: 'PingFang SC', 'Hiragino Sans GB', sans-serif; font-weight: 400; fill: #48716a; }
  </style>
  <rect x="112" y="184" width="6" height="274" rx="3" fill="#29b9a6"/>
  <text class="title" x="150" y="260" font-size="70">你说的每一句，</text>
  <text class="title" x="150" y="350" font-size="70">都值得被听见</text>
  <text class="sub" x="154" y="415" font-size="26">小谷 AI，陪每一位专业人士表达专业、沉淀信任</text>
  <line x1="152" y1="483" x2="630" y2="483" stroke="#7fcfc2" stroke-width="2"/>
  <text class="brand" x="152" y="540" font-size="32">小谷 AI · NZeta.ai</text>
  <text class="sub" x="152" y="585" font-size="22">https://xiaogu.nzeta.ai</text>
</svg>`);

const logoPng = await sharp(logo).resize({ width: 92, height: 92, fit: "contain" }).png().toBuffer();
await sharp(source)
  .resize(2048, 1152, { fit: "fill" })
  .composite([
    { input: text, top: 0, left: 0 },
    { input: logoPng, top: 668, left: 148 }
  ])
  .png({ compressionLevel: 9 })
  .toFile(out);

console.log(out);
