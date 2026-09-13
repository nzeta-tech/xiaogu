const CONTROL_MARKERS = [
  "交付门禁：",
  "缺失输出槽位：",
  "正在观察工具结果",
  "达到本轮最大行动次数",
  "应用未形成有效成果",
  "只生成缺失项，保留已有成功结果",
];

/** Runtime/control messages are not user material and must not cross an app boundary. */
export function stripOperationalMaterial(value: string) {
  return value
    .split(/\n{2,}/)
    .filter(block => !CONTROL_MARKERS.some(marker => block.includes(marker)))
    .filter(block => !/^已按\s*.+?风格生成\s*\d+\s*张/u.test(block.trim()))
    .join("\n\n")
    .trim();
}
export function isOperationalOnlyMaterial(value: string) {
  const clean = stripOperationalMaterial(value);
  if (!clean) return true;
  const compact = clean.replace(/\s+/g, "");
  return compact.length < 240
    && /(?:基于|根据|结合|沿用).{0,20}(?:刚完成|上述|已有|前面|本次).{0,40}(?:生成|制作|写|输出|继续处理)/u.test(compact);
}
