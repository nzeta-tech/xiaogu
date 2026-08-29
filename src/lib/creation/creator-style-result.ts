export type CreatorStyleResult = {
  id: string;
  label: string;
  content: string;
  titles?: string[];
};

export function buildPersistedCreatorStyleText(results: CreatorStyleResult[]) {
  return results
    .map((result) => results.length > 1 ? `## ${result.label}版\n\n${result.content.trim()}` : result.content.trim())
    .filter(Boolean)
    .join("\n\n");
}
