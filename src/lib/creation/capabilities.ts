import type { CreationFieldOption } from "@/lib/apps/catalog";

export type RemixCapabilityId = "traffic-copy" | "wechat-studio" | "xiaohongshu-studio" | "moments";

export const remixCapabilityOptions: CreationFieldOption[] = [
  { label: "口播文案（流量型）", value: "traffic-copy", hint: "适合视频号、抖音直接录制" },
  { label: "公众号文章", value: "wechat-studio", hint: "完整长文与自然段落结构" },
  { label: "小红书笔记", value: "xiaohongshu-studio", hint: "短段落、标题与站内互动" },
  { label: "朋友圈文案", value: "moments", hint: "自然、简短的顾问日常表达" },
];

export function normalizeRemixCapability(value: unknown): RemixCapabilityId {
  return remixCapabilityOptions.some((option) => option.value === value)
    ? value as RemixCapabilityId
    : "wechat-studio";
}

export function remixCapabilityLabel(value: unknown) {
  const capability = normalizeRemixCapability(value);
  return remixCapabilityOptions.find((option) => option.value === capability)?.label ?? "公众号文章";
}
