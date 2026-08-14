export type CreatorStyleResult = {
  id: string;
  label: string;
  content: string;
};

export function buildPersistedCreatorStyleText(results: CreatorStyleResult[]) {
  return results
    .map((result) => result.content.trim())
    .filter(Boolean)
    .join("\n\n");
}
