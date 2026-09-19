const text = (value) => typeof value === "string" ? value.trim() : "";

const intentValues = new Set(["anchor", "evidence", "explain", "scene", "emotion"]);
const layoutValues = new Set(["presenter", "presenter-pip", "fullscreen"]);

function compact(value) {
  return text(value).replace(/\s+/g, "");
}

function splitUnits(source) {
  const sentences = source.match(/[^。！？!?；;]+[。！？!?；;]?/gu)?.map(item => item.trim()).filter(Boolean) ?? [source];
  const units = [];
  for (const sentence of sentences) {
    if (Array.from(sentence).length <= 34) {
      units.push(sentence);
      continue;
    }
    const clauses = sentence.match(/[^，,：:]+[，,：:]?/gu)?.map(item => item.trim()).filter(Boolean) ?? [sentence];
    let pending = "";
    for (const clause of clauses) {
      if (!pending) pending = clause;
      else if (Array.from(pending + clause).length <= 30) pending += clause;
      else {
        units.push(pending);
        pending = clause;
      }
    }
    if (pending) units.push(pending);
  }
  while (units.length > 4) {
    let shortest = 0;
    for (let index = 1; index < units.length; index++) if (units[index].length < units[shortest].length) shortest = index;
    if (shortest === 0) units.splice(0, 2, units[0] + units[1]);
    else units.splice(shortest - 1, 2, units[shortest - 1] + units[shortest]);
  }
  if (units.length === 1 && Array.from(source).length >= 28) {
    const chars = Array.from(source);
    const middle = Math.floor(chars.length / 2);
    let cut = middle;
    for (let radius = 0; radius < Math.min(12, middle); radius++) {
      for (const candidate of [middle + radius, middle - radius]) {
        if (/[，,：:]/.test(chars[candidate] ?? "")) { cut = candidate + 1; radius = 99; break; }
      }
    }
    return [chars.slice(0, cut).join(""), chars.slice(cut).join("")].filter(Boolean);
  }
  return units;
}

export function inferBeatIntent(value, index = 0, count = 1) {
  const source = text(value);
  if (/\d+(?:\.\d+)?(?:%|％|万亿|亿元|亿|万元|元)|数据显示|报告|统计|官方|文件|政策|新闻|同比|环比/.test(source)) return "evidence";
  if (/为什么|原因|意味着|本质|逻辑|所以|因此|因为|如何|机制|换句话说|也就是/.test(source)) return "explain";
  if (/感动|焦虑|担心|害怕|安心|希望|遗憾|压力|痛苦|幸福|爱/.test(source)) return "emotion";
  if (/例如|比如|一位|家庭|客户|来到|走进|看到|生活|工作|孩子|老人|医院|学校|房子/.test(source)) return "scene";
  if (index === 0 || index === count - 1 || /记住|结论|建议|关键|先问|真正/.test(source)) return "anchor";
  return "scene";
}

export function layoutForIntent(intent, index = 0) {
  if (intent === "anchor") return "presenter";
  if (intent === "evidence" || intent === "explain") return "presenter-pip";
  return index % 3 === 0 ? "presenter-pip" : "fullscreen";
}

function queryFor(segment, intent) {
  const base = text(segment.query) || "real life";
  const suffix = intent === "evidence" ? "official report data chart"
    : intent === "explain" ? "explanatory diagram process"
      : intent === "emotion" ? "authentic human reaction"
        : intent === "scene" ? "real life documentary footage"
          : "speaker";
  return `${base} ${suffix}`.slice(0, 120);
}

function fallbackBeats(segment) {
  const units = splitUnits(text(segment.text));
  return units.map((unit, index) => {
    const intent = inferBeatIntent(unit, index, units.length);
    return {
      id: `${segment.id}-b${index + 1}`,
      parentId: segment.id,
      text: unit,
      visual: index === 0 ? text(segment.visual) : unit.replace(/[。！？!?；;，,：:]+$/u, "").slice(0, 18),
      query: queryFor(segment, intent),
      intent,
      layout: layoutForIntent(intent, index),
      cardPoints: [unit],
    };
  });
}

function normalizeSuppliedBeats(segment) {
  const supplied = Array.isArray(segment.beats) ? segment.beats.slice(0, 4) : [];
  if (!supplied.length) return null;
  const source = text(segment.text);
  const joined = supplied.map(beat => text(beat?.text)).join("");
  if (!supplied.every(beat => text(beat?.text)) || compact(joined) !== compact(source)) return null;
  let cursor = 0;
  const normalized = [];
  for (let index = 0; index < supplied.length; index++) {
    const beat = supplied[index] ?? {};
    const beatText = text(beat.text);
    const found = source.indexOf(beatText, cursor);
    if (found < 0) return null;
    cursor = found + beatText.length;
    const intent = intentValues.has(beat.intent) ? beat.intent : inferBeatIntent(beatText, index, supplied.length);
    const layout = layoutValues.has(beat.layout) ? beat.layout : layoutForIntent(intent, index);
    normalized.push({
      id: `${segment.id}-b${index + 1}`,
      parentId: segment.id,
      text: beatText,
      visual: text(beat.visual).slice(0, 80) || (index === 0 ? text(segment.visual) : beatText.slice(0, 18)),
      query: text(beat.query).slice(0, 120) || queryFor(segment, intent),
      intent,
      layout,
      cardPoints: Array.isArray(beat.cardPoints) ? beat.cardPoints.filter(point => typeof point === "string" && beatText.includes(point)).slice(0, 3) : [beatText],
    });
  }
  return normalized;
}

export function expandSmartSegments(segments) {
  return segments.flatMap(segment => normalizeSuppliedBeats(segment) ?? fallbackBeats(segment));
}

export function presenterAnchorMaterial(segment) {
  return {
    kind: "presenter",
    source: "xiaogu-presenter-anchor",
    license: "project-owned",
    title: text(segment.visual) || "人物口播",
    query: text(segment.query),
  };
}
