import type { CreationFieldValue } from "./output.ts";

const AVATAR_PHOTO_PATH = /^\/api\/avatar\/photos\/([0-9a-f-]{36})\/content(?:\?|$)/i;

export function collectReferenceImageValues(values: Record<string, CreationFieldValue>) {
  return [values.reference_image, values.portrait_reference_image]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
}

export function avatarPhotoIdFromReference(value: string) {
  return value.match(AVATAR_PHOTO_PATH)?.[1] ?? null;
}

export async function resolveCreationReferenceImages(input: {
  values: Record<string, CreationFieldValue>;
  loadOwnedAvatarPhoto: (assetId: string) => Promise<{ contentType: string; bytes: Buffer } | null>;
}) {
  const resolved: string[] = [];
  for (const value of collectReferenceImageValues(input.values)) {
    if (value.startsWith("data:image/")) {
      resolved.push(value);
      continue;
    }
    const assetId = avatarPhotoIdFromReference(value);
    if (!assetId) continue;
    const loaded = await input.loadOwnedAvatarPhoto(assetId);
    if (!loaded?.bytes.length || !loaded.contentType.startsWith("image/")) continue;
    resolved.push(`data:${loaded.contentType};base64,${loaded.bytes.toString("base64")}`);
  }
  return resolved;
}
