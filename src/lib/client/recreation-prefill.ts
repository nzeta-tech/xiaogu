export type RecreationFieldValue = string | string[];

export function normalizeRecreationInputPayload(payload: unknown): Record<string, RecreationFieldValue> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.fromEntries(Object.entries(payload).filter((entry): entry is [string, RecreationFieldValue] => {
    const value = entry[1];
    return typeof value === "string" || Array.isArray(value) && value.every((item) => typeof item === "string");
  }));
}
