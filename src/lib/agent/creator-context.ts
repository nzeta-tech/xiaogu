export type CreatorContextMode = "full" | "none" | "positioning" | "topic-positioning" | "writing";

export function topicPositioningPersona(identity: { core_identity: string[]; life_roles: string[] }) {
  // Deliberately exclude summary.positioning_hint and personal_story_anchor.
  return [...identity.core_identity, ...identity.life_roles].filter(Boolean).slice(0, 8).join(" · ");
}

export function selectAvatarMemoriesForContext<T extends { category: string }>(memories: T[], mode: CreatorContextMode) {
  if (mode === "none") return [];
  if (mode === "topic-positioning") {
    // Topic-specific stories are selected separately, never treated as identity.
    return memories.filter((item) => ["identity", "audience", "expertise", "boundary"].includes(item.category)).slice(0, 8);
  }
  if (mode === "positioning") {
    const useful = new Set(["identity", "audience", "expertise", "boundary", "story"]);
    return memories.filter((item) => useful.has(item.category)).slice(0, 8);
  }
  return memories;
}
