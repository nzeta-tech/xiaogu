import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import sharp from "sharp";

dotenv.config({ quiet: true });

const outputDir = path.resolve("public/examples/image-card-styles");
const tempDir = path.resolve(".tmp/image-card-style-regeneration");
const apiKey =
  process.env.OPENAI_IMAGE_API_KEY ??
  process.env.IMAGE_MODEL_API_KEY ??
  process.env.OPENAI_API_KEY ??
  process.env.MODEL_API_KEY;
const baseUrl = (process.env.OPENAI_IMAGE_API_BASE ?? process.env.MODEL_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";

const sharedContent = {
  title: "四类正在贬值的资产",
  labels: ["房产", "商铺", "学历", "另类投资品"],
  conclusion: "账面价值，不等于真实可变现价值",
  closing: "拿着旧地图，走不了新路",
};

const styles = [
  ["illustration", "暖米色纸张底，铅笔线稿加轻水彩晕染，手绘边框和温暖小元素穿插，像知识插画海报。"],
  ["whiteboard", "真实白板拍照感，蓝红马克笔手写，方框、波浪线、圈画标注明显，像现场讲解。"],
  ["zen", "米白宣纸底，淡墨、浅褐、灰绿低饱和，留白充足，东方意境，安静克制。"],
  ["line-illustration", "奶油纸底，黑灰细线手绘，少量黄色点题，像轻杂志知识插画版面。"],
  ["luxury", "黑金或深蓝金高端质感，精致材质背景，排版高级，像奢侈品牌专题卡片。"],
  ["magazine", "编辑部专题跨页风，留白多，出版物质感，像杂志专题页。"],
  ["graffiti", "街头墙面底，喷漆、粉笔、蜡笔颗粒感明显，边缘自由，有城市涂鸦海报气质。"],
  ["event-stage", "深蓝舞台大屏主视觉，会场空间感、灯光、观众剪影明确，像演讲现场投屏。"],
  ["handwritten-notes", "真实纸张底，黑红双色手写，批注感强，像认真整理过的一页手写提纲。"],
  ["clay", "软糯粘土材质，模块像手工捏制方块，立体可爱，但信息仍清晰。"],
  ["minimal-drawing", "纸张底，黑色线稿为主，少量橙粉高亮，极简手绘，留白很多。"],
  ["business", "深色商务卡片，黑底或深灰底，金色标题和细线分隔，稳重专业可信。"],
  ["blackboard", "黑板粉笔报风格，粉尘颗粒和彩色粉笔字明显，像一整块课堂板报。"],
  ["flat-knowledge", "米白底配青绿和深蓝信息卡，2D 扁平图标和圆角模块，知识信息图感强。"],
  ["morandi", "低饱和米黄、灰绿、浅棕配色，柔和纹理背景，整体安静温柔。"],
  ["science-sketch", "科普板书和知识栏目页风格，步骤编号、箭头、小插画并重，像手绘科普页。"],
  ["dark-pro", "深蓝黑底，金色标题与描边，分栏清晰，夜间专业主视觉。"],
  ["fresh-card", "浅米白和浅蓝浅绿点缀，圆角卡片柔和轻盈，整体清爽治愈。"],
  ["daily-sign", "氛围日签风，主标题和一句总结最重要，纸感和柔和光影精致简洁。"],
  ["study", "学霸笔记和复习资料感，编号、荧光笔、重点线、手写注释自然出现。"],
  ["large-sign", "超大中文主标题占据主体，其余信息极少，背景简洁但有纸感点缀。"],
  ["black-white", "黑白灰单色高对比，报刊、印刷、极简海报感，几乎不用彩色。"],
  ["scrapbook", "手账拼贴风，便签、贴纸、纸胶带、剪裁边、虚线箭头丰富但层次清晰。"],
  ["white-orange-blue", "白底主画面，橙蓝双色点题，模块规整，现代简洁信息卡。"],
  ["daily", "日报或简报信息图风格，模块化排版，标题和数字感强，正式利落。"],
];

function parseOnlyArg() {
  const onlyArg = process.argv.find((item) => item.startsWith("--only="));
  if (!onlyArg) return null;
  return new Set(
    onlyArg
      .replace("--only=", "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function buildPrompt(styleName, directive) {
  return [
    "Use case: infographic-diagram",
    "Asset type: style preview image for a Chinese content creation app",
    "Primary request: Create one portrait knowledge card in Chinese. The content theme must be the same across all styles so users compare style rather than content.",
    "Scene/backdrop: one complete vertical card poster, no device mockup, no collage of multiple pages",
    `Style/medium: ${styleName}；${directive}`,
    "Composition/framing: portrait 3:4 card, one single finished page, title at top, four clear modules in the middle, one conclusion strip, one short closing line at bottom",
    "Lighting/mood: polished, editorial, intentional, publish-ready",
    "Text (verbatim):",
    `"四类正在贬值的资产"`,
    `"房产"`,
    `"商铺"`,
    `"学历"`,
    `"另类投资品"`,
    `"账面价值，不等于真实可变现价值"`,
    `"拿着旧地图，走不了新路"`,
    "Constraints: Chinese must be legible; use only the Chinese text listed above; keep the page clean; emphasize hierarchy; each of the four labels should be readable; title must be the largest text; the conclusion strip and the bottom closing line must both appear; no logos; no watermark; no brand names; no English text; no extra paragraphs of tiny text; no financial product promotion.",
    "Avoid: blurry text, duplicated cards, extra hands holding the card, phone frames, screenshots, UI chrome, QR codes.",
  ].join("\n");
}

async function requestImage(prompt) {
  if (!apiKey) throw new Error("Missing image API key.");

  for (const size of ["1024x1536", "1024x1024"]) {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        quality: "low",
        output_format: "jpeg",
      }),
    }).catch((error) => ({ ok: false, error }));

    if ("error" in response) {
      throw response.error;
    }

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      if (size === "1024x1536") {
        console.warn(`Retrying with square fallback after ${response.status}: ${message.slice(0, 120)}`);
        continue;
      }
      throw new Error(`Image API failed: ${response.status} ${message.slice(0, 200)}`);
    }

    const payload = await response.json();
    const b64 = payload?.data?.[0]?.b64_json;
    if (typeof b64 === "string" && b64.length > 0) {
      return Buffer.from(b64, "base64");
    }
  }

  throw new Error("Image API returned no image data.");
}

async function saveProcessedImage(buffer, name) {
  const tempPath = path.join(tempDir, `${name}.jpg`);
  const outputPath = path.join(outputDir, `${name}.webp`);
  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(tempPath, buffer);
  await sharp(buffer)
    .resize(768, 1024, { fit: "cover", position: "attention" })
    .webp({ quality: 88 })
    .toFile(outputPath);
  return { tempPath, outputPath };
}

async function verifyImage(filePath) {
  const meta = await sharp(filePath).metadata();
  if (meta.width !== 768 || meta.height !== 1024 || meta.format !== "webp") {
    throw new Error(`Unexpected output for ${path.basename(filePath)}: ${meta.format} ${meta.width}x${meta.height}`);
  }
}

async function main() {
  const only = parseOnlyArg();
  const targets = only ? styles.filter(([name]) => only.has(name)) : styles;
  if (targets.length === 0) {
    throw new Error("No matching styles for --only.");
  }

  await fs.mkdir(outputDir, { recursive: true });

  for (const [name, directive] of targets) {
    const prompt = buildPrompt(name, directive);
    console.log(`Generating ${name}...`);
    const raw = await requestImage(prompt);
    const saved = await saveProcessedImage(raw, name);
    await verifyImage(saved.outputPath);
    console.log(`Saved ${saved.outputPath}`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  console.log("Done.");
  console.log(`Model: ${model}`);
  console.log(`Base content: ${sharedContent.title} / ${sharedContent.labels.join("、")} / ${sharedContent.conclusion} / ${sharedContent.closing}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
