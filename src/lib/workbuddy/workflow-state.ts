export type WorkbuddyWorkflowPhase = "collecting-inputs" | "researching" | "awaiting-selection" | "generating" | "completed";

export type WorkbuddyActiveWorkflow = {
  appSlug: string;
  phase: WorkbuddyWorkflowPhase;
  source: string;
  workId?: string;
  candidateTitles?: string[];
  updatedAt: string;
};

export type WorkbuddyWorkflowTurn = "retry" | "exit" | "select" | "continue" | "unrelated";

export function classifyWorkflowTurn(text: string, workflow?: WorkbuddyActiveWorkflow | null): WorkbuddyWorkflowTurn {
  const request = text.trim();
  if (!workflow || !request) return "unrelated";
  if (/(?:不做了|取消(?:这个|当前)?(?:流程|任务|创作)?|退出(?:这个|当前)?(?:流程|任务)?|结束(?:这个|当前)?(?:流程|任务)?|换个话题|先不写了)/.test(request)) return "exit";
  if (workflow.phase === "awaiting-selection") {
    if (/(?:重新选题|重选|换一批|换组选题|再来一批|重新推荐|再推荐(?:一批)?|还有别的选题|这些都不合适|这批都不行|都不满意)/.test(request)) return "retry";
    if (/(?:选第|第[一二三四五六七八九十\d]+个|就这个|用这个|按这个|生成所选)/.test(request)) return "select";
  }
  if (/^(?:继续|接着|往下|下一步)/.test(request)) return "continue";
  return "unrelated";
}

export function buildWorkflowRetrySource(workflow: WorkbuddyActiveWorkflow) {
  const excluded = (workflow.candidateTitles ?? []).filter(Boolean).slice(0, 12);
  return [
    workflow.source.trim(),
    "【本轮动作】重新生成候选选题；沿用以上原始素材与主题，不得切换到其他领域。",
    excluded.length ? `【上一批候选（本轮不得重复或仅改写标题）】\n${excluded.map((title, index) => `${index + 1}. ${title}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 24000);
}
