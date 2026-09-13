import type { ConversationAppField } from "./app-conversation";

export const XIAOHONGSHU_ASSETS_PARAMETER_SLUG = "xiaohongshu-assets";

export type XiaohongshuAssetsParameters = {
  visual_style: string;
  cover_type: string;
  ratio: "3:4";
  _workbuddy_operation?: string;
  parent_work_id?: string;
};

export const defaultXiaohongshuAssetsParameters: XiaohongshuAssetsParameters = {
  visual_style: "daily-sign",
  cover_type: "xhs-bold-text",
  ratio: "3:4",
};

/** One contract feeds both the in-chat form and the composite runtime. */
export function buildXiaohongshuAssetsFields(operation = "create", parentWorkId = ""): ConversationAppField[] {
  return [
    { id: "_workbuddy_operation", label: "本轮操作", type: "text", required: true, presentation: "data", initialValue: operation },
    { id: "parent_work_id", label: "承接作品", type: "text", required: true, presentation: "data", initialValue: parentWorkId },
    {
      id: "visual_style", label: "整套配图风格", type: "single", required: true, initialValue: defaultXiaohongshuAssetsParameters.visual_style,
      helper: "头图与正文配图沿用同一视觉方向，保证整套一致。",
      options: [
        { label: "生活共鸣", value: "daily-sign", description: "真实日常场景，适合情绪与观点表达", previewUrl: "/examples/image-card-styles/daily-sign.webp" },
        { label: "清单干货", value: "study", description: "突出步骤、条件和可收藏信息", previewUrl: "/examples/image-card-styles/study.webp" },
        { label: "轻手账故事", value: "scrapbook", description: "适合经验分享和温和叙事", previewUrl: "/examples/image-card-styles/scrapbook.webp" },
        { label: "温柔观点", value: "large-sign", description: "用一句鲜明判断吸引停留", previewUrl: "/examples/image-card-styles/large-sign.webp" },
        { label: "温和专业", value: "fresh-card", description: "低饱和信息卡，适合决策型内容", previewUrl: "/examples/image-card-styles/fresh-card.webp" },
      ],
    },
    {
      id: "cover_type", label: "头图版式", type: "single", required: true, initialValue: defaultXiaohongshuAssetsParameters.cover_type,
      options: [
        { label: "痛点大字型", value: "xhs-bold-text", description: "醒目短句与关键词高亮", previewUrl: "/examples/xiaohongshu-cover-types/bold-text.png" },
        { label: "左右对比型", value: "xhs-comparison", description: "适合选择、前后或利弊比较", previewUrl: "/examples/xiaohongshu-cover-types/comparison.png" },
        { label: "清单资料型", value: "xhs-checklist", description: "编号要点，强化收藏感", previewUrl: "/examples/xiaohongshu-cover-types/checklist.png" },
        { label: "真实场景型", value: "xhs-real-scene", description: "笔记、桌面或生活实拍感", previewUrl: "/examples/xiaohongshu-cover-types/scene.png" },
      ],
    },
    { id: "ratio", label: "发布尺寸", type: "text", required: true, presentation: "data", initialValue: "3:4" },
  ];
}

export function normalizeXiaohongshuAssetsParameters(value: Record<string, unknown> | null | undefined): XiaohongshuAssetsParameters {
  const styles = new Set(["daily-sign", "study", "scrapbook", "large-sign", "fresh-card"]);
  const covers = new Set(["xhs-bold-text", "xhs-comparison", "xhs-checklist", "xhs-real-scene"]);
  return {
    visual_style: styles.has(String(value?.visual_style)) ? String(value?.visual_style) : defaultXiaohongshuAssetsParameters.visual_style,
    cover_type: covers.has(String(value?.cover_type)) ? String(value?.cover_type) : defaultXiaohongshuAssetsParameters.cover_type,
    ratio: "3:4",
    ...(typeof value?._workbuddy_operation === "string" ? { _workbuddy_operation: value._workbuddy_operation } : {}),
    ...(typeof value?.parent_work_id === "string" ? { parent_work_id: value.parent_work_id } : {}),
  };
}
