import { isGenericApplicationIntent, stripConversationAppProtocols } from "./app-conversation.ts";
import { formatContextProjection, projectConversationContext } from "./context-projection.ts";

export type WorkbuddyContextMessage = {
  role: "user" | "assistant" | "system";
  message_type?: string;
  content: string;
};

export type WorkbuddyCompiledContext = {
  prompt: string;
  focus: { kind: "artifact" | "conversation"; title: string; content: string } | null;
  expectedOutputs: number | null;
  includeDiscoveryPool: boolean;
};

export function compileWorkbuddyContext(input: {
  currentRequest: string;
  messages: WorkbuddyContextMessage[];
  supplementalContext?: string;
  pendingInstruction?: string;
  pendingSource?: string;
  latestArtifact?: string;
  workflowContinuation?: string;
  discoveryPoolContext?: string;
  artifactReferences?: string;
}) : WorkbuddyCompiledContext {
  const request = stripConversationAppProtocols(input.currentRequest).trim();
  const referential = /(?:这个|这些|它们|两篇|两个|上述|上面|刚才|前面|分别|各自|上一版|这版|第[一二三四五六七八九十\d]+(?:个|项|条|篇|题)?)/.test(request);
  const transform = /(?:写|生成|创作|制作|改|优化|转成|做成|图片|卡片|封面|视频|PPT|文案|口播)/i.test(request);
  // Commands such as “帮我制作一张知识图片” intentionally omit the subject:
  // in a conversation they refer to the immediately preceding visible result.
  // Treat that as an implicit continuation rather than falling back to an
  // older durable application artifact.
  const implicitContinuation = transform && isGenericApplicationIntent(request);
  const includeDiscoveryPool = /(?:热点|热搜|候选|还有|其他|别的|再找|换一批)/.test(request);
  const latestDelivery = [...input.messages].reverse().find(message => message.role === "assistant" && message.message_type === "delivery" && message.content.trim());
  // An explicit artifact reference wins. Otherwise the latest visible assistant
  // delivery is temporally closer than an older durable artifact and is what
  // natural references such as “这个热点” normally point to.
  const preferredFocus = input.artifactReferences
    ? input.latestArtifact
    : latestDelivery?.content || (input.latestArtifact !== "尚无已有交付。" ? input.latestArtifact : "");
  const fullFocusContent = cleanContextText(preferredFocus ?? "", 14000);
  const focusContent = projectExplicitSelection(request, fullFocusContent) || fullFocusContent;
  const focus = !input.artifactReferences && (referential || implicitContinuation) && transform && focusContent
    ? { kind: input.latestArtifact ? "artifact" as const : "conversation" as const, title: inferFocusTitle(focusContent), content: focusContent }
    : null;
  const expectedOutputs = inferExpectedOutputCount(request, focusContent);
  const projectionMessages = focus && latestDelivery ? input.messages.filter(message => message !== latestDelivery) : input.messages;
  const conversationProjection = formatContextProjection(projectConversationContext(projectionMessages));
  const prompt = [
    "【本轮任务上下文】",
    `当前要求：${request}`,
    focus ? `【当前焦点｜必须优先承接】\n${focus.title}\n${focus.content}` : "",
    !focus && fullFocusContent ? `【最近可用成果｜仅在本轮承接上文时使用】\n${inferFocusTitle(fullFocusContent)}\n${fullFocusContent}` : "",
    input.artifactReferences ? `【已解析的成果引用｜优先级高于模糊历史】\n${cleanContextText(input.artifactReferences, 20000)}` : "",
    expectedOutputs ? `【完成条件】\n期望独立交付数量：${expectedOutputs}；每个对象分别交付，不得合并。` : "",
    input.pendingInstruction ? `【已确定的应用任务】\n${cleanContextText(input.pendingInstruction, 4000)}` : "",
    input.pendingSource ? `【已固化的应用素材】\n${cleanContextText(input.pendingSource, 16000)}` : "",
    input.supplementalContext ? `【用户补充资料】\n${cleanContextText(input.supplementalContext, 8000)}` : "",
    conversationProjection,
    includeDiscoveryPool && input.discoveryPoolContext ? `【按需加载的热点候选】\n${cleanContextText(input.discoveryPoolContext, 9000)}` : "",
    input.workflowContinuation ? `【当前工作流续接】\n${input.workflowContinuation}` : "",
  ].filter(Boolean).join("\n\n");
  return { prompt, focus, expectedOutputs, includeDiscoveryPool };
}

/**
 * Resolve ordinal follow-ups against the numbered sections in the immediately
 * preceding result. This keeps application source material aligned with what
 * the user selected instead of forwarding the complete candidate list.
 */
export function projectExplicitSelection(request: string, content: string) {
  const indexes = extractRequestedOrdinals(request);
  if (!indexes.length || !content.trim()) return "";
  const lines = content.split(/\r?\n/);
  const starts = lines.flatMap((line, lineIndex) => {
    const match = line.match(/^\s*(?:#{1,6}\s*)?(\d{1,2})[.、．)]\s*(.+?)\s*$/);
    return match ? [{ ordinal: Number(match[1]), lineIndex }] : [];
  });
  if (!starts.length) return "";
  const selected = starts.flatMap((start, index) => {
    if (!indexes.includes(start.ordinal)) return [];
    const end = starts[index + 1]?.lineIndex ?? lines.length;
    return [lines.slice(start.lineIndex, end).join("\n").trim()];
  });
  return selected.join("\n\n---\n\n");
}

export function inferExpectedOutputCount(request: string, focus = "") {
  const explicit = request.match(/(?:生成|制作|做|出|要)?\s*([一二两三四1-4])\s*张/)?.[1];
  if (explicit && chineseCount(explicit) > 1) return chineseCount(explicit);
  if (/(?:两个|两篇|这两|以上两).{0,16}(?:分别|各自)|(?:分别|各自).{0,16}(?:一张|制作|生成|做)/.test(request)) return 2;
  const numbered = [...`${request}\n${focus}`.matchAll(/(?:卡片|图片|主题|案例|例子|文案)\s*([1-4一二三四])[：:]/g)].map(match => chineseCount(match[1]));
  return numbered.length ? Math.max(...numbered) : explicit ? chineseCount(explicit) : null;
}

function inferFocusTitle(content: string) {
  return content.match(/^#{1,3}\s+(.{2,100})$/m)?.[1]?.trim()
    ?? content.split(/\r?\n/).find(line => line.trim().length >= 4)?.trim().slice(0, 100)
    ?? "最近已确认成果";
}

function cleanContextText(value: string, limit: number) {
  return stripConversationAppProtocols(value).replace(/\n{4,}/g, "\n\n\n").trim().slice(0, limit);
}

function chineseCount(value: string) {
  return ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4 } as Record<string, number>)[value] ?? Number(value);
}

function extractRequestedOrdinals(request: string) {
  const chinese = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 } as Record<string, number>;
  return [...new Set([...request.matchAll(/第\s*([一二三四五六七八九十]|\d{1,2})\s*(?:个|项|条|篇|题)?/g)]
    .map(match => chinese[match[1]] ?? Number(match[1]))
    .filter(value => Number.isInteger(value) && value > 0))];
}
