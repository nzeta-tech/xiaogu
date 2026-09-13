import assert from "node:assert/strict";
import test from "node:test";
import { applicationNeedsConversationForm, appNextActions, assessApplicationReadiness, buildConversationAppFields, buildConversationAppHandoffSource, buildPriorConversationAppSource, isGenericApplicationIntent, mergeConversationAppParameters, parseConversationAppParameters, resolveConversationAppParameters, resolveConversationAppSource, resolveConversationFormState, resolvePendingApplicationHandoff, sanitizeConversationAppValues, shouldSkipTrafficTopicSelection, stripConversationAppProtocols, upgradeStoredConversationPresentation } from "./app-conversation.ts";
import { getCreationAppBySlug } from "../apps/catalog.ts";

const app = {
  id: "demo", slug: "demo", name: "演示应用", emoji: "", category: "content", points: 1,
  description: "", promptHint: "", resultType: "text",
  fields: [
    { id: "platform", label: "平台", type: "radio", required: true, options: [{ label: "视频号", value: "wechat" }, { label: "抖音", value: "douyin" }] },
    { id: "source", label: "素材", type: "textarea", required: true },
    { id: "reference", label: "资料", type: "file" },
  ],
};

test("pending application material is consumed only by its matching confirmation", () => {
  const messages = [{ message_type: "clarification", metadata_json: {
    reason: "app-parameters:image-card",
    pendingAppInstruction: "制作天气图片",
    pendingAppSource: "今天天气预报",
  } }];
  assert.deepEqual(resolvePendingApplicationHandoff(messages, "帮我把外滩大会内容制作成知识图片"), { instruction: "", source: "" });
  assert.deepEqual(resolvePendingApplicationHandoff(messages, `[应用参数:image-card]\n{"source":"外滩大会"}`), {
    instruction: "制作天气图片",
    source: "今天天气预报",
  });
  assert.deepEqual(resolvePendingApplicationHandoff(messages, `[应用参数:video-cover]\n{"title":"外滩大会"}`), { instruction: "", source: "" });
});

test("application fields become a chat-native form", () => {
  assert.equal(applicationNeedsConversationForm(app), true);
  const fields = buildConversationAppFields(app, "已有素材");
  assert.equal(fields[0].type, "single");
  assert.equal(fields[1].initialValue, "已有素材");
  assert.equal(fields[2].type, "file");
});

test("an inherited source locks declared mode fields instead of asking a redundant question", () => {
  const xiaohongshu = getCreationAppBySlug("xiaohongshu-studio");
  const withMaterial = buildConversationAppFields(xiaohongshu, "这是上一轮已经完成并确认的正文素材。");
  const mode = withMaterial.find((field) => field.id === "creation_mode");
  assert.equal(mode?.initialValue, "rewrite");
  assert.equal(mode?.presentation, "data");
  assert.equal(withMaterial.find((field) => field.id === "topic")?.presentation, undefined);

  const withoutMaterial = buildConversationAppFields(xiaohongshu, "");
  assert.equal(withoutMaterial.find((field) => field.id === "creation_mode")?.presentation, undefined);
});

test("a persisted legacy form is upgraded when it already contains material", () => {
  const metadata = upgradeStoredConversationPresentation({ presentation: { blocks: [{
    type: "form", appSlug: "xiaohongshu-studio", fields: [
      { id: "topic", initialValue: "已有正文", presentation: "data" },
      { id: "creation_mode", initialValue: "" },
      { id: "length_mode", initialValue: "" },
    ],
  }] } }, [getCreationAppBySlug("xiaohongshu-studio")]);
  const fields = metadata.presentation.blocks[0].fields;
  assert.equal(fields.find(field => field.id === "creation_mode").presentation, "data");
  assert.equal(fields.find(field => field.id === "creation_mode").initialValue, "rewrite");
});

test("persisted Xiaohongshu asset choices upgrade to an inline chat step", () => {
  const upgraded = upgradeStoredConversationPresentation({ presentation: { blocks: [{ type: "choices", question: "下一步", options: [{ label: "继续生成配图", value: "继续", href: "/apps/xiaohongshu-studio?workId=w1", continuation: { protocolVersion: 1, appSlug: "xiaohongshu-studio", id: "assets", kind: "same-work", targetStep: "assets", workId: "w1", presentation: "embedded-workspace" } }] }] } }, [getCreationAppBySlug("xiaohongshu-studio")]);
  assert.equal(upgraded.presentation.blocks[0].options[0].continuation.presentation, "inline-form");
  assert.equal(upgraded.presentation.blocks[0].options[0].continuation.targetCapabilityId, "skill.xiaohongshu-assets");
  assert.equal(upgraded.presentation.blocks[0].options[0].href, undefined);
});

test("confirmed application parameters override defaults", () => {
  const message = `[应用参数:demo]\n${JSON.stringify({ platform: "douyin", source: "用户内容" })}\n继续执行`;
  assert.deepEqual(parseConversationAppParameters(message, "demo"), { platform: "douyin", source: "用户内容" });
  assert.deepEqual(mergeConversationAppParameters({ platform: "wechat", source: "默认" }, message, "demo"), { platform: "douyin", source: "用户内容" });
});

test("parameter parser skips a marker nested inside source text", () => {
  const first = `[应用参数:traffic-copy]\n${JSON.stringify({ source: "催捐热点" })}`;
  const nested = `[应用参数:traffic-copy]\n${JSON.stringify({ source: first })}`;
  assert.deepEqual(parseConversationAppParameters(nested, "traffic-copy"), { source: "催捐热点" });
  assert.deepEqual(parseConversationAppParameters(`${first}\n坏副本：[应用参数:traffic-copy]\\n{\\"source\\":\\"坏\\"}`, "traffic-copy"), { source: "催捐热点" });
});

test("current confirmation takes priority over historical context", () => {
  const current = `[应用参数:image-card]\n${JSON.stringify({ source: "当前素材", creation_mode: "text_to_card" })}`;
  const history = `[应用参数:image-card]\n${JSON.stringify({ source: "旧素材", creation_mode: "image_remix" })}`;
  assert.equal(resolveConversationAppParameters(current, history, "image-card")?.source, "当前素材");
  assert.equal(resolveConversationAppParameters("[应用参数:image-card]\n坏数据", history, "image-card"), null);
  assert.equal(resolveConversationAppParameters("基于上面的方向继续写", history, "image-card"), null);
});

test("researched application instruction seeds the confirmation form", () => {
  const pending = "围绕梅艳芳的信托养老安排，解释按月支付与一次性继承的区别。";
  assert.equal(resolveConversationAppSource(pending, "", "梅艳芳今天很火，帮我找一个角度写"), pending);
  assert.equal(resolveConversationAppSource("", "按信托角度继续", "原始目标"), "按信托角度继续");
  const confirmed = `[应用参数:traffic-copy]\n${JSON.stringify({ source: "真正的口播素材" })}`;
  assert.equal(resolveConversationAppSource(confirmed, "", "原始目标", "traffic-copy"), "真正的口播素材");
  assert.equal(resolveConversationAppSource("确认协议 [应用参数:traffic-copy]\\n坏数据", "", "原始目标", "traffic-copy"), "原始目标");
});

test("research evidence is durably handed to every application form", () => {
  const source = buildConversationAppHandoffSource({
    appSlug: "traffic-copy",
    instruction: "结合研究生成关于两起催捐热点的口播文案",
    currentRequest: "这两个事情能帮我写一篇口播文案吗",
    objective: "最近是不是有一个催捐的热点",
    observations: [
      { capabilityId: "tool.hot-topic-discovery", status: "success", summary: "与本题无关的手机和消费热点候选" },
      { capabilityId: "agent.fast-research", status: "success", summary: "姚先生停止资助后收到学生催款；相关部门仍在核查。来源：https://example.com/a" },
      { capabilityId: "agent.fast-research", status: "success", summary: "单亲妈妈取消月捐后接到机构电话；联合国儿童基金会澄清并非该机构。来源：https://example.com/b" },
    ],
  });
  assert.match(source, /姚先生停止资助/);
  assert.match(source, /取消月捐/);
  assert.match(source, /必须作为本次素材，不得另换主题/);
  assert.doesNotMatch(source, /手机和消费热点/);
  assert.doesNotMatch(source, /\[应用参数:/);
});

test("a generic creation follow-up carries the prior researched topic into the app", () => {
  const prior = buildPriorConversationAppSource({
    currentRequest: "帮我写一篇口播文案稿",
    activeTopic: "今天是不是有一个发视频被判为无罪的新闻",
    latestAssistantContent: "广东惠州一名女子因45秒视频被追诉，检方最终因证据不足撤回起诉；她被羁押608天后获得国家赔偿。严格说不是法院判无罪。",
    app: getCreationAppBySlug("traffic-copy"),
  });
  const source = buildConversationAppHandoffSource({ appSlug: "traffic-copy", instruction: "生成口播", currentRequest: "帮我写一篇口播文案稿", objective: "i", observations: [], priorConversationSource: prior });
  assert.match(source, /45秒视频/);
  assert.match(source, /608天/);
  assert.match(source, /不得重新选题/);
});

test("a just-completed transform carries the actual prior output into a media app", () => {
  const request = "请基于刚完成的口播正文，调用视频封面制作应用继续完成发布封面。";
  const prior = buildPriorConversationAppSource({
    currentRequest: request,
    activeTopic: request,
    latestAssistantContent: "## 第一篇口播\n这是第一篇真实正文。".repeat(4) + "\n\n## 第二篇口播\n这是第二篇真实正文。".repeat(4),
    app: getCreationAppBySlug("video-cover"),
  });
  const source = buildConversationAppHandoffSource({ appSlug: "video-cover", instruction: "分别制作两张封面", currentRequest: request, objective: "旧目标", observations: [], priorConversationSource: prior });
  assert.match(source, /^【上一轮已经确认的主题与成果/);
  assert.match(source, /第一篇真实正文/);
  assert.match(source, /第二篇真实正文/);
  assert.ok(source.indexOf("第一篇真实正文") < source.indexOf("用户本次要求"));
});

test("a terse rewrite carries the latest delivered draft instead of losing the topic", () => {
  const prior = buildPriorConversationAppSource({
    currentRequest: "重新写",
    activeTopic: "女子发45秒视频被追诉后获国家赔偿",
    latestAssistantContent: "这是一篇已经围绕该事件、选定角度和教练生成的完整流量口播正文。".repeat(3),
    app: getCreationAppBySlug("traffic-copy"),
  });
  assert.match(prior, /45秒视频/);
  assert.match(prior, /完整流量口播正文/);
});

test("internal confirmation protocols never reach application material fields", () => {
  const nested = `[应用参数:traffic-copy]\n${JSON.stringify({ source: "催捐热点事实材料" })}`;
  assert.deepEqual(sanitizeConversationAppValues({ source: nested, audience: "家庭用户" }, "traffic-copy"), { source: "催捐热点事实材料", audience: "家庭用户" });
  assert.equal(sanitizeConversationAppValues({ source: "已确认创作设置。\n[应用参数:traffic-copy]\n坏数据" }, "traffic-copy").source, "");
});

test("historical application envelopes are removed without dropping later conversation", () => {
  const history = `前面的研究结论\n[应用参数:traffic-copy]\n${JSON.stringify({ source: "旧素材", traffic_existing_work_id: "consumed" })}\n旧应用已经执行完成\n用户现在选择了一个新方向`;
  const clean = stripConversationAppProtocols(history);
  assert.match(clean, /前面的研究结论/);
  assert.match(clean, /用户现在选择了一个新方向/);
  assert.doesNotMatch(clean, /traffic_existing_work_id|\[应用参数:/);
});

test("generic creation intent is not treated as executable source material", () => {
  const traffic = getCreationAppBySlug("traffic-copy");
  assert.equal(isGenericApplicationIntent("我想写一篇口播稿", traffic), true);
  assert.equal(assessApplicationReadiness(traffic, "我想写一篇口播稿").ready, false);
  assert.equal(assessApplicationReadiness(traffic, "围绕40年房贷，讲清月供降低和总利息增加").ready, true);
  assert.equal(assessApplicationReadiness(traffic, "基于上面的热点写一篇口播稿").ready, true);
});

test("readiness gate covers other material-dependent applications", () => {
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("wechat-studio"), "帮我写一篇文章").ready, false);
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("video-cover"), "帮我做一个封面").ready, false);
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("policy-diagnosis"), "帮我看一下保单").ready, false);
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("image-card"), "做个知识卡片").ready, false);
  assert.equal(assessApplicationReadiness(getCreationAppBySlug("topic-picker"), "帮我找几个选题").ready, true);
});

test("application results expose natural next actions", () => {
  const actions = appNextActions("traffic-copy", "text");
  assert.ok(actions.some((item) => item.label.includes("视频封面")));
  assert.ok(actions.every((item) => item.value.length > 2));

  const imageAction = appNextActions("xiaohongshu-studio", "text", "/apps/xiaohongshu-studio?workId=work-1").find((item) => item.label.includes("配图"));
  assert.ok(imageAction);
  assert.equal(imageAction.continuation.presentation, "inline-form");
  assert.equal(imageAction.continuation.targetCapabilityId, "skill.xiaohongshu-assets");
  assert.equal(imageAction.href, undefined);
  assert.equal(imageAction.continuation.targetStep, "assets");
  assert.equal(parseConversationAppParameters(imageAction.value, "image-card"), null);
  assert.match(imageAction.value, /承接刚完成的小红书正文/);

  const wechatAction = appNextActions("wechat-studio", "text", "/apps/wechat-studio?workId=work-2").find((item) => item.label.includes("配图"));
  assert.equal(wechatAction?.href, "/apps/wechat-studio?workId=work-2");

  const coverAction = actions.find((item) => item.label.includes("视频封面"));
  assert.equal(coverAction.continuation.presentation, "inline-form");
  assert.equal(coverAction.continuation.targetCapabilityId, "app.video-cover");
  assert.equal(coverAction.href, undefined);
});

test("link remix keeps parser data hidden and exposes target-specific settings", () => {
  const remix = getCreationAppBySlug("link-remix");
  const fields = buildConversationAppFields(remix, "https://example.com/post");
  assert.equal(fields.find((field) => field.id === "source_title")?.presentation, "data");
  assert.ok(fields.find((field) => field.id === "audience")?.visibleWhenAny?.some((condition) => condition.equals === "wechat-studio"));
  assert.ok(fields.find((field) => field.id === "length_mode")?.visibleWhenAny?.some((condition) => condition.equals === "xiaohongshu-studio"));
});

test("traffic copy only skips topic selection when the creator explicitly asks", () => {
  assert.equal(shouldSkipTrafficTopicSelection("我想写一篇口播稿"), false);
  assert.equal(shouldSkipTrafficTopicSelection("热点标题：多地小学老师转教初中"), false);
  assert.equal(shouldSkipTrafficTopicSelection("这个题目已经定了，直接写正文"), true);
  assert.equal(shouldSkipTrafficTopicSelection("不用推荐选题，直接生成口播"), true);
  assert.equal(shouldSkipTrafficTopicSelection("重新写"), true);
  assert.equal(shouldSkipTrafficTopicSelection("重新写一版"), true);
  assert.equal(shouldSkipTrafficTopicSelection("重新生成并优化已承接社会新闻切入家庭风险账本主题的流量型口播文案"), true);
  assert.equal(shouldSkipTrafficTopicSelection("用这个写一篇口播文案\n\n【当前焦点｜必须优先承接】\n铁头一审获刑8年"), true);
  assert.equal(shouldSkipTrafficTopicSelection("用第一个帮我写一篇口播文案"), false);
  assert.equal(shouldSkipTrafficTopicSelection("第2项生成口播稿"), false);
});

test("text-led image card hides the image remix branch", () => {
  const fields = buildConversationAppFields(getCreationAppBySlug("image-card"), "把这段口播制作成知识卡片");
  assert.equal(fields.find(field => field.id === "creation_mode")?.presentation, "data");
  assert.equal(fields.find(field => field.id === "creation_mode")?.initialValue, "text_to_card");
  assert.equal(fields.some(field => field.id === "remix_instruction"), false);
  assert.equal(fields.some(field => field.id === "portrait_reference_image"), false);
  assert.deepEqual(fields.find(field => field.id === "reference_image")?.visibleWhen, [{ fieldId: "draw_portrait", equals: "yes" }]);
});

test("a fully prefilled hidden form remains submittable", () => {
  const fields = [{ id: "source", label: "素材", type: "textarea", required: true, presentation: "data", initialValue: "已从对话带入" }];
  const state = resolveConversationFormState(fields, { source: "已从对话带入" });
  assert.equal(state.eligibleFields.length, 1);
  assert.equal(state.missingFields.length, 0);
  assert.equal(state.submitDisabled, false);
  assert.equal(resolveConversationFormState(fields, { source: "已从对话带入" }, true).submitDisabled, true);
});
