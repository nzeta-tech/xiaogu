export type CreationHandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PREFIX = "creation-handoff:";

export function saveCreationHandoff(
  storage: CreationHandoffStorage,
  destination: string,
  values: Record<string, string>,
) {
  storage.setItem(`${PREFIX}${destination}`, JSON.stringify(values));
}

export function consumeCreationHandoff(
  storage: CreationHandoffStorage,
  destination: string,
) {
  const key = `${PREFIX}${destination}`;
  const saved = storage.getItem(key);
  storage.removeItem(key);
  if (!saved) return {};
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}
