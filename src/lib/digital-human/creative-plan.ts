export type DigitalHumanCreationMode = "quick" | "smart";

export type DigitalHumanCreativeScene = {
  id: string;
  spokenText: string;
  displayText: string;
  sourceStart: number;
  sourceEnd: number;
  durationHint: number;
  presentation: "presenter" | "presenter-keypoint" | "presenter-example";
  overlayText: string;
  visualDirection: string;
};

export type DigitalHumanCreativePlan = {
  version: 1;
  mode: "smart";
  sourceText: string;
  sourceTextLocked: true;
  sourceTextFingerprint: string;
  estimatedDuration: number;
  aspectRatio: "9:16" | "16:9";
  templateName: string;
  scenes: DigitalHumanCreativeScene[];
};

export const digitalHumanChannelCapabilities = {
  heygen: {
    avatar: "native",
    voice: "native",
    background: "native",
    captions: "native",
    looks: "native",
    providerStyle: "agent-only",
    structuredScenes: "agent-only",
    postProduction: "external",
  },
  chanjing: {
    avatar: "native",
    voice: "native",
    background: "conditional",
    captions: "native",
    looks: "figure-type",
    providerStyle: "unsupported",
    structuredScenes: "external",
    postProduction: "external",
  },
} as const;

export function fingerprintLockedText(value: string) {
  // A stable non-cryptographic fingerprint is sufficient for detecting accidental
  // copy edits between planning and submission. The original text remains stored.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sentenceRanges(source: string) {
  const ranges: Array<{ text: string; start: number; end: number }> = [];
  const matcher = /[^。！？!?；;\n]+[。！？!?；;]?|\n+/g;
  for (const match of source.matchAll(matcher)) {
    const raw = match[0];
    if (!raw.trim()) continue;
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    const start = (match.index ?? 0) + leading;
    const end = (match.index ?? 0) + raw.length - trailing;
    ranges.push({ text: source.slice(start, end), start, end });
  }
  return ranges;
}

function groupRanges(source: string) {
  const sentences = sentenceRanges(source);
  const groups: typeof sentences = [];
  let current: (typeof sentences)[number] | null = null;
  for (const sentence of sentences) {
    if (!current) current = { ...sentence };
    else if (current.text.length < 72 && current.text.length + sentence.text.length <= 112) {
      current = { text: source.slice(current.start, sentence.end), start: current.start, end: sentence.end };
    } else {
      groups.push(current);
      current = { ...sentence };
    }
  }
  if (current) groups.push(current);
  return groups.length ? groups : [{ text: source, start: 0, end: source.length }];
}

function overlayFor(text: string) {
  const compact = text.replace(/[。！？!?；;，,\s]+/g, " ").trim();
  return compact.length <= 18 ? compact : `${compact.slice(0, 17)}…`;
}

export function buildLockedCreativePlan(input: {
  script: string;
  aspectRatio: "9:16" | "16:9";
  templateName?: string;
}): DigitalHumanCreativePlan {
  const groups = groupRanges(input.script);
  const scenes = groups.map((group, index): DigitalHumanCreativeScene => {
    const presentation = index === 0
      ? "presenter-keypoint"
      : /例如|比如|案例|曾经|有一位/.test(group.text)
        ? "presenter-example"
        : index % 2 === 1
          ? "presenter-keypoint"
          : "presenter";
    return {
      id: `scene-${index + 1}`,
      spokenText: group.text,
      displayText: group.text,
      sourceStart: group.start,
      sourceEnd: group.end,
      durationHint: Math.max(3, Math.round(group.text.replace(/\s/g, "").length / 3.8)),
      presentation,
      overlayText: presentation === "presenter" ? "" : overlayFor(group.text),
      visualDirection: presentation === "presenter-example"
        ? "数字人口播配合案例信息卡，保持人物身份和原背景选择"
        : presentation === "presenter-keypoint"
          ? "数字人口播配合原文重点卡，不增加新的事实或承诺"
          : "数字人自然口播，使用稳定构图和清晰字幕",
    };
  });
  return {
    version: 1,
    mode: "smart",
    sourceText: input.script,
    sourceTextLocked: true,
    sourceTextFingerprint: fingerprintLockedText(input.script),
    estimatedDuration: scenes.reduce((total, scene) => total + scene.durationHint, 0),
    aspectRatio: input.aspectRatio,
    templateName: input.templateName || "自由编排",
    scenes,
  };
}

export function validateLockedCreativePlan(plan: DigitalHumanCreativePlan, script: string) {
  if (plan.sourceText !== script || plan.sourceTextFingerprint !== fingerprintLockedText(script)) return false;
  if (!plan.scenes.length) return false;
  return plan.scenes.every((scene) => script.slice(scene.sourceStart, scene.sourceEnd) === scene.spokenText)
    && plan.scenes.map((scene) => scene.spokenText).join("").replace(/\s/g, "") === script.replace(/\s/g, "");
}

export function requiresXiaoguPostProduction(
  plan: DigitalHumanCreativePlan | undefined,
  references?: { videoTemplate?: unknown; compositionReference?: unknown; visualStyleReference?: unknown },
) {
  if (!plan) return false;
  if (references?.videoTemplate || references?.compositionReference || references?.visualStyleReference) return true;
  return plan.scenes.some((scene) => scene.presentation !== "presenter" || Boolean(scene.overlayText.trim()));
}
