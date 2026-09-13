export type WorkbuddyTurnRelation = "new-topic" | "continue" | "alternatives" | "correction" | "selection" | "execution";
export type WorkbuddyConversationPhase = "conversation" | "exploration" | "research" | "selection" | "creation" | "revision";

export type WorkbuddyConversationState = {
  phase: WorkbuddyConversationPhase;
  turnRelation: WorkbuddyTurnRelation;
  activeTopic: string;
  discussedTopics: string[];
  excludedTopics: string[];
  useCreatorMemory: boolean;
  explicitDeliverable: boolean;
  answerDepth: "brief" | "standard" | "deep";
};

export type ConversationTurn = { role: "user" | "assistant" | "system"; content: string };

export function resolveConversationState(input: {
  currentRequest: string;
  previous?: Partial<WorkbuddyConversationState> | null;
  recentMessages?: ConversationTurn[];
}) {
  const request = input.currentRequest.trim();
  const previous = input.previous ?? {};
  const assistantText = (input.recentMessages ?? []).filter(item => item.role === "assistant").slice(-3).map(item => item.content).join("\n");
  const remembered = unique([...(previous.discussedTopics ?? []), ...extractDiscussedTopics(assistantText)]).slice(-20);
  const alternatives = /(?:还有(?:没有)?|其他|别的|换一(?:个|批|组)|再来|不一样的|不要重复)/.test(request);
  const correction = /(?:不是|不对|我的意思|改成|纠正|别再|不要讲|排除)/.test(request);
  const selection = /(?:选|就讲|用第|第[一二三四五六七八九十\d]+个|这个角度|按这个)/.test(request);
  const terseRewrite = /^(?:重新写(?:一版)?|重写|再写一版|再写一个版本|换个版本|另写一版|从头写|重新生成)(?:一下|一遍|正文|这篇|这一篇|吧)?[。！!\s]*$/.test(request);
  const explicitDeliverable = terseRewrite || /(?:直接|现在|马上)?(?:帮我|给我|请)?(?:写|生成|创作|制作|输出|重写|精修|优化).{0,14}(?:成稿|全文|完整|口播|文案|文章|脚本|报告|PPT|海报|封面|视频)|(?:进入|开始)(?:创作|写作|生成)/.test(request);
  const contentPersonalization = /(?:适合我|我的账号|我的定位|我的风格|我的分身|按我|替我|帮我讲|帮我写|目标客户|受众|口播|文案|选题|内容)/.test(request);
  const explicitResearch = /(?:今天|今日|最近|当前|最新|热点|热搜|新闻|政策|查一下|核验|研究)/.test(request);
  const exploration = /(?:找|推荐|候选|角度|选题|有什么|哪些)/.test(request);
  const revision = /(?:优化|润色|精修|修改|改顺|诊断|逐句)/.test(request);
  // Short follow-ups in a research thread inherit its evidence requirement;
  // users should not need to repeat “最近/热点/请检索” every turn.
  const research = explicitResearch || (previous.phase === "research" && exploration && !explicitDeliverable && !revision);
  const relation: WorkbuddyTurnRelation = alternatives ? "alternatives" : correction ? "correction" : selection ? (explicitDeliverable ? "execution" : "selection") : explicitDeliverable ? "execution" : previous.activeTopic ? "continue" : "new-topic";
  const phase: WorkbuddyConversationPhase = explicitDeliverable ? (revision ? "revision" : "creation") : selection ? "selection" : research ? "research" : exploration ? "exploration" : "conversation";
  const excludedTopics = alternatives ? remembered : correction ? unique([...(previous.excludedTopics ?? []), ...extractExplicitExclusions(request)]) : [];
  return {
    phase,
    turnRelation: relation,
    activeTopic: inferActiveTopic(request, previous.activeTopic ?? ""),
    discussedTopics: remembered,
    excludedTopics,
    useCreatorMemory: contentPersonalization,
    explicitDeliverable,
    answerDepth: /(?:详细|完整分析|深入|全面|报告)/.test(request) ? "deep" : alternatives || exploration || phase === "selection" ? "brief" : "standard",
  } satisfies WorkbuddyConversationState;
}

export function mergeDeliveredConversationState(state: WorkbuddyConversationState, content: string) {
  return { ...state, discussedTopics: unique([...state.discussedTopics, ...extractDiscussedTopics(content)]).slice(-20) };
}

export function formatConversationStateForPrompt(state: WorkbuddyConversationState) {
  return [
    "【持续对话状态】",
    `当前阶段：${state.phase}；本轮与上文关系：${state.turnRelation}；回答深度：${state.answerDepth}`,
    `用户是否明确要求专业产物：${state.explicitDeliverable ? "是" : "否"}`,
    state.activeTopic ? `当前主题：${state.activeTopic}` : "",
    state.discussedTopics.length ? `已经讨论过：${state.discussedTopics.join("、")}` : "",
    state.excludedTopics.length ? `本轮必须排除且不得换名重复：${state.excludedTopics.join("、")}` : "",
    state.turnRelation === "alternatives" ? "用户在索要新选项；不要重复上一轮候选，也不要再次把上一轮首推换个说法推荐。" : "",
    state.answerDepth === "brief" ? "先给简短候选和选择依据，等待用户选择；不要擅自扩写成完整报告或成稿。" : "",
    !state.explicitDeliverable ? "当前仍是对话、探索或研究阶段；不得调用创作应用模拟用户尚未确认的交付物。" : "",
  ].filter(Boolean).join("\n");
}

export function suggestedConversationTitle(request: string) {
  const visible = workbuddyUserVisibleText(request);
  if (/^(?:hi|hello|你好|您好|嗨|在吗)[呀啊吗!！,.，。\s]*$/i.test(visible.trim())) return "";
  return visible.replace(/\s+/g, " ").replace(/^请(?:先)?帮我/, "").slice(0, 28);
}

function inferActiveTopic(request: string, fallback: string) {
  if (/^(?:还有|其他|别的|换一|再来)/.test(request)) return fallback;
  // A delivery command usually changes the requested output, not the subject.
  // Keep the previously established subject so "帮我写一篇口播" can inherit
  // the event or angle that was just researched and confirmed.
  if (fallback && (request.includes("[应用参数:") || /(?:这个|这些|它们|上述|上面|刚才|前面|当前).{0,12}(?:写|生成|创作|制作|输出|做成|转成)|(?:写|生成|创作|制作|输出|做成|转成).{0,12}(?:这个|这些|它们|上述|上面|刚才|前面|当前)/.test(request) || /^(?:重新写(?:一版)?|重写|再写一版|再写一个版本|换个版本|另写一版|从头写|重新生成)(?:一下|一遍|正文|这篇|这一篇|吧)?[。！!\s]*$/.test(request) || /^(?:请)?(?:帮我|给我)?(?:基于(?:这个|上面|上述|刚才的)?|从(?:这个|该)(?:方向|角度))?(?:写|生成|创作|制作|输出)(?:一|1)?(?:篇|条|个|份)?(?:完整)?(?:口播文案稿?|口播稿?|文案稿?|文章|脚本)?(?:吧|一下)?[。！!\s]*$/.test(request))) return fallback;
  return request.replace(/\s+/g, " ").slice(0, 80) || fallback;
}

function extractExplicitExclusions(text: string) {
  return [...text.matchAll(/(?:不要|排除|别再讲)\s*([^，。；\n]{2,30})/g)].map(item => item[1].trim());
}

export function extractDiscussedTopics(content: string) {
  const topics: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(?:首推|最推荐|推荐|候选\d*|第[一二三四五六七八九十]+顺位)?[：:｜|]?\s*(.{2,40})$/)?.[1];
    if (heading) topics.push(cleanTopic(heading));
    const tableCell = line.match(/^\|\s*(?:\*\*)?(?:\d+[.、]\s*)?([^|*]{2,32})(?:\*\*)?\s*\|/i)?.[1];
    if (tableCell && !/(候选|话题|事实|热点)/.test(tableCell)) topics.push(cleanTopic(tableCell));
  }
  return unique(topics.filter(item => item.length >= 2 && item.length <= 40));
}

function cleanTopic(value: string) {
  return value.replace(/\*\*/g, "").replace(/[：:].*$/, "").replace(/[？?。]$/, "").trim();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
import { workbuddyUserVisibleText } from "./user-visible-text.ts";
