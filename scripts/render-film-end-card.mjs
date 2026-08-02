import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outDir = path.join(root, "marketing-film", "assets", "covers");
const out = path.join(outDir, "xiaogu-brand-film-end-card.png");
const logo = path.join(root, "marketing-film", "assets", "brand", "xiaogu-logo.png");
const fairy = path.join(root, "marketing-film", "assets", "characters", "xiaogu-fairy.png");
const width = 2048;
const height = 1152;

await mkdir(outDir, { recursive: true });
const fairyPng = await sharp(fairy).resize({ height: 690, fit: "contain" }).png().toBuffer();
const logoPng = await sharp(logo).resize({ width: 125, height: 125, fit: "contain" }).png().toBuffer();
const overlay = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#082f2a"/><stop offset=".55" stop-color="#106c60"/><stop offset="1" stop-color="#1b9e8d"/></linearGradient><radialGradient id="glow"><stop stop-color="#b5f4e7" stop-opacity=".35"/><stop offset="1" stop-color="#b5f4e7" stop-opacity="0"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#bg)"/><ellipse cx="1710" cy="250" rx="560" ry="520" fill="url(#glow)"/><circle cx="120" cy="1000" r="330" fill="#80e6d5" opacity=".08"/><path d="M0 940 C420 800 620 1100 1050 920 S1580 770 2048 920" fill="none" stroke="#b7f7e9" stroke-opacity=".24" stroke-width="3"/>
  <style>.brand{font-family:'PingFang SC','Hiragino Sans GB',sans-serif;fill:#e9fff9;font-weight:700}.label{font-family:'PingFang SC','Hiragino Sans GB',sans-serif;fill:#a5eadc;font-weight:700}.body{font-family:'PingFang SC','Hiragino Sans GB',sans-serif;fill:#fff;font-weight:400}.site{font-family:'PingFang SC','Hiragino Sans GB',sans-serif;fill:#b9f7e9;font-weight:600}</style>
  <text class="brand" x="206" y="224" font-size="54">小谷 AI · NZeta.ai</text>
  <rect x="205" y="278" width="95" height="5" rx="2" fill="#77dfcf"/>
  <text class="label" x="205" y="404" font-size="28">愿景</text>
  <text class="body" x="205" y="468" font-size="45">让每一位专业人士的价值，</text><text class="body" x="205" y="530" font-size="45">都被看见、被理解、被信任。</text>
  <text class="label" x="205" y="666" font-size="28">使命</text>
  <text class="body" x="205" y="724" font-size="31">用懂行业、懂个人的 AI，帮助专业人士更轻松地表达专业、</text><text class="body" x="205" y="773" font-size="31">持续服务客户、沉淀长期影响力。</text>
  <text class="site" x="205" y="928" font-size="29">https://xiaogu.nzeta.ai</text>
  <text class="body" x="205" y="1013" font-size="24" opacity=".82">你说的每一句，都值得被听见</text>
</svg>`);

await sharp({ create: { width, height, channels: 4, background: "#0b3933" } })
  .composite([{ input: overlay, top: 0, left: 0 }, { input: logoPng, top: 98, left: 68 }, { input: fairyPng, top: 386, left: 1330 }])
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log(out);
