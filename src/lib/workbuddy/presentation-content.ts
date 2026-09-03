export type WorkbuddyContentSections = { main: string; ancillary?: { title: string; content: string } };

const ancillaryHeading = /^(?:#{1,6}\s*|\*\*)?(参考来源(?:与核验状态)?|核验状态|研究来源|资料来源)(?:\*\*)?\s*[:：]?\s*$/m;

export function splitAncillaryResearchSection(content: string): WorkbuddyContentSections {
  const match = ancillaryHeading.exec(content);
  if (!match || match.index < 1) return { main: content };
  const bodyStart = match.index + match[0].length;
  const main = content.slice(0, match.index).trimEnd();
  const ancillary = content.slice(bodyStart).trim();
  if (!main || !ancillary) return { main: content };
  return { main, ancillary: { title: match[1], content: ancillary } };
}
