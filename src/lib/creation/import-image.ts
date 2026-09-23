import sharp from "sharp";

export const importImageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export async function readUploadedImage(
  bytes: Buffer,
  extract: (dataUrl: string) => Promise<string>,
) {
  // Decode the actual file and normalize to a format accepted by the vision model.
  // Animated images contribute their first frame.
  const image = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer();
  const text = await extract(`data:image/jpeg;base64,${image.toString("base64")}`);
  if (!text.trim()) throw new Error("Image recognition unavailable");
  return `【图片内容识别（GIF 仅识别首帧）】\n${text.trim()}`;
}
