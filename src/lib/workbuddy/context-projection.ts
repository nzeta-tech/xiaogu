import type { WorkbuddyContextMessage } from "./context-compiler.ts";

export type ContextProjection = {
  pinned: WorkbuddyContextMessage[];
  recent: WorkbuddyContextMessage[];
  compacted: Array<{ role: WorkbuddyContextMessage["role"]; content: string }>;
  droppedCount: number;
};

export function projectConversationContext(messages: WorkbuddyContextMessage[], options: { recentLimit?: number; compactLimit?: number } = {}): ContextProjection {
  const recentLimit = options.recentLimit ?? 4;
  const compactLimit = options.compactLimit ?? 8;
  const useful = messages.filter(message => message.content.trim() && !isEphemeral(message));
  const pinned = useful.filter(isPinned).slice(-6);
  const remaining = useful.filter(message => !pinned.includes(message));
  const recent = remaining.slice(-recentLimit);
  const compactCandidates = remaining.slice(0, Math.max(0, remaining.length - recent.length)).slice(-compactLimit);
  const compacted = compactCandidates.map(message => ({ role: message.role, content: microcompact(message.content) }));
  return { pinned, recent, compacted, droppedCount: Math.max(0, remaining.length - recent.length - compactCandidates.length) };
}

export function formatContextProjection(projection: ContextProjection) {
  const lines: string[] = [];
  if (projection.pinned.length) lines.push("【固定上下文】", ...projection.pinned.map(formatMessage));
  if (projection.compacted.length) lines.push("【较早对话摘要】", ...projection.compacted.map(formatMessage));
  if (projection.recent.length) lines.push("【最近相关对话】", ...projection.recent.map(formatMessage));
  return lines.join("\n\n");
}

function isPinned(message: WorkbuddyContextMessage) {
  return message.message_type === "objective" || message.message_type === "clarification" || message.message_type === "delivery";
}

function isEphemeral(message: WorkbuddyContextMessage) {
  return message.message_type === "progress" || message.message_type === "tool-log" || message.message_type === "audit";
}

function microcompact(content: string) {
  const clean = content.replace(/\[应用参数:[\s\S]*$/m, "[已确认应用参数]").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= 600) return clean;
  return `${clean.slice(0, 420)}\n…[较早内容已压缩]…\n${clean.slice(-140)}`;
}

function formatMessage(message: { role: WorkbuddyContextMessage["role"]; content: string; message_type?: string }) {
  const label = message.role === "user" ? "用户" : message.role === "assistant" ? "小谷" : "系统";
  const limit = message.message_type === "objective" ? 1800 : message.message_type === "clarification" ? 3500 : message.message_type === "delivery" ? 3000 : 1600;
  const content = message.content.length > limit ? `${message.content.slice(0, limit)}\n…[内容已投影压缩]` : message.content;
  return `${label}：${content}`;
}
