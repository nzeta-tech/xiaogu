export const IMAGE_CARD_STYLE_LIMIT = 3;

export function normalizeImageCardStyles(value: unknown, limit = IMAGE_CARD_STYLE_LIMIT) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(source.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

export function toggleImageCardStyle(value: unknown, nextValue: string, limit = IMAGE_CARD_STYLE_LIMIT) {
  const selected = normalizeImageCardStyles(value, limit);
  if (selected.includes(nextValue)) return { styles: selected.filter((item) => item !== nextValue), limitReached: false };
  if (selected.length >= limit) return { styles: selected, limitReached: true };
  return { styles: [...selected, nextValue], limitReached: false };
}
