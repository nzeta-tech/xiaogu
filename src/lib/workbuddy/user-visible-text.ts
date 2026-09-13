const INTERNAL_MARKERS = ["[应用参数:", "[工作流续作]", "[能力参数:"];

/** Projects durable transport messages into text that is safe to show in UI. */
export function workbuddyUserVisibleText(content: string) {
  const gateIndex = ["交付门禁：", "缺失输出槽位："].map(marker => content.indexOf(marker)).filter(index => index >= 0).sort((a, b) => a - b)[0];
  if (typeof gateIndex === "number") {
    const beforeGate = content.slice(0, gateIndex).trim();
    return beforeGate || "正在补齐尚未生成的成果";
  }
  const indexes = INTERNAL_MARKERS.map(marker => content.indexOf(marker)).filter(index => index >= 0);
  const firstMarker = indexes.length ? Math.min(...indexes) : -1;
  const visible = (firstMarker >= 0 ? content.slice(0, firstMarker) : content).trim();
  if (visible) return stripInternalRoutingSentence(visible);
  const appSlug = content.match(/\[应用参数:([^\]]+)/)?.[1];
  if (appSlug) return `已确认“${friendlyCapabilityName(appSlug)}”的创作设置，开始生成。`;
  if (content.includes("[工作流续作]")) return "继续当前作品的下一步";
  return stripInternalRoutingSentence(content.trim())
    .replace(/\b(?:outputSlotIds|idempotencyKey|fullResultRef)\b[^\n]*/g, "")
    .trim();
}

function stripInternalRoutingSentence(content: string) {
  if (!/能力 ID[：:]/.test(content)) return content;
  const named = content.match(/优先调用[“"]([^”"]+)/)?.[1];
  return named ? `已选择“${named}”` : "已选择指定 Skill";
}

function friendlyCapabilityName(slug: string) {
  if (slug === "xiaohongshu-assets") return "小红书配图";
  if (slug === "traffic-copy") return "口播文案（流量型）";
  return "所选应用";
}
