export type WorkbuddyMaterialEnvelope = {
  material: string;
  instruction: string;
  formatted: string;
};

const DIRECTIVE_START = /^(?:请|不要|别|需要|要求|保持|保留|改成|调整|优化|注意|同时|并且|字数|语气|风格|面向|用于|输出)/;

/**
 * Decomposes a natural-language creation request into material and editing
 * intent without knowing which application will consume it. This is a
 * context-boundary helper, not an app-specific parser.
 */
export function decomposeWorkbuddyMaterial(request: string): WorkbuddyMaterialEnvelope {
  const text = request.trim();
  const colon = findInstructionColon(text);
  if (colon < 0) return { material: text, instruction: "", formatted: text };
  const leadingInstruction = text.slice(0, colon).trim();
  const remainder = text.slice(colon + 1).trim();
  if (!remainder) return { material: text, instruction: "", formatted: text };
  const sentences = remainder.match(/[^。！？!?]+[。！？!?]?/g)?.map(item => item.trim()).filter(Boolean) ?? [remainder];
  const material: string[] = [];
  const constraints: string[] = [];
  for (const sentence of sentences) {
    if (material.length && DIRECTIVE_START.test(sentence.replace(/^[“"'（(\s]+/, ""))) constraints.push(sentence);
    else material.push(sentence);
  }
  const materialText = material.join("").trim() || remainder;
  const instruction = [leadingInstruction, ...constraints].filter(Boolean).join("；");
  return {
    material: materialText,
    instruction,
    formatted: [`【待处理素材】\n${materialText}`, instruction && `【本轮处理要求】\n${instruction}`].filter(Boolean).join("\n\n"),
  };
}

function findInstructionColon(text: string) {
  const chinese = text.indexOf("：");
  const ascii = text.search(/:\s+/);
  const candidates = [chinese, ascii].filter(index => index >= 0 && index < 120);
  return candidates.length ? Math.min(...candidates) : -1;
}
