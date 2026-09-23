export type ArtifactGraphNode = {
  id: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
  parentIds: string[];
  ordinal?: number;
};

type StoredArtifact = {
  id: string;
  artifact_type: string;
  title: string;
  content: string;
  content_json?: Record<string, unknown>;
  created_at: string;
};

export type ArtifactReferenceResolution = {
  nodes: ArtifactGraphNode[];
  requestedCount: number | null;
  referential: boolean;
};

export function buildArtifactGraph(artifacts: StoredArtifact[]): ArtifactGraphNode[] {
  const nodes: ArtifactGraphNode[] = [];
  for (const artifact of artifacts) {
    const json = artifact.content_json ?? {};
    const parentIds = [json.sourceArtifactId, json.derivedFromArtifactId, ...(Array.isArray(json.derivedFromArtifactIds) ? json.derivedFromArtifactIds : [])]
      .filter((value): value is string => typeof value === "string" && Boolean(value));
    const structuredChildren = extractStructuredChildren(json);
    const children = structuredChildren.length > 1 ? structuredChildren : extractContentChildren(artifact.content);
    if (children.length > 1) {
      children.forEach((child, index) => nodes.push({
        id: `${artifact.id}#${index + 1}`,
        type: child.type || artifact.artifact_type,
        title: child.title || `${artifact.title} ${index + 1}`,
        content: child.content,
        createdAt: artifact.created_at,
        parentIds: [artifact.id, ...parentIds],
        ordinal: index + 1,
      }));
    }
    nodes.push({ id: artifact.id, type: artifact.artifact_type, title: artifact.title, content: artifact.content, createdAt: artifact.created_at, parentIds });
  }
  return nodes;
}

export function resolveArtifactReferences(request: string, graph: ArtifactGraphNode[]): ArtifactReferenceResolution {
  // Deictic words that point forward belong to material supplied in the current
  // turn. Treating their counts as references to historical artifacts causes a
  // fresh application turn to inherit the previous app's output contract.
  const pointsToCurrentMaterial = /(?:下面|如下|以下|接下来)(?:这|的)?(?:个|些|两|三|四|内容|素材|例子|案例|正文|文案)|(?:我|本人)(?:下面|如下|刚刚)?(?:提供|粘贴|上传|输入)(?:的)?/.test(request);
  if (pointsToCurrentMaterial) return { nodes: [], requestedCount: inferReferenceCount(request), referential: false };
  // “第四个” identifies one item inside the latest visible numbered list; it
  // does not ask for four historical artifacts. Leave ordinal projection to
  // context-compiler, which has the immediately preceding assistant message.
  // Treating the ordinal as a count used to pull several older deliveries into
  // the application source and could make the selected topic drift backwards.
  if (/第\s*(?:[一二三四五六七八九十]|\d{1,2})\s*(?:个|项|条|篇|题)?/.test(request)) {
    return { nodes: [], requestedCount: null, referential: true };
  }
  const implicitContinuation = isSubjectlessTransformation(request);
  const semanticSourceContinuation = /(?:这个|这些|上述|上面|刚才|前面|刚完成(?:的)?)(?:话题|新闻|事件|方向|角度|内容|材料|素材|稿子|成果|正文|文案|文章|口播)?/.test(request)
    && /(?:写|生成|创作|制作|整理|改写|转换|做成|转成)/.test(request);
  const referential = /(?:这个|这些|它们|上述|上面|刚才|前面|最近|上一版|这版|两个|两篇|这两|分别|各自)/.test(request) || implicitContinuation;
  if (!referential || graph.length === 0) return { nodes: [], requestedCount: null, referential };
  const requestedCount = inferReferenceCount(request);
  const nonEnvelope = graph.filter(node => node.ordinal || !graph.some(other => other.parentIds.includes(node.id) && other.ordinal));
  const candidates = nonEnvelope.length ? nonEnvelope : graph;
  const count = requestedCount ?? 1;
  const selected = candidates.slice(-count);
  return {
    nodes: implicitContinuation || semanticSourceContinuation ? selected.map(node => resolveSemanticAncestor(node, graph)) : selected,
    requestedCount,
    referential,
  };
}

/**
 * Cross-format follow-ups should inherit the meaning-bearing source, not a
 * thumbnail URL or a terse renderer receipt. The graph is the contract: each
 * derived artifact points at its source, so this works across all apps.
 */
function resolveSemanticAncestor(node: ArtifactGraphNode, graph: ArtifactGraphNode[]) {
  const byId = new Map(graph.map(item => [item.id, item]));
  let current = node;
  const visited = new Set<string>();
  while (!visited.has(current.id)) {
    visited.add(current.id);
    const parents = current.parentIds.map(id => byId.get(id)).filter((item): item is ArtifactGraphNode => Boolean(item));
    if (!parents.length) break;
    const semanticParent = parents.find(isMeaningBearingText) ?? parents[0];
    if (!semanticParent) break;
    current = semanticParent;
  }
  return isMeaningBearingText(current) ? current : node;
}

function isMeaningBearingText(node: ArtifactGraphNode) {
  const text = node.content.trim();
  return text.length >= 40
    && !/^(?:已|成功|完成)[\s\S]{0,40}(?:生成|制作|返回)[\s\S]{0,40}(?:图片|封面|视频|成果)/.test(text)
    && !/^https?:\/\//.test(text);
}

function isSubjectlessTransformation(request: string) {
  const normalized = request.replace(/\s+/g, "").replace(/[，。！？,.!?]/g, "");
  const transform = /(?:再|重新)?(?:帮我)?(?:写|生成|创作|制作|整理|改写|转换|做成|转成)(?:一|两|二|三|四|\d+)?(?:篇|张|个|份|条)?(?:小红书(?:笔记|文章)?|口播(?:文案)?|知识(?:图片|卡片)|配图|封面|文章|文案|视频|PPT)$/i.test(normalized);
  return transform;
}

export function formatArtifactReferences(nodes: ArtifactGraphNode[]) {
  if (!nodes.length) return "";
  return nodes.map((node, index) => [
    `【引用成果 ${index + 1}/${nodes.length}｜artifact:${node.id}】`,
    `标题：${node.title}`,
    node.content.slice(0, 9000),
  ].join("\n")).join("\n\n");
}

function inferReferenceCount(text: string) {
  if (/第\s*(?:[一二三四五六七八九十]|\d{1,2})\s*(?:个|项|条|篇|题)?/.test(text)) return null;
  const match = text.match(/([一二两三四1-4])(?:个|篇|张|份|条)/)?.[1];
  if (match) return toCount(match);
  if (/(?:这两|两个|两篇|分别|各自)/.test(text)) return 2;
  return null;
}

function extractStructuredChildren(json: Record<string, unknown>) {
  const roots = [json, isRecord(json.contentJson) ? json.contentJson : null].filter((value): value is Record<string, unknown> => Boolean(value));
  for (const root of roots) {
  for (const key of ["normalizedDeliverables", "scripts", "images", "items", "deliverables", "outputs"]) {
    const value = root[key];
    if (!Array.isArray(value) || value.length < 2) continue;
    const children = value.flatMap((item, index) => {
      if (typeof item === "string") return [{ content: item, title: `成果 ${index + 1}`, type: key === "images" ? "image" : "text" }];
      if (!isRecord(item)) return [];
      const content = [item.content, item.text, item.script, item.url, item.imageUrl].find(value => typeof value === "string" && value.trim());
      if (typeof content !== "string") return [];
      return [{ content, title: typeof item.title === "string" ? item.title : `成果 ${index + 1}`, type: typeof item.kind === "string" ? item.kind : key === "images" ? "image" : "text" }];
    });
    if (children.length > 1) return children;
  }
  const batches = Array.isArray(root.batches) ? root.batches : [];
  const children = batches.flatMap((batch, batchIndex) => isRecord(batch) && Array.isArray(batch.items)
    ? batch.items.flatMap((item, itemIndex) => {
      if (!isRecord(item)) return [];
      const content = [item.body, item.content, item.text, item.script].find(value => typeof value === "string" && value.trim());
      return typeof content === "string" ? [{ content, title: typeof item.title === "string" ? item.title : `成果 ${batchIndex + 1}-${itemIndex + 1}`, type: "text" }] : [];
    }) : []);
  if (children.length > 1) return children;
  }
  return [];
}

function extractContentChildren(content: string) {
  const heading = /^(?:#{1,4}\s*)?(?:第\s*([一二两三四1-4])\s*(?:篇|条|个)|(?:口播|文案|脚本|案例|例子|选题|主题)\s*([一二两三四1-4]))[：:、.\s-]*(.*)$/gm;
  const matches = [...content.matchAll(heading)];
  if (matches.length < 2 || matches.length > 4) return [];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? content.length;
    return { type: "text", title: match[3]?.trim() || `成果 ${index + 1}`, content: content.slice(start, end).trim() };
  }).filter(item => item.content.length >= 20);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toCount(value: string) {
  return ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4 } as Record<string, number>)[value] ?? Number(value);
}
