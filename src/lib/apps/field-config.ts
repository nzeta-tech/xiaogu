import type { CreationField } from "./catalog.ts";

export function serializeCreationFieldConfig(field: CreationField) {
  return {
    accept: field.accept ?? null,
    multiple: field.multiple ?? false,
    maxLength: field.maxLength ?? null,
    maxFiles: field.maxFiles ?? null,
    visibleWhen: field.visibleWhen ?? null,
    visibleWhenAny: field.visibleWhenAny ?? null,
    revealAfter: field.revealAfter ?? null,
    presentation: field.presentation ?? null,
    step: field.step ?? null,
    inheritedSourceValue: field.inheritedSourceValue ?? null,
  };
}

export function hydrateCreationFieldConfig(config: Record<string, unknown>, fallback?: CreationField): Partial<CreationField> {
  return {
    accept: typeof config.accept === "string" ? config.accept : fallback?.accept,
    multiple: typeof config.multiple === "boolean" ? config.multiple : fallback?.multiple,
    maxLength: typeof config.maxLength === "number" ? config.maxLength : fallback?.maxLength,
    maxFiles: typeof config.maxFiles === "number" ? config.maxFiles : fallback?.maxFiles,
    visibleWhen: Array.isArray(config.visibleWhen) ? config.visibleWhen as CreationField["visibleWhen"] : fallback?.visibleWhen,
    visibleWhenAny: Array.isArray(config.visibleWhenAny) ? config.visibleWhenAny as CreationField["visibleWhenAny"] : fallback?.visibleWhenAny,
    revealAfter: Array.isArray(config.revealAfter) ? config.revealAfter.filter((item): item is string => typeof item === "string") : fallback?.revealAfter,
    presentation: config.presentation === "data" || config.presentation === "field" ? config.presentation : fallback?.presentation,
    step: typeof config.step === "number" ? config.step : fallback?.step,
    inheritedSourceValue: typeof config.inheritedSourceValue === "string" ? config.inheritedSourceValue : fallback?.inheritedSourceValue,
  };
}
