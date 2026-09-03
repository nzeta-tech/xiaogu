import type { CreationField, CreationFieldCondition } from "./catalog.ts";
import type { CreationFieldValue } from "../creation/output.ts";

type Values = Record<string, CreationFieldValue | undefined>;

function hasValue(value: CreationFieldValue | undefined) {
  return Array.isArray(value) ? value.length > 0 : String(value ?? "").trim().length > 0;
}

function matches(condition: CreationFieldCondition, values: Values) {
  const value = values[condition.fieldId];
  if (condition.hasValue !== undefined && hasValue(value) !== condition.hasValue) return false;
  if (condition.equals !== undefined && String(value ?? "") !== condition.equals) return false;
  if (condition.oneOf && !condition.oneOf.includes(String(value ?? ""))) return false;
  return true;
}

type InteractiveField = Pick<CreationField, "id" | "required" | "presentation" | "revealAfter" | "visibleWhen" | "visibleWhenAny" | "step">;

export function isCreationFieldVisible(field: InteractiveField, values: Values) {
  if (field.presentation === "data") return false;
  if (field.revealAfter?.some((fieldId) => !hasValue(values[fieldId]))) return false;
  if (field.visibleWhen?.some((condition) => !matches(condition, values))) return false;
  if (field.visibleWhenAny?.length && !field.visibleWhenAny.some((condition) => matches(condition, values))) return false;
  return true;
}

export function visibleCreationFields<T extends InteractiveField>(fields: T[], values: Values) {
  const eligible = fields.filter((field) => isCreationFieldVisible(field, values));
  const activeStep = eligible
    .filter((field) => field.step && field.required && !hasValue(values[field.id]))
    .reduce<number | undefined>((lowest, field) => lowest === undefined ? field.step : Math.min(lowest, field.step!), undefined);
  return activeStep === undefined ? eligible : eligible.filter((field) => !field.step || field.step <= activeStep);
}

export function pruneHiddenCreationValues(fields: CreationField[], values: Values) {
  const visibleIds = new Set(fields.filter((field) => field.presentation === "data").map((field) => field.id).concat(visibleCreationFields(fields, values).map((field) => field.id)));
  return Object.fromEntries(Object.entries(values).filter(([id, value]) => visibleIds.has(id) && hasValue(value)));
}
