import type { CreationApp } from "./catalog.ts";

export type ApplicationWorkflowStep = {
  id: string;
  label: string;
  produces: "text" | "image" | "presentation" | "data";
  execution: "application" | "workspace" | "external";
};

export type ApplicationContinuation = {
  id: string;
  label: string;
  description: string;
  kind: "same-work" | "cross-app" | "revise" | "external-handoff";
  targetStep?: string;
  targetCapabilityId?: string;
  presentation: "inline-form" | "inline-step" | "embedded-workspace" | "external-workspace";
  instruction: string;
};

export type ApplicationWorkflowContract = {
  appSlug: string;
  version: 1;
  steps: ApplicationWorkflowStep[];
  continuations: ApplicationContinuation[];
  preservesWorkId: boolean;
};

const workflowOverrides: Record<string, Omit<ApplicationWorkflowContract, "appSlug" | "version">> = {
  "xiaohongshu-studio": {
    preservesWorkId: true,
    steps: [
      { id: "input", label: "填写素材", produces: "data", execution: "workspace" },
      { id: "draft", label: "编辑笔记", produces: "text", execution: "application" },
      { id: "assets", label: "生成配图", produces: "image", execution: "workspace" },
      { id: "preview", label: "整体预览", produces: "data", execution: "workspace" },
    ],
    continuations: [
      { id: "assets", label: "继续生成配图", description: "在当前对话流中生成同一篇笔记的头图和章节配图", kind: "same-work", targetStep: "assets", targetCapabilityId: "skill.xiaohongshu-assets", presentation: "inline-form", instruction: "承接刚完成的小红书正文，继续同一篇作品的头图和章节配图步骤；直接生成并在对话中交付图片，不要跳转页面，也不要重新创作正文。" },
      { id: "revise", label: "继续修改笔记", description: "调整标题、正文、标签或语气", kind: "revise", targetStep: "draft", targetCapabilityId: "app.xiaohongshu-studio", presentation: "inline-form", instruction: "请基于刚完成的小红书笔记继续修改。" },
    ],
  },
  "wechat-studio": {
    preservesWorkId: true,
    steps: [
      { id: "input", label: "填写内容", produces: "data", execution: "workspace" },
      { id: "draft", label: "预览文章", produces: "text", execution: "application" },
      { id: "assets", label: "选择配图", produces: "image", execution: "workspace" },
      { id: "layout", label: "整体版式", produces: "data", execution: "workspace" },
      { id: "publish", label: "预览发布", produces: "data", execution: "external" },
    ],
    continuations: [
      { id: "assets", label: "继续生成公众号配图", description: "继续同一篇文章的封面、正文配图和整体版式", kind: "same-work", targetStep: "assets", presentation: "embedded-workspace", instruction: "继续同一篇公众号文章的封面和正文配图步骤，不要重新创作正文。" },
      { id: "revise", label: "继续修改文章", description: "调整标题、结构、语气或篇幅", kind: "revise", targetStep: "draft", targetCapabilityId: "app.wechat-studio", presentation: "inline-form", instruction: "请基于刚完成的公众号文章继续修改。" },
    ],
  },
  "traffic-copy": {
    preservesWorkId: true,
    steps: [
      { id: "topics", label: "分析选题", produces: "data", execution: "application" },
      { id: "draft", label: "生成口播", produces: "text", execution: "application" },
    ],
    continuations: [
      { id: "cover", label: "制作视频封面", description: "继续在对话中选择平台、风格和尺寸", kind: "cross-app", targetCapabilityId: "app.video-cover", presentation: "inline-form", instruction: "请基于刚完成的口播正文，调用视频封面制作应用继续完成发布封面。" },
      { id: "revise", label: "继续优化口播", description: "调整开头、节奏、观点或结尾", kind: "revise", targetCapabilityId: "app.traffic-copy", presentation: "inline-form", instruction: "请保留当前口播的事实和核心观点，继续优化。" },
    ],
  },
};

export function workflowContractForApp(app: Pick<CreationApp, "slug" | "name" | "resultType">): ApplicationWorkflowContract {
  const override = workflowOverrides[app.slug];
  if (override) return { appSlug: app.slug, version: 1, ...override };
  const produces = app.resultType === "image" || app.resultType === "image-plan" ? "image" : app.resultType === "presentation" ? "presentation" : "text";
  return {
    appSlug: app.slug,
    version: 1,
    preservesWorkId: false,
    steps: [{ id: "create", label: `生成${app.name}`, produces, execution: "application" }],
    continuations: [
      { id: "revise", label: produces === "text" ? "继续修改" : "再生成一个版本", description: "沿用本次素材和参数继续处理", kind: "revise", targetCapabilityId: `app.${app.slug}`, presentation: "inline-form", instruction: "请基于刚完成的产物继续处理。" },
    ],
  };
}

export function validateApplicationWorkflowContract(contract: ApplicationWorkflowContract) {
  const stepIds = new Set(contract.steps.map(step => step.id));
  const errors: string[] = [];
  if (!contract.steps.length) errors.push("workflow_has_no_steps");
  if (stepIds.size !== contract.steps.length) errors.push("duplicate_step_id");
  for (const continuation of contract.continuations) {
    if (continuation.kind === "same-work" && !contract.preservesWorkId) errors.push(`same_work_without_work_id:${continuation.id}`);
    if (continuation.targetStep && !stepIds.has(continuation.targetStep)) errors.push(`unknown_target_step:${continuation.id}`);
    if (continuation.kind === "cross-app" && !continuation.targetCapabilityId) errors.push(`cross_app_without_capability:${continuation.id}`);
  }
  return errors;
}
