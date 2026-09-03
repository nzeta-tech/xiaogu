export type CreatorContextMode = "full" | "none" | "positioning" | "writing";

export function selectAvatarMemoriesForContext<T extends { category: string }>(memories: T[], mode: CreatorContextMode) {
  if (mode === "none") return [];
  if (mode === "positioning") {
    const useful = new Set(["identity", "audience", "expertise", "boundary", "story"]);
    return memories.filter((item) => useful.has(item.category)).slice(0, 8);
  }
  return memories;
}
