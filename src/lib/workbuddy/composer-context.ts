export type WorkbuddyComposerContextItem = {
  id: string;
  type: "customer" | "task" | "work" | "file";
  label: string;
  content: string;
  meta: string;
};

/** Keep UI control state out of business material consumed by applications. */
export function serializeWorkbuddyComposerContext(
  items: WorkbuddyComposerContextItem[],
  typeLabel: (type: WorkbuddyComposerContextItem["type"]) => string,
) {
  return items
    .filter((item) => item.id !== "selected-skill")
    .map((item) => `【${typeLabel(item.type)}：${item.label}】\n${item.content}`)
    .join("\n\n");
}

export function selectedWorkbuddyCapabilityId(items: WorkbuddyComposerContextItem[]) {
  return items
    .find((item) => item.id === "selected-skill")
    ?.content.match(/能力 ID[：:]\s*([^\s。]+)/)?.[1];
}
