export type SpokenCopyRoute = {
  capabilityId: "app.traffic-copy" | "app.video-script-polish";
  requiresFreshInformation: boolean;
  rationale: string;
};

const genericSpokenCopyIntent = /^(?:请|可以|麻烦)?(?:帮我|给我|替我)?(?:想|要|需要)?(?:写|做|生成|创作|优化)?(?:一篇|一个|一条|一下)?(?:短视频)?(?:口播|口播稿|口播文案)$/;

/** Resolve the high-frequency spoken-copy pair before the model router runs. */
export function deterministicSpokenCopyRoute(currentRequest: string, context = "", activeAppSlug = ""): SpokenCopyRoute | null {
  const request = currentRequest.trim();
  const normalized = request.replace(/[，。！？!?、；;：:\s]/g, "");
  if (!request || genericSpokenCopyIntent.test(normalized)) return null;

  // A terse follow-up such as “重新写” describes the operation, not a new
  // application. Keep the application that produced the draft instead of
  // letting the model reinterpret it as a critique/polish request.
  if (activeAppSlug === "traffic-copy" && isSpokenCopyRewriteRequest(request)) return {
    capabilityId: "app.traffic-copy",
    requiresFreshInformation: false,
    rationale: "用户要求基于已完成的流量口播选题和素材重新生成正文",
  };

  const asksForTrafficOutcome = /(?:改|重写|写|做|生成|创作|包装).{0,10}(?:流量型|获客型|引流型|爆款|高流量)(?:口播|文案|稿)?|(?:流量型|获客型|引流型|爆款)(?:口播|口播稿|口播文案)/.test(request);
  if (asksForTrafficOutcome) return {
    capabilityId: "app.traffic-copy",
    requiresFreshInformation: needsFreshInformation(request),
    rationale: "用户明确要求把内容重构为流量、获客或引流型口播",
  };

  const polishIntent = /(?:优化|润色|精修|修改|改顺|改得|诊断|逐句|调整|提升|压缩|删减).{0,14}(?:口播|稿|文案|开头|节奏|表达|结构)|(?:口播|稿|文案).{0,14}(?:优化|润色|精修|修改|改顺|诊断)/.test(request);
  const hasDraft = context.trim().length >= 80 || request.length >= 120 || request.split(/\r?\n/).filter(Boolean).length >= 4 || /(?:原稿|原文|草稿|下面这篇|这篇稿|已有文案)[：:]/.test(request);
  if (polishIntent && hasDraft) return {
    capabilityId: "app.video-script-polish",
    requiresFreshInformation: false,
    rationale: "用户提供了已有稿件，并明确要求诊断、润色或精修",
  };

  const creationIntent = /(?:写|做|生成|创作|出|改写|重写).{0,10}(?:口播|口播稿|口播文案)|(?:口播|口播稿|口播文案).{0,10}(?:写|生成|创作|出一版)/.test(request);
  const hasTopicOrMaterial = /(?:围绕|根据|基于|针对|这个|这件事|热点|事件|话题|观点|角度|素材|标题|新闻|今天|最近)/.test(request) || request.length >= 28 || context.trim().length >= 20;
  if (creationIntent && hasTopicOrMaterial) return {
    capabilityId: "app.traffic-copy",
    requiresFreshInformation: needsFreshInformation(request),
    rationale: "用户基于选题、事件、观点或素材要求创作新的口播",
  };

  return null;
}

export function isSpokenCopyRewriteRequest(text: string) {
  const normalized = text.trim().replace(/[，。！？!?、；;：:\s]/g, "");
  return /^(?:重新写(?:一版)?|重写|再写一版|再写一个版本|换个版本|另写一版|从头写|重新生成)(?:一下|一遍|正文|这篇|这一篇|吧)?$/.test(normalized);
}

function needsFreshInformation(text: string) {
  return /(?:今天|今日|最近|当前|最新|热点|热搜|热议|新闻|事件进展)/.test(text);
}
