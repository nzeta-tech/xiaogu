import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outputDir = path.resolve("public/examples/policy-renewal-styles");

const fontSans = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
const fontHand = "'Kaiti SC','STKaiti','PingFang SC','Hiragino Sans GB',cursive";

const jobs = [
  {
    name: "renewal-handwritten",
    overlay: `
      <svg width="768" height="1024" xmlns="http://www.w3.org/2000/svg">
        <rect x="116" y="852" width="350" height="146" rx="24" fill="#f7f1e5" fill-opacity="0.96"/>
        <rect x="128" y="868" width="326" height="110" rx="20" fill="#f6f1e8" fill-opacity="0.72"/>
        <text x="291" y="915" text-anchor="middle" font-family=${JSON.stringify(fontHand)} font-size="28" fill="#2f241d">您的小谷保险顾问</text>
        <text x="291" y="972" text-anchor="middle" font-family=${JSON.stringify(fontHand)} font-size="54" fill="#241913">小谷顾问</text>
      </svg>
    `,
  },
  {
    name: "renewal-warm",
    overlay: `
      <svg width="768" height="1024" xmlns="http://www.w3.org/2000/svg">
        <rect x="108" y="828" width="394" height="155" rx="20" fill="#f8f1e2" fill-opacity="0.97"/>
        <rect x="132" y="851" width="346" height="2" fill="#c9b78f" fill-opacity="0.55"/>
        <text x="305" y="916" text-anchor="middle" font-family=${JSON.stringify(fontSans)} font-size="22" fill="#7f6b43">小谷保险顾问</text>
        <text x="305" y="962" text-anchor="middle" font-family=${JSON.stringify(fontHand)} font-size="46" fill="#5b4a2d">小谷顾问</text>
      </svg>
    `,
  },
  {
    name: "renewal-business",
    overlay: `
      <svg width="768" height="1024" xmlns="http://www.w3.org/2000/svg">
        <rect x="224" y="850" width="318" height="136" rx="26" fill="#fffaf0" fill-opacity="0.98"/>
        <line x1="254" y1="884" x2="512" y2="884" stroke="#c6a863" stroke-opacity="0.45" stroke-width="2"/>
        <line x1="254" y1="955" x2="512" y2="955" stroke="#c6a863" stroke-opacity="0.3" stroke-width="2"/>
        <text x="383" y="920" text-anchor="middle" font-family=${JSON.stringify(fontSans)} font-size="24" fill="#0f4f51">小谷保险顾问</text>
        <text x="383" y="948" text-anchor="middle" font-family=${JSON.stringify(fontSans)} font-size="24" fill="#0f4f51">小谷顾问</text>
      </svg>
    `,
  },
];

for (const job of jobs) {
  const target = path.join(outputDir, `${job.name}.webp`);
  const input = await fs.readFile(target);
  await sharp(input)
    .composite([{ input: Buffer.from(job.overlay), top: 0, left: 0 }])
    .webp({ quality: 88 })
    .toFile(`${target}.tmp`);
  await fs.rename(`${target}.tmp`, target);
  const meta = await sharp(target).metadata();
  if (meta.width !== 768 || meta.height !== 1024 || meta.format !== "webp") {
    throw new Error(`Unexpected output for ${job.name}: ${meta.format} ${meta.width}x${meta.height}`);
  }
  console.log(`Updated ${target}`);
}
