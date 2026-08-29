const LEGACY_TEXT_MODELS = new Set(["gpt-5.4", "gpt-5-4", "gpt_5_4"]);

export const XIAOGU_TEXT_MODEL = "gpt-5.6-terra";

export function resolveConfiguredTextModel(fallback = XIAOGU_TEXT_MODEL) {
  const configured = process.env.MODEL_NAME?.trim();
  if (!configured) return fallback;
  return LEGACY_TEXT_MODELS.has(configured.toLowerCase()) ? XIAOGU_TEXT_MODEL : configured;
}
