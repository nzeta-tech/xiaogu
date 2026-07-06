export type CreationFieldValue = string | string[];

export type CreationOutputViewMode = "plain" | "wechat" | "xiaohongshu";

export type CreationOutputItem = {
  id: string;
  title: string;
  body: string;
  viewMode: CreationOutputViewMode;
  summary: string;
};

export type CreationOutputBatch = {
  id: string;
  label: string;
  items: CreationOutputItem[];
};

export type ParsedCreationOutput = {
  batches: CreationOutputBatch[];
  plainText: string;
};

const targetLabels: Record<string, { label: string; viewMode: CreationOutputViewMode }> = {
  "短视频口播": { label: "口播稿", viewMode: "plain" },
  "小红书笔记": { label: "小红书", viewMode: "xiaohongshu" },
  "公众号文章": { label: "公众号", viewMode: "wechat" },
  "朋友圈文案": { label: "朋友圈", viewMode: "plain" },
  "口播稿 1": { label: "口播稿 1", viewMode: "plain" },
  "口播稿 2": { label: "口播稿 2", viewMode: "plain" },
  "口播稿 3": { label: "口播稿 3", viewMode: "plain" },
  "A 版 · 情绪洞察型": { label: "小红书 A版", viewMode: "xiaohongshu" },
  "B 版 · 干货拆解型": { label: "小红书 B版", viewMode: "xiaohongshu" },
  "文章风格**：洞察型": { label: "公众号 洞察型", viewMode: "wechat" },
  "文章风格**：温度型": { label: "公众号 温度型", viewMode: "wechat" },
};

export function summarizeTitle(values: Record<string, CreationFieldValue>, fieldIds: string[]) {
  const firstFilled = fieldIds
    .map((fieldId) => stringifyCreationFieldValue(values[fieldId]))
    .find((value) => value.trim().length > 0);
  return (firstFilled || "新的创作").slice(0, 18);
}

export function stringifyCreationFieldValue(value: CreationFieldValue | undefined) {
  if (Array.isArray(value)) return value.join("、");
  return value ?? "";
}

export function isEmptyCreationFieldValue(value: CreationFieldValue | undefined) {
  if (Array.isArray(value)) return value.length === 0;
  return !value || !value.trim();
}

export function buildCreationOutputJson(result: string, selectedTargets: string[]) {
  const parsed = parseCreationOutput(result);
  if (parsed.batches.length > 0) return parsed;

  const fallbackBatches = selectedTargets
    .map((target, index) => {
      const config = getTargetMetaByValue(target);
      if (!config) return null;
      return {
        id: `${target}-${index + 1}`,
        label: config.label,
        items: [
          {
            id: `${target}-${index + 1}-item-1`,
            title: inferItemTitle(result, config.label, 1),
            body: result.trim(),
            viewMode: config.viewMode,
            summary: inferSummary(result),
          },
        ],
      } satisfies CreationOutputBatch;
    })
    .filter((item): item is CreationOutputBatch => Boolean(item));

  return {
    plainText: result,
    batches: fallbackBatches,
  } satisfies ParsedCreationOutput;
}

export function parseCreationOutput(result: string): ParsedCreationOutput {
  const normalized = result.replace(/\r\n/g, "\n").trim();
  if (!normalized) return { batches: [], plainText: "" };

  const sections = splitSections(normalized);
  const batches = sections
    .map((section, index) => {
      const meta = getTargetMetaByLabel(section.title);
      const items = splitItems(section.body, meta?.viewMode ?? "plain", meta?.label ?? section.title).map((item, itemIndex) => ({
        ...item,
        id: `${slugify(meta?.label ?? section.title)}-${index + 1}-${itemIndex + 1}`,
      }));
      return {
        id: `${slugify(meta?.label ?? section.title)}-${index + 1}`,
        label: meta?.label ?? section.title,
        items,
      } satisfies CreationOutputBatch;
    })
    .filter((batch) => batch.items.length > 0);

  return {
    batches,
    plainText: normalized,
  };
}

function splitSections(result: string) {
  const polishSections = splitPolishSections(result);
  if (polishSections.length > 0) return polishSections;

  const leadCopySections = splitLeadCopySections(result);
  if (leadCopySections.length > 0) return leadCopySections;

  const lines = result.split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.trim().match(/^【(.+?)】\s*$/);
    if (match) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: currentLines.join("\n").trim() });
      }
      currentTitle = match[1].trim();
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, body: currentLines.join("\n").trim() });
  }

  if (sections.length > 0) return sections;
  return [{ title: "生成内容", body: result }];
}

function splitPolishSections(result: string) {
  const videoPolishSections = splitVideoPolishSections(result);
  if (videoPolishSections.length > 0) return videoPolishSections;

  const articlePolishSections = splitArticlePolishSections(result);
  if (articlePolishSections.length > 0) return articlePolishSections;

  return [];
}

function splitVideoPolishSections(result: string) {
  const regex = /(?:^|\n)(\d+[）)]【(.+?)】)\s*\n/g;
  const matches = Array.from(result.matchAll(regex));
  if (matches.length === 0) return [];

  return matches
    .map((match, index) => {
      const full = match[1];
      const title = match[2].trim();
      const start = (match.index ?? 0) + full.length + 1;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? result.length) : result.length;
      const body = result.slice(start, end).trim();
      return { title, body };
    })
    .filter((section) => section.body.length > 0);
}

function splitArticlePolishSections(result: string) {
  const regex = /(?:^|\n)#{1,2}\s+(.+?)\s*\n/g;
  const matches = Array.from(result.matchAll(regex));
  if (matches.length === 0) return [];
  if (!matches.some((match) => match[1].includes("文章标题建议") || match[1].includes("精修后的文章"))) return [];

  const introEnd = matches[0].index ?? 0;
  const sections: Array<{ title: string; body: string }> = [];
  const intro = result.slice(0, introEnd).replace(/^[-\s]+|[-\s]+$/g, "").trim();
  if (intro) {
    sections.push({ title: "精修说明", body: intro });
  }

  for (const [index, match] of matches.entries()) {
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? result.length) : result.length;
    const body = result.slice(start, end).replace(/^[-\s]+|[-\s]+$/g, "").trim();
    if (!body) continue;
    sections.push({ title, body });
  }

  return sections;
}

function splitLeadCopySections(result: string) {
  const headingRegex = /(?:^|\n)\**\s*([一二三四五六七八九十]+、(?:短视频引流口播|小红书笔记|公众号文章))\s*\**/g;
  const matches = Array.from(result.matchAll(headingRegex));
  if (matches.length === 0) return [];

  return matches.map((match, index) => {
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? result.length) : result.length;
    const body = result.slice(start, end).trim();
    return { title, body };
  }).filter((section) => section.body.length > 0);
}

function splitItems(body: string, viewMode: CreationOutputViewMode, fallbackLabel: string) {
  const normalized = body.trim();
  if (!normalized) return [];

  const numberedItems = splitNumberedItems(normalized, viewMode, fallbackLabel);
  if (numberedItems.length > 0) return numberedItems;

  const blocks = normalized
    .split(/\n(?=(?:标题[:：]|#\s|##\s|###\s|🎤|📌|一、|二、|三、|四、))/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length <= 1) {
    return [
      {
        title: inferItemTitle(normalized, fallbackLabel, 1),
        body: normalized,
        viewMode,
        summary: inferSummary(normalized),
      },
    ];
  }

  return blocks.map((block, index) => ({
    title: inferItemTitle(block, fallbackLabel, index + 1),
    body: block,
    viewMode,
    summary: inferSummary(block),
  })).filter((item) => !isTrivialItemBody(item.body));
}

function splitNumberedItems(body: string, viewMode: CreationOutputViewMode, fallbackLabel: string) {
  const lines = body.split("\n");
  const items: Array<{ title: string; body: string; viewMode: CreationOutputViewMode; summary: string }> = [];
  let currentLines: string[] = [];
  let currentMarker: string | null = null;

  for (const line of lines) {
    const markerMatch = line.trim().match(/^(\d+)[.、]\s*$/);
    if (markerMatch) {
      if (currentMarker && currentLines.length > 0) {
        const block = currentLines.join("\n").trim();
        if (block && !isTrivialItemBody(block)) {
          items.push({
            title: inferItemTitle(block, fallbackLabel, items.length + 1),
            body: block,
            viewMode,
            summary: inferSummary(block),
          });
        }
      }
      currentMarker = markerMatch[1];
      currentLines = [];
      continue;
    }

    if (currentMarker) {
      currentLines.push(line);
    }
  }

  if (currentMarker && currentLines.length > 0) {
    const block = currentLines.join("\n").trim();
    if (block && !isTrivialItemBody(block)) {
      items.push({
        title: inferItemTitle(block, fallbackLabel, items.length + 1),
        body: block,
        viewMode,
        summary: inferSummary(block),
      });
    }
  }

  return items.length >= 2 ? items : [];
}

function inferItemTitle(body: string, fallbackLabel: string, index: number) {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return `${fallbackLabel}${index}`;

  const titleLabelIndex = lines.findIndex((line) => /^标题[:：]\s*$/.test(line));
  if (titleLabelIndex >= 0) {
    const titledLine = lines.slice(titleLabelIndex + 1).find((line) => !isPureNumberMarker(line));
    if (titledLine) return titledLine.slice(0, 60);
  }

  const firstLine = lines.find((line) => !isPureNumberMarker(line));

  if (!firstLine) return `${fallbackLabel}${index}`;

  const cleaned = firstLine
    .replace(/^标题[:：]\s*/, "")
    .replace(/^#{1,3}\s*/, "")
    .trim();

  return cleaned.slice(0, 60) || `${fallbackLabel}${index}`;
}

function isPureNumberMarker(value: string) {
  return /^\d+[.、]$/.test(value.trim());
}

function isTrivialItemBody(value: string) {
  const compact = value.replace(/\s+/g, "").trim();
  return compact.length === 0 || isPureNumberMarker(compact);
}

function inferSummary(body: string) {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.slice(0, 96);
}

function getTargetMetaByLabel(label: string): { label: string; viewMode: CreationOutputViewMode } | null {
  if (label.includes("短视频引流口播")) return { label: "口播稿", viewMode: "plain" };
  if (label.includes("小红书笔记")) return { label: "小红书", viewMode: "xiaohongshu" };
  if (label.includes("公众号文章")) return { label: "公众号", viewMode: "wechat" };
  return Object.entries(targetLabels).find(([target]) => label.includes(target))?.[1] ?? null;
}

function getTargetMetaByValue(value: string): { label: string; viewMode: CreationOutputViewMode } | null {
  if (value === "video_script") return targetLabels["短视频口播"];
  if (value === "video_batch") return { label: "口播稿", viewMode: "plain" };
  if (value === "redbook_batch") return { label: "小红书", viewMode: "xiaohongshu" };
  if (value === "wechat_batch") return { label: "公众号", viewMode: "wechat" };
  if (value === "xiaohongshu") return targetLabels["小红书笔记"];
  if (value === "wechat_article") return targetLabels["公众号文章"];
  if (value === "moments") return targetLabels["朋友圈文案"];
  return null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "batch";
}
