export const SPOKEN_VIDEO_PRICES = { basic: 50, smart: 100 } as const;

export type SpokenVideoProductionMode = keyof typeof SPOKEN_VIDEO_PRICES;

export function spokenVideoPrice(mode: SpokenVideoProductionMode) {
  return SPOKEN_VIDEO_PRICES[mode];
}
