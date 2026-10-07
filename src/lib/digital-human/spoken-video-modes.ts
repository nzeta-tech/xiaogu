export const SPOKEN_VIDEO_PRICES = { basic: 30, smart: 50 } as const;

export type SpokenVideoProductionMode = keyof typeof SPOKEN_VIDEO_PRICES;

export function spokenVideoPrice(mode: SpokenVideoProductionMode) {
  return SPOKEN_VIDEO_PRICES[mode];
}
