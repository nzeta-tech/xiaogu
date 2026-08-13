export function buildRemixStudioSource(values: Record<string, unknown>) {
  const read = (key: string) => typeof values[key] === "string" ? values[key].trim() : "";
  const sourceText = read("source_text");
  const transcript = read("source_transcript");
  const title = read("source_title");
  const evidence = read("source_evidence");
  const angle = read("remix_angle");
  const primary = sourceText || transcript;

  return [
    primary || (title ? `参考内容：${title}` : ""),
    evidence && !primary.includes(evidence) ? `事实证据摘要：${evidence}` : "",
    angle ? `我的补充想法：${angle}` : "",
  ].filter(Boolean).join("\n\n");
}
