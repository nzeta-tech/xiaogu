export type DeliverableKind = "text" | "image" | "presentation" | "video" | "data";
export type DeliverableContract = {
  kind: DeliverableKind;
  expectedCount: number;
  independent: boolean;
  sourceArtifactIds: string[];
  appSlug?: string;
  retryStrategy?: "retry-missing" | "retry-whole" | "interactive";
};

export type DeliverableInspection = {
  complete: boolean;
  expectedCount: number;
  actualCount: number;
  reason: string;
};

export function buildDeliverableContract(input: {
  request: string;
  expectedOutputs?: number | null;
  outputTypes?: DeliverableKind[];
  sourceArtifactIds?: string[];
  appSlug?: string;
  defaultCount?: number;
  retryStrategy?: DeliverableContract["retryStrategy"];
}): DeliverableContract | null {
  const kind = inferKind(input.request, input.outputTypes);
  if (!kind) return null;
  const expectedCount = Math.max(1, Math.min(10, input.expectedOutputs ?? inferCount(input.request) ?? input.defaultCount ?? 1));
  return {
    kind,
    expectedCount,
    independent: expectedCount > 1 && /(?:分别|各自|每个|每篇|每张|独立)/.test(input.request),
    sourceArtifactIds: input.sourceArtifactIds ?? [],
    ...(input.appSlug ? { appSlug: input.appSlug } : {}),
    ...(input.retryStrategy ? { retryStrategy: input.retryStrategy } : {}),
  };
}

export function inspectDeliverables(contract: DeliverableContract | null, result: { content?: string; contentJson?: Record<string, unknown>; normalizedCount?: number } | null): DeliverableInspection {
  if (!contract) return { complete: true, expectedCount: 0, actualCount: 0, reason: "本轮没有结构化交付约束" };
  const actualCount = typeof result?.normalizedCount === "number" ? result.normalizedCount : countDeliverables(contract.kind, result);
  const complete = actualCount >= contract.expectedCount;
  return {
    complete,
    expectedCount: contract.expectedCount,
    actualCount,
    reason: complete ? "交付数量满足要求" : `${contract.kind} 交付不完整：要求 ${contract.expectedCount} 个独立成果，实际 ${actualCount} 个`,
  };
}

function countDeliverables(kind: DeliverableKind, result: { content?: string; contentJson?: Record<string, unknown> } | null) {
  if (!result) return 0;
  const json = result.contentJson ?? {};
  if (kind === "image" && typeof json.generatedImageCount === "number") return json.generatedImageCount;
  const keys = kind === "image" ? ["images", "imageUrls"] : kind === "text" ? ["scripts", "articles", "items", "outputs"] : kind === "presentation" ? ["presentations", "files"] : kind === "video" ? ["videos", "files"] : ["items", "rows"];
  for (const key of keys) {
    const direct = json[key];
    if (Array.isArray(direct)) return direct.length;
    const nested = isRecord(json.result) ? json.result[key] : undefined;
    if (Array.isArray(nested)) return nested.length;
  }
  if (kind === "image") {
    const urls = `${result.content ?? ""}\n${JSON.stringify(json)}`.match(/https?:\/\/[^\s"']+\.(?:png|jpe?g|webp)(?:\?[^\s"']*)?/gi);
    return new Set(urls ?? []).size;
  }
  return result.content?.trim() ? 1 : 0;
}

function inferKind(request: string, outputTypes?: DeliverableKind[]) {
  if (/(?:图片|知识图|卡片|海报|封面)/.test(request)) return "image" as const;
  if (/(?:PPT|幻灯片|演示文稿)/i.test(request)) return "presentation" as const;
  if (/(?:视频|成片)/.test(request)) return "video" as const;
  if (/(?:文案|口播|文章|脚本|报告|稿)/.test(request)) return "text" as const;
  return outputTypes?.length === 1 ? outputTypes[0] : null;
}

function inferCount(request: string) {
  const value = request.match(/([一二两三四1-4])(?:个|篇|张|份|条)/)?.[1];
  if (value) return ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4 } as Record<string, number>)[value] ?? Number(value);
  if (/(?:分别|各自)/.test(request)) return 2;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
