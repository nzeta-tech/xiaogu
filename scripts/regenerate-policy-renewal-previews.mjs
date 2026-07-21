import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import sharp from "sharp";

dotenv.config({ quiet: true });

const outputDir = path.resolve("public/examples/policy-renewal-styles");
const tempDir = path.resolve(".tmp/policy-renewal-previews");
const apiKey =
  process.env.OPENAI_IMAGE_API_KEY ??
  process.env.IMAGE_MODEL_API_KEY ??
  process.env.OPENAI_API_KEY ??
  process.env.MODEL_API_KEY;
const baseUrl = (process.env.OPENAI_IMAGE_API_BASE ?? process.env.MODEL_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";

const prompts = [
  {
    name: "renewal-handwritten",
    prompt: [
      "Use case: infographic-diagram",
      "Asset type: preview image for a policy renewal reminder card style option in a Chinese insurance content app",
      "Primary request: Create a vertical handwritten service-note style insurance renewal reminder card inspired by a warm hand-drawn reminder sheet.",
      "Scene/backdrop: warm off-white paper texture, full single-page poster, no phone frame",
      "Subject: a Chinese insurance renewal reminder note with title, customer salutation, important information list, service note, contact note, and a small female consultant portrait in the lower right",
      "Style/medium: marker pen plus pencil sketch, handwritten note aesthetic, soft paper grain, red pen circles and arrows",
      "Composition/framing: title at top, salutation below, middle body uses list structure and note blocks, lower right has consultant portrait, footer has signature label",
      "Lighting/mood: caring, friendly, trustworthy, handmade",
      "Color palette: cream white, black ink, muted red annotations, gray-blue accents",
      "Materials/textures: paper grain, marker strokes, hand-drawn frames, sticky note feel",
      "Text (verbatim): \"保单续费提醒\" \"亲爱的牟女士\" \"一、重要信息\" \"您在永M金融购买万年Q保单\" \"保单号：H6888888\" \"将于2026年6月6日进入续费期\" \"您的保费为5W美金\" \"如需续保缴费操作流程，请随时联系我\" \"二、我的服务\" \"有任何疑问或需要协助，我都在这里为您服务。\" \"三、联系我\" \"任何问题，欢迎随时联系我～\" \"您的小谷保险顾问\" \"小谷顾问\"",
      "Constraints: Chinese must be legible; keep it clearly in the renewal reminder scenario; look like a beautiful sample card instead of a real official document; keep all key text fully visible with generous outer margins; no logo; no QR code; no watermark; one complete poster only",
      "Avoid: generic marketing flyer, photoreal screenshot, extra people, tiny dense paragraphs, English text",
    ].join("\n"),
  },
  {
    name: "renewal-warm",
    prompt: [
      "Use case: infographic-diagram",
      "Asset type: preview image for a policy renewal reminder card style option in a Chinese insurance content app",
      "Primary request: Create a vertical warm consultant-style insurance renewal reminder card inspired by a gentle illustrated advisor poster.",
      "Scene/backdrop: soft cream interior with light plants and subtle window light, one finished poster page",
      "Subject: left side shows renewal reminder information blocks, right side shows a graceful female consultant illustration in a light blue suit",
      "Style/medium: soft watercolor and colored-pencil illustration, elegant and friendly",
      "Composition/framing: large title at top, ribbon-style customer salutation, left info panel with several rows, right half-body consultant portrait, bottom signature",
      "Lighting/mood: warm, reassuring, premium, human-centered",
      "Color palette: cream, soft green, light blue, warm beige, gentle gold accents",
      "Materials/textures: paper texture, watercolor wash, pencil outlines",
      "Text (verbatim): \"保单续费提醒\" \"亲爱的牟女士\" \"您在永M金融购买万年Q保单\" \"保单号：H6888888\" \"续费期：2026年6月6日\" \"保费：5W美金\" \"如需续保缴费操作流程，请随时联系我\" \"待核实项\" \"小谷保险顾问小谷顾问\"",
      "Constraints: Chinese must be legible; sample content must clearly be about policy renewal reminder; keep the consultant elegant and trustworthy; keep all key text fully visible with generous outer margins; no logo; no QR code; no watermark; no extra English text",
      "Avoid: hard corporate poster look, photoreal person photo, extra tables, clutter, duplicate cards",
    ].join("\n"),
  },
  {
    name: "renewal-business",
    prompt: [
      "Use case: infographic-diagram",
      "Asset type: preview image for a policy renewal reminder card style option in a Chinese insurance content app",
      "Primary request: Create a vertical clean business-style insurance renewal reminder card using the same sample content as the handwritten and warm versions, but more concise and polished.",
      "Scene/backdrop: minimalist bright background, single complete poster, no device frame",
      "Subject: renewal reminder card with strong title, clean structured info modules, subtle professional accents, small advisor sign-off area",
      "Style/medium: modern editorial business card design, crisp Chinese typography, restrained premium layout",
      "Composition/framing: top title bar, centered information modules for customer salutation, policy info, renewal date, premium, and contact reminder, bottom advisor signature",
      "Lighting/mood: professional, clear, reassuring, premium",
      "Color palette: white, dark teal, muted gold, warm gray",
      "Materials/textures: light paper texture, refined blocks, thin divider lines",
      "Text (verbatim): \"保单续费提醒\" \"亲爱的牟女士\" \"您在永M金融购买万年Q保单\" \"保单号：H6888888\" \"续费期：2026年6月6日\" \"保费：5W美金\" \"如需续保缴费操作流程，请随时联系我\" \"小谷保险顾问小谷顾问\"",
      "Constraints: Chinese must be legible; keep it clearly as a renewal reminder preview; modern business style but not cold; keep all key text fully visible with generous outer margins; no logo; no QR code; no watermark; no extra English text",
      "Avoid: dark finance ad, PPT screenshot, photoreal office scene, excessive paragraphs",
    ].join("\n"),
  },
];

async function requestImage(prompt) {
  if (!apiKey) throw new Error("Missing image API key.");

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1536",
      quality: "low",
      output_format: "jpeg",
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Image API failed: ${response.status} ${message.slice(0, 200)}`);
  }

  const payload = await response.json();
  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image API returned no image data.");
  return Buffer.from(b64, "base64");
}

async function saveProcessedImage(buffer, name) {
  const tempPath = path.join(tempDir, `${name}.jpg`);
  const outputPath = path.join(outputDir, `${name}.webp`);
  await fs.mkdir(tempDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(tempPath, buffer);
  await sharp(buffer)
    .resize(768, 1024, { fit: "contain", background: "#f8f4ea" })
    .webp({ quality: 88 })
    .toFile(outputPath);
  return outputPath;
}

async function verifyImage(filePath) {
  const meta = await sharp(filePath).metadata();
  if (meta.width !== 768 || meta.height !== 1024 || meta.format !== "webp") {
    throw new Error(`Unexpected output for ${path.basename(filePath)}: ${meta.format} ${meta.width}x${meta.height}`);
  }
}

for (const item of prompts) {
  console.log(`Generating ${item.name}...`);
  const raw = await requestImage(item.prompt);
  const filePath = await saveProcessedImage(raw, item.name);
  await verifyImage(filePath);
  console.log(`Saved ${filePath}`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

console.log("Done.");
