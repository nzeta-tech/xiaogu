export type CreativeCoachIdentityCard = {
  title?: string;
  summary?: string;
  scenarios?: string[];
  styleTags?: string[];
  bestFor?: string;
};

export function readCoachFeatureTags(card?: CreativeCoachIdentityCard | null) {
  const source = Array.isArray(card?.styleTags) && card.styleTags.length > 0
    ? card.styleTags
    : Array.isArray(card?.scenarios)
      ? card.scenarios
      : [];

  return [...new Set(source.map((item) => item.trim()).filter(Boolean))].slice(0, 3);
}

export const COACHES_PER_ROW = 3;

export function getNextVisibleCoachCount(current: number, total: number) {
  return Math.min(total, Math.max(COACHES_PER_ROW, current + COACHES_PER_ROW));
}

export function getVisibleCoachCountForSelection(
  current: number,
  selectedIds: string[],
  optionIds: string[],
) {
  const furthestSelectedPosition = optionIds.reduce((furthest, id, index) => (
    selectedIds.includes(id) ? Math.max(furthest, index + 2) : furthest
  ), 1);
  const required = Math.ceil(furthestSelectedPosition / COACHES_PER_ROW) * COACHES_PER_ROW;
  return Math.max(COACHES_PER_ROW, current, required);
}
