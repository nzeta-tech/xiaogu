import type {
  QuestionnaireAnswers,
  QuestionnaireQuestion,
  QuestionnaireTemplate,
} from "./questionnaire-template";

export type ThinkingProfileSnapshot = {
  identity_profile: {
    display_name: string;
    core_identity: string[];
    life_roles: string[];
    career_path: string;
    honors: string[];
    turning_points: string[];
  };
  audience_profile: {
    primary_audience: string;
    secondary_audience: string;
    client_pains: string[];
    common_questions: string[];
    buying_motivations: string[];
  };
  trust_signals: {
    trust_reasons: string[];
    client_quotes: string[];
    personal_story_anchor: string;
    case_signals: string[];
  };
  belief_system: {
    believes: string[];
    disbelieves: string[];
    decision_style: string;
    fears_and_drives: string[];
  };
  expression_style: {
    tone: string[];
    style_summary: string;
    content_preferences: string[];
    time_budget: string;
  };
  content_motifs: {
    pillar_topics: string[];
    repeatable_angles: string[];
    taboo_angles: string[];
  };
  evidence_map: Record<string, string[]>;
};

export type ThinkingProfileSummary = {
  one_liner: string;
  positioning_hint: string;
  audience_hint: string;
  style_hint: string;
};

export function buildThinkingProfileSnapshot(
  answers: QuestionnaireAnswers,
  template: QuestionnaireTemplate,
): {
  snapshot: ThinkingProfileSnapshot;
  summary: ThinkingProfileSummary;
} {
  const valueByQuestion = createQuestionValueMap(answers, template);
  const personal = template.structure.sections[0];
  const content = template.structure.sections[1];
  const audience = template.structure.sections[2];
  const beliefs = template.structure.sections[3];
  const deep = template.structure.sections[4];

  const displayName = getQuestionText(valueByQuestion, personal?.questions[0]);
  const honors = splitAnswerToList(getQuestionText(valueByQuestion, personal?.questions[3]));
  const tags = splitAnswerToList(getQuestionText(valueByQuestion, personal?.questions[4]));
  const careerPath = getQuestionText(valueByQuestion, personal?.questions[5]);
  const contentStatus = getQuestionText(valueByQuestion, content?.questions[0]);
  const socialSamples = compactList([
    getQuestionText(valueByQuestion, content?.questions[1]),
    getQuestionText(valueByQuestion, content?.questions[2]),
    getQuestionText(valueByQuestion, content?.questions[3]),
  ]);
  const timeBudget = getQuestionText(valueByQuestion, content?.questions[4]);
  const earnings = getQuestionText(valueByQuestion, audience?.questions[0]);
  const currentAudience = getQuestionText(valueByQuestion, audience?.questions[1]);
  const clientQuotes = splitAnswerToList(getQuestionText(valueByQuestion, audience?.questions[2]));
  const commonQuestions = splitAnswerToList(getQuestionText(valueByQuestion, audience?.questions[3]));
  const believes = splitAnswerToList(getQuestionText(valueByQuestion, beliefs?.questions[0]));
  const disbelieves = splitAnswerToList(getQuestionText(valueByQuestion, beliefs?.questions[1]));
  const turningPoints = splitAnswerToList(getQuestionText(valueByQuestion, deep?.questions[0]));
  const fearsAndDrives = compactList([
    getQuestionText(valueByQuestion, deep?.questions[1]),
    getQuestionText(valueByQuestion, deep?.questions[2]),
  ]);
  const failureView = getQuestionText(valueByQuestion, deep?.questions[3]);
  const decisionStyle = getQuestionText(valueByQuestion, deep?.questions[4]);
  const closePeopleFeedback = splitAnswerToList(getQuestionText(valueByQuestion, deep?.questions[5]));
  const memorableMoment = getQuestionText(valueByQuestion, deep?.questions[6]);
  const clientStories = splitAnswerToList(getQuestionText(valueByQuestion, deep?.questions[7]));

  const personalStoryAnchor =
    turningPoints[0] || clientStories[0] || failureView || memorableMoment || careerPath;
  const trustReasons = compactList([
    tags.join(" · "),
    honors.join(" · "),
    clientQuotes[0],
    personalStoryAnchor,
  ]);
  const pains = deriveClientPains(currentAudience, commonQuestions, clientQuotes, earnings);
  const buyingMotivations = deriveBuyingMotivations(clientQuotes, commonQuestions, believes);
  const tone = deriveTone(tags, believes, disbelieves, closePeopleFeedback);
  const contentPreferences = deriveContentPreferences(contentStatus, socialSamples, timeBudget, commonQuestions);
  const pillarTopics = derivePillarTopics(currentAudience, commonQuestions, believes, earnings);
  const repeatableAngles = deriveRepeatableAngles(clientStories, personalStoryAnchor, commonQuestions, failureView);
  const tabooAngles = deriveTabooAngles(disbelieves);

  const snapshot: ThinkingProfileSnapshot = {
    identity_profile: {
      display_name: displayName,
      core_identity: compactList([displayName, ...tags.slice(0, 6)]),
      life_roles: tags.filter((item) => /妈妈|宝妈|爸爸|父亲|母亲|创业|博士|老师|医生|企业主/.test(item)),
      career_path: careerPath,
      honors,
      turning_points: compactList(turningPoints),
    },
    audience_profile: {
      primary_audience: currentAudience.split("\n")[0]?.trim() ?? currentAudience,
      secondary_audience: currentAudience.split("\n").slice(1).join(" ").trim(),
      client_pains: pains,
      common_questions: commonQuestions,
      buying_motivations: buyingMotivations,
    },
    trust_signals: {
      trust_reasons: trustReasons,
      client_quotes: clientQuotes,
      personal_story_anchor: personalStoryAnchor,
      case_signals: compactList(clientStories),
    },
    belief_system: {
      believes,
      disbelieves,
      decision_style: decisionStyle,
      fears_and_drives: compactList([...fearsAndDrives, failureView]),
    },
    expression_style: {
      tone,
      style_summary: compactList([contentStatus, socialSamples[0], memorableMoment]).join(" "),
      content_preferences: contentPreferences,
      time_budget: timeBudget,
    },
    content_motifs: {
      pillar_topics: pillarTopics,
      repeatable_angles: repeatableAngles,
      taboo_angles: tabooAngles,
    },
    evidence_map: {
      identity_profile: compactList([displayName, careerPath, honors.join("；"), tags.join("；")]),
      audience_profile: compactList([currentAudience, earnings, commonQuestions.join("；")]),
      trust_signals: compactList([clientQuotes.join("；"), personalStoryAnchor, clientStories.join("；")]),
      belief_system: compactList([believes.join("；"), disbelieves.join("；"), decisionStyle, failureView]),
      expression_style: compactList([contentStatus, socialSamples.join("；"), timeBudget, memorableMoment]),
      content_motifs: compactList([pillarTopics.join("；"), repeatableAngles.join("；")]),
    },
  };

  const summary: ThinkingProfileSummary = {
    one_liner: compactList([displayName, tags.slice(0, 2).join("·"), pillarTopics[0]]).join(" · ").slice(0, 120),
    positioning_hint: compactList([trustReasons[0], believes[0], personalStoryAnchor]).join(" ").slice(0, 220),
    audience_hint: compactList([snapshot.audience_profile.primary_audience, pains.slice(0, 2).join("；")]).join(" | ").slice(0, 220),
    style_hint: compactList([tone.slice(0, 4).join(" · "), timeBudget]).join(" | ").slice(0, 160),
  };

  return { snapshot, summary };
}

export function formatThinkingProfileSnapshotForPrompt(snapshot: ThinkingProfileSnapshot, summary?: ThinkingProfileSummary) {
  const lines = [
    "【长期思维画像摘要】",
  ];

  if (summary) {
    lines.push(`- 总结：${summary.one_liner}`);
    lines.push(`- 定位提示：${summary.positioning_hint}`);
    lines.push(`- 客群提示：${summary.audience_hint}`);
    lines.push(`- 风格提示：${summary.style_hint}`);
  }

  lines.push("【身份与经历】");
  lines.push(`- 昵称/称呼：${snapshot.identity_profile.display_name || "未提供"}`);
  lines.push(`- 核心身份：${snapshot.identity_profile.core_identity.join("；") || "未提供"}`);
  lines.push(`- 人生角色：${snapshot.identity_profile.life_roles.join("；") || "未提供"}`);
  lines.push(`- 职业路径：${snapshot.identity_profile.career_path || "未提供"}`);
  lines.push(`- 荣誉资历：${snapshot.identity_profile.honors.join("；") || "未提供"}`);
  lines.push(`- 关键转折：${snapshot.identity_profile.turning_points.join("；") || "未提供"}`);

  lines.push("【客户与信任】");
  lines.push(`- 核心客群：${snapshot.audience_profile.primary_audience || "未提供"}`);
  lines.push(`- 次级客群：${snapshot.audience_profile.secondary_audience || "未提供"}`);
  lines.push(`- 客户痛点：${snapshot.audience_profile.client_pains.join("；") || "未提供"}`);
  lines.push(`- 常见问题：${snapshot.audience_profile.common_questions.join("；") || "未提供"}`);
  lines.push(`- 信任理由：${snapshot.trust_signals.trust_reasons.join("；") || "未提供"}`);
  lines.push(`- 评价原话：${snapshot.trust_signals.client_quotes.join("；") || "未提供"}`);
  lines.push(`- 故事锚点：${snapshot.trust_signals.personal_story_anchor || "未提供"}`);
  lines.push(`- 代表案例：${snapshot.trust_signals.case_signals.join("；") || "未提供"}`);

  lines.push("【信念与表达】");
  lines.push(`- 越来越相信：${snapshot.belief_system.believes.join("；") || "未提供"}`);
  lines.push(`- 越来越不信：${snapshot.belief_system.disbelieves.join("；") || "未提供"}`);
  lines.push(`- 决策方式：${snapshot.belief_system.decision_style || "未提供"}`);
  lines.push(`- 恐惧与驱动：${snapshot.belief_system.fears_and_drives.join("；") || "未提供"}`);
  lines.push(`- 语气风格：${snapshot.expression_style.tone.join("；") || "未提供"}`);
  lines.push(`- 表达总结：${snapshot.expression_style.style_summary || "未提供"}`);
  lines.push(`- 内容偏好：${snapshot.expression_style.content_preferences.join("；") || "未提供"}`);
  lines.push(`- 可投入时间：${snapshot.expression_style.time_budget || "未提供"}`);

  lines.push("【内容母题】");
  lines.push(`- 适合长期讲的主题：${snapshot.content_motifs.pillar_topics.join("；") || "未提供"}`);
  lines.push(`- 可反复使用的切角：${snapshot.content_motifs.repeatable_angles.join("；") || "未提供"}`);
  lines.push(`- 不宜强化的角度：${snapshot.content_motifs.taboo_angles.join("；") || "未提供"}`);

  return lines.join("\n");
}

export function buildThinkingProfileBrief(snapshot: ThinkingProfileSnapshot, summary?: ThinkingProfileSummary) {
  return {
    persona:
      summary?.positioning_hint ||
      compactList([
        snapshot.identity_profile.core_identity.slice(0, 4).join(" · "),
        snapshot.trust_signals.personal_story_anchor,
      ]).join(" "),
    targetAudience:
      compactList([
        snapshot.audience_profile.primary_audience,
        snapshot.audience_profile.secondary_audience,
      ]).join("；") || "",
    specialty:
      uniqueStrings([
        ...snapshot.content_motifs.pillar_topics,
        ...snapshot.audience_profile.common_questions,
      ], 6).join("；"),
    topicPreference:
      uniqueStrings([
        ...snapshot.expression_style.tone,
        ...snapshot.content_motifs.repeatable_angles,
      ], 6).join("；"),
  };
}

export function extractTopicPreferenceFromSnapshot(snapshot: ThinkingProfileSnapshot) {
  return uniqueStrings([
    ...snapshot.content_motifs.pillar_topics,
    ...snapshot.content_motifs.repeatable_angles,
    ...snapshot.expression_style.content_preferences,
    ...snapshot.audience_profile.client_pains,
  ], 12).join("；");
}

function createQuestionValueMap(answers: QuestionnaireAnswers, template: QuestionnaireTemplate) {
  const output = new Map<string, string>();
  template.structure.sections.forEach((section) => {
    section.questions.forEach((question) => {
      const value = answers[section.section_id]?.[question.question_id]?.items?.[0]?.content?.trim() ?? "";
      output.set(question.question_id, value);
    });
  });
  return output;
}

function getQuestionText(map: Map<string, string>, question?: QuestionnaireQuestion) {
  if (!question) return "";
  return map.get(question.question_id) ?? "";
}

function splitAnswerToList(value: string) {
  return value
    .split(/\n|；|;|，|,|、/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function compactList(values: Array<string | undefined | null>) {
  return values.map((item) => item?.trim() ?? "").filter(Boolean);
}

function deriveClientPains(currentAudience: string, commonQuestions: string[], clientQuotes: string[], earnings: string) {
  const inferred: string[] = [];
  if (currentAudience) inferred.push(currentAudience);
  inferred.push(...commonQuestions.slice(0, 3));
  inferred.push(...clientQuotes.filter((item) => /担心|焦虑|不懂|犹豫|害怕|买错|踩坑/.test(item)).slice(0, 2));
  if (earnings) inferred.push(earnings);
  return uniqueStrings(inferred, 6);
}

function deriveBuyingMotivations(clientQuotes: string[], commonQuestions: string[], believes: string[]) {
  return uniqueStrings([
    ...clientQuotes.filter((item) => /信任|听懂|安心|靠谱|清楚/.test(item)),
    ...commonQuestions.filter((item) => /怎么买|怎么配|值不值|适不适合|有没有必要/.test(item)),
    ...believes.filter((item) => /长期|底线|判断|框架|验证/.test(item)),
  ], 6);
}

function deriveTone(tags: string[], believes: string[], disbelieves: string[], feedback: string[]) {
  return uniqueStrings([
    ...tags.filter((item) => /理性|专业|克制|直接|温柔|锋利|细心|真诚/.test(item)),
    ...believes.filter((item) => /理性|长期|验证|透明|专业/.test(item)),
    ...disbelieves.filter((item) => /焦虑|夸大|忽悠/.test(item)).map((item) => `反对${item}`),
    ...feedback.filter((item) => /较真|理性|认真|直接/.test(item)),
  ], 8);
}

function deriveContentPreferences(contentStatus: string, socialSamples: string[], timeBudget: string, commonQuestions: string[]) {
  return uniqueStrings([
    contentStatus,
    ...socialSamples,
    timeBudget ? `适合${timeBudget}节奏的内容编排` : "",
    ...commonQuestions.slice(0, 2).map((item) => `围绕“${item}”展开拆解`),
  ], 8);
}

function derivePillarTopics(currentAudience: string, commonQuestions: string[], believes: string[], earnings: string) {
  return uniqueStrings([
    ...commonQuestions.slice(0, 3),
    ...believes.filter((item) => /保险|客户|家庭|专业|态度|人生态度/.test(item)),
    currentAudience ? `围绕${currentAudience}做风险与决策拆解` : "",
    earnings ? `围绕${earnings}延伸服务优势` : "",
  ], 8);
}

function deriveRepeatableAngles(clientStories: string[], storyAnchor: string, commonQuestions: string[], failureView: string) {
  return uniqueStrings([
    storyAnchor ? `从“${trimForLabel(storyAnchor)}”切入建立信任` : "",
    ...clientStories.slice(0, 2).map((item) => `案例复盘：${trimForLabel(item)}`),
    ...commonQuestions.slice(0, 2).map((item) => `问题拆解：${trimForLabel(item)}`),
    failureView ? `踩坑反思：${trimForLabel(failureView)}` : "",
  ], 6);
}

function deriveTabooAngles(disbelieves: string[]) {
  return uniqueStrings([
    ...disbelieves.map((item) => `避免${trimForLabel(item)}`),
    "避免空泛鸡血式表达",
    "避免制造焦虑逼单",
  ], 6);
}

function uniqueStrings(values: string[], limit: number) {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    output.push(normalized);
  });
  return output.slice(0, limit);
}

function trimForLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 36);
}
