import type { CreationField } from "@/lib/apps/catalog";
import { stringifyCreationFieldValue, type CreationFieldValue } from "@/lib/creation/output";

export function validateCreationFieldLengths(fields: CreationField[], values: Record<string, CreationFieldValue>) {
  for (const field of fields) {
    if (!field.maxLength) continue;
    const length = stringifyCreationFieldValue(values[field.id]).length;
    if (length > field.maxLength) return `${field.label}最多支持 ${field.maxLength} 个字符，当前为 ${length} 个字符，请精简后重试。`;
  }
  return "";
}
