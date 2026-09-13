export type ContinuationChoice = {
  label?: string;
  value?: string;
  href?: string;
  continuation?: {
    protocolVersion?: number;
    appSlug?: string;
    id?: string;
    kind?: "same-work" | "cross-app" | "revise" | "external-handoff";
    presentation?: "inline-form" | "inline-step" | "embedded-workspace" | "external-workspace";
    targetStep?: string;
    targetCapabilityId?: string;
    workId?: string;
    sourceArtifactId?: string;
    userLabel?: string;
  };
};

/** Old persisted choices only carried href. They must keep opening the embedded
 * workspace after protocol upgrades instead of being replayed as chat text. */
export function shouldOpenEmbeddedContinuation(choice: ContinuationChoice) {
  return Boolean(choice.href) && (!choice.continuation || choice.continuation.presentation === "embedded-workspace");
}

export function isWorkbuddyWorkspaceUrl(url: string) {
  return /^\/(?:apps\/(?:xiaohongshu-studio|wechat-studio)|workbuddy\/video-editor)(?:[/?#]|$)/.test(url);
}

export function conversationContinuationMessage(choice: ContinuationChoice) {
  const inferred = choice.continuation ?? inferLegacyStudioContinuation(choice);
  const rawInstruction = choice.value?.trim() ?? "";
  const instruction = inferred
    ? rawInstruction.replace(/\n*\[应用参数:[\s\S]*$/m, "").trim()
    : rawInstruction;
  if (!inferred) return instruction;
  const protocol = { ...inferred, ...(choice.label ? { userLabel: choice.label } : {}) };
  return `${instruction || choice.label || "继续当前作品的下一步"}\n\n[工作流续作]\n${JSON.stringify(protocol)}`;
}

export function shouldContinueInsideConversation(choice: ContinuationChoice) {
  return choice.continuation?.kind === "same-work" && choice.continuation.presentation === "inline-form";
}

function inferLegacyStudioContinuation(choice: ContinuationChoice) {
  if (!choice.href || !/(?:继续|生成).*(?:配图|图片)/.test(choice.value ?? "")) return null;
  const match = choice.href.match(/^\/apps\/(xiaohongshu-studio|wechat-studio)(?:\?([^#]*))?/);
  if (!match) return null;
  const workId = new URLSearchParams(match[2] ?? "").get("workId")?.trim();
  return {
    protocolVersion: 1,
    appSlug: match[1],
    id: "assets",
    kind: "same-work" as const,
    presentation: "embedded-workspace" as const,
    targetStep: "assets",
    ...(workId ? { workId } : {}),
  };
}

export function parseConversationContinuation(message: string) {
  const marker = "[工作流续作]";
  const line = message.slice(message.lastIndexOf(marker) + marker.length).trimStart().split("\n", 1)[0]?.trim();
  if (!message.includes(marker) || !line) return null;
  try {
    const parsed = JSON.parse(line) as ContinuationChoice["continuation"];
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
