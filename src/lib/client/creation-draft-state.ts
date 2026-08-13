export type CreationDraftStorage = Pick<Storage, "getItem" | "removeItem">;

export function readCreationDraft<T extends Record<string, unknown>>(
  storage: CreationDraftStorage,
  key: string,
  shouldRestore: boolean,
): T | null {
  if (!shouldRestore) {
    storage.removeItem(key);
    return null;
  }

  const saved = storage.getItem(key);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid creation draft");
    return parsed as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}
