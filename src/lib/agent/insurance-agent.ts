import { hasModelConfig, isDemoModeEnabled } from "@/lib/config/runtime";
import { tryGetBrokerProfile, tryGetLatestThinkingProfileSnapshot } from "@/lib/db/repositories";
import { buildThinkingProfileBrief, formatThinkingProfileSnapshotForPrompt } from "@/lib/thinking/profile-snapshot";
import { getHotTopics } from "@/lib/topics/hot-topics";

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type WritingStyleMode = "general" | "traffic" | "marketing";

export async function runInsuranceContentAgent(
  messages: AgentMessage[],
  userId?: string | null,
  styleMode: WritingStyleMode = "general",
) {
  const latest = messages.at(-1)?.content ?? "";
  const [profile, thinkingSnapshot] = userId
    ? await Promise.all([tryGetBrokerProfile(userId), tryGetLatestThinkingProfileSnapshot(userId)])
    : [null, null];

  if (hasModelConfig()) {
    return callModel(messages, profile, thinkingSnapshot, styleMode);
  }

  if (!isDemoModeEnabled()) {
    throw new Error("大模型服务未配置，生产模式不能使用模板文案");
  }

  return runDemoAgent(latest, profile, thinkingSnapshot, styleMode);
}

export async function* streamInsuranceContentAgent(
  messages: AgentMessage[],
  userId?: string | null,
  styleMode: WritingStyleMode = "traffic",
) {
  const [profile, thinkingSnapshot] = userId
    ? await Promise.all([tryGetBrokerProfile(userId), tryGetLatestThinkingProfileSnapshot(userId)])
    : [null, null];
  if (hasModelConfig()) {
    for await (const chunk of streamModel(messages, profile, thinkingSnapshot, styleMode)) {
      yield chunk;
    }
  } else {
    if (!isDemoModeEnabled()) {
      throw new Error("大模型服务未配置，生产模式不能使用模板文案");
    }
    yield await runDemoAgent(messages.at(-1)?.content ?? "", profile, thinkingSnapshot, styleMode);
  }
}

function buildSystemPrompt(
  profile: Awaited<ReturnType<typeof tryGetBrokerProfile>>,
  thinkingSnapshot: Awaited<ReturnType<typeof tryGetLatestThinkingProfileSnapshot>>,
  styleMode: WritingStyleMode,
) {
  const styleInstruction =
    styleMode === "traffic"
      ? [
          "当前任务模式：流量文案。",
          "任务：把用户输入的事件/观点改写成高传播、高代入、可直接发布的社媒文案。",
          "必须按四段结构输出：1）【开头论点】2）【主体论据】3）【结尾总结】4）【标题建议（3个）】。",
          "目标风格：不是新闻摘要，不是讲义，不是空泛鸡汤；而是有观点的趋势解读+普通人可执行启发。",
          "默认总长度：520-680字（除非用户明确要求短版或长版）。开头70-110字；主体240-360字；结尾100-160字；标题区70-100字。",
          "每段至少包含1个推进动作（反问/反转/结论句/代入句），禁止连续2句纯解释句。",
          "开头写法：第一句必须反常识或冲突钩子（如“你以为A，其实B”“谁能想到...竟然...”）；必须点名用户输入中的核心实体，不得抽象开场；开头2-3句完成钩子与立场。",
          "主体写法：先事实再逻辑，用“旧路径受限 -> 需求不消失 -> 新承接方式出现 -> 决策变化”的迁移链推进。",
          "主体至少包含：1句“为什么”反问；1句“说白了/本质上”结论；1句普通人代入场景。",
          "结尾写法：从事件回到家庭风险与现金流安全感（医疗、重疾、养老、负债、收入中断），最后必须有明确互动动作（评论区提问或私信关键词）。",
          "标题规则：必须给3个；每个23-30字；每个至少包含一个冲突词或结果词（真相、变天、代价、底牌、避风港、机会、警醒）。",
          "表达可以有情绪张力，但不得编造事实，不得把猜测写成确定结论，不得承诺收益或理赔。",
          "避免套话：不要写成“我们要关注/值得思考/需要重视”这类空泛总结。",
        ].join("\n")
      : styleMode === "marketing"
        ? [
          "当前任务模式：营销文案。",
          "任务：把客户画像、产品规则、投保难点改写成专业、可信、可转化的社交媒体内容。",
          "默认输出4篇，结构固定：第一篇【讲产品】、第二篇【讲方案】、第三篇【讲案例】、第四篇【讲观念】。",
          "每篇必须包含：标题、正文、引导互动；四篇分工必须明显，不得重复同一套表达。",
          "每篇正文建议220-420字，避免口号化与条款堆砌。",
          "每篇至少包含1个推进动作（反问/反转/结论句/代入句），禁止连续2句纯解释句。",
          "讲产品：突出稀缺价值与核心规则亮点；讲方案：给具体人群与投入产出逻辑；讲案例：强调情境与情绪转折；讲观念：给决策框架与认知升级。",
          "正文必须自然讲清规则边界：健康告知、既往症、等待期、续保、免责，不能只给好处不讲约束。",
          "引导互动要具体可执行（评论关键词、私信关键词、测算/核对动作）。",
          "可强调风险意识与规划价值，但不得承诺一定承保、一定理赔、确定收益。",
          "语言风格：有同理心、有判断、有边界，不写硬广口号。",
        ].join("\n")
        : [
            "当前任务模式：通用保险内容顾问。",
            "根据用户问题选择合适输出：选题、脚本、标题、改写、合规检查或账号定位建议。",
          ].join("\n");

  const brief = thinkingSnapshot?.snapshot_json ? buildThinkingProfileBrief(thinkingSnapshot.snapshot_json, thinkingSnapshot.summary_json) : null;
  const profileLine = brief
    ? `当前经纪人长期思维画像：人设底色=${brief.persona || "未设置"}。目标受众=${brief.targetAudience || "未设置"}。擅长主题=${brief.specialty || "未设置"}。表达偏好=${brief.topicPreference || "未设置"}。`
    : profile
      ? `当前经纪人账号展示信息：昵称=${profile.display_name || "未设置"}。签名=${profile.ip_tagline || "未设置"}。简介=${profile.profile_summary || "未设置"}。`
      : "如果没有读取到账户人设，默认按专业理性、家庭保障和养老医疗方向输出。";

  const system = [
    "你叫小谷，是一个服务保险经纪人的专业自媒体内容顾问。",
    "你的人设是专业、有温度、克制可信：既能给到清晰可执行的内容方案，也能理解经纪人在获客、信任建立和合规表达上的压力。",
    "注意区分两层人设：小谷是对话助手的人格；最终生成的短视频文案、标题、开头钩子和评论区引导，必须贴合经纪人自己的账号人设。",
    profileLine,
    thinkingSnapshot?.snapshot_json
      ? formatThinkingProfileSnapshotForPrompt(thinkingSnapshot.snapshot_json, thinkingSnapshot.summary_json)
      : "",
    "你的任务是帮助经纪人发现热点选题、改写成保险角度、生成视频号/抖音短视频口播文案。",
    "必须遵守保险销售宣传合规要求：不得承诺收益、不得承诺理赔、不得夸大保障、不得制造恐慌逼单。",
    "表达要像可靠的专业伙伴：温和、稳妥、不过度营销，不制造焦虑。",
    "对话要自然，不要每轮都重复自我介绍或反复说“我是小谷”。",
    "最终文案不要默认写“大家好，我是……”这类自我介绍；只有用户明确要求口播开场或账号人设必须出镜时，才用一句自然开场。",
    "输出要实用：优先给正文成稿；标题、封面文案和评论区引导保持精简，除非用户要求展开。",
    "不要在回答末尾额外追加独立的“合规提示”段落；必要的风险边界要自然写进正文。",
    styleInstruction,
  ].join("\n");
  return system;
}

async function callModel(
  messages: AgentMessage[],
  profile: Awaited<ReturnType<typeof tryGetBrokerProfile>>,
  thinkingSnapshot: Awaited<ReturnType<typeof tryGetLatestThinkingProfileSnapshot>>,
  styleMode: WritingStyleMode,
) {
  const system = buildSystemPrompt(profile, thinkingSnapshot, styleMode);
  const provider = process.env.MODEL_PROVIDER ?? "openai";

  if (provider === "google") return callGoogleGemini(system, messages);
  if (provider === "groq") return callOpenAICompatible(system, messages, getGroqConfig());

  return callOpenAICompatible(system, messages, {
    baseUrl: process.env.MODEL_API_BASE ?? "https://api.openai.com/v1",
    apiKey: process.env.MODEL_API_KEY,
    model: process.env.MODEL_NAME ?? "gpt-4o-mini",
  });
}

async function* streamModel(
  messages: AgentMessage[],
  profile: Awaited<ReturnType<typeof tryGetBrokerProfile>>,
  thinkingSnapshot: Awaited<ReturnType<typeof tryGetLatestThinkingProfileSnapshot>>,
  styleMode: WritingStyleMode,
) {
  const system = buildSystemPrompt(profile, thinkingSnapshot, styleMode);
  const provider = process.env.MODEL_PROVIDER ?? "openai";

  if (provider === "google") {
    yield* streamGoogleGemini(system, messages);
    return;
  }

  const normalized = normalizeOpenAICompatibleMessages(messages);
  const config =
    provider === "groq"
      ? getGroqConfig()
      : {
          baseUrl: process.env.MODEL_API_BASE ?? "https://api.openai.com/v1",
          apiKey: process.env.MODEL_API_KEY,
          model: process.env.MODEL_NAME ?? "gpt-4o-mini",
        };
  // Keep the chat path truly streaming: no pre-generation or quality-gate buffering
  // before the first token. Style control is handled by system prompt in streaming mode.
  yield* streamOpenAICompatible(system, normalized, config);
}

function normalizeOpenAICompatibleMessages(messages: AgentMessage[]) {
  const normalized: AgentMessage[] = [];

  for (const message of messages) {
    const content = message.content?.trim();
    if (!content) continue;
    if (/^大模型服务调用失败[:：]/.test(content)) continue;

    const previous = normalized.at(-1);
    if (previous?.role === message.role) {
      previous.content = `${previous.content}\n\n${content}`;
      continue;
    }

    normalized.push({ role: message.role, content });
  }

  return normalized.slice(-16);
}

async function readModelError(response: Response) {
  try {
    const payload = (await response.clone().json()) as { error?: { message?: string }; message?: string };
    return payload.error?.message ?? payload.message ?? "";
  } catch {
    try {
      return (await response.clone().text()).slice(0, 240);
    } catch {
      return "";
    }
  }
}

function getGroqConfig() {
  return {
    baseUrl: process.env.MODEL_API_BASE ?? "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY ?? process.env.MODEL_API_KEY,
    model: process.env.MODEL_NAME ?? "llama-3.3-70b-versatile",
  };
}

async function callOpenAICompatible(
  system: string,
  messages: AgentMessage[],
  config: { baseUrl: string; apiKey?: string; model: string },
  options?: { temperature?: number },
) {
  if (!config.apiKey) throw new Error("大模型 API key 未配置");

  const requestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: options?.temperature ?? 0.6,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  } satisfies RequestInit;
  let response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, requestInit);

  if (response.status === 429 || response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, response.status === 429 ? 1600 : 900));
    response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, requestInit);
  }

  if (!response.ok) {
    const detail = await readModelError(response);
    throw new Error(`大模型服务调用失败：${response.status}${detail ? `，${detail}` : ""}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return payload.choices?.[0]?.message?.content ?? "我暂时没有生成出结果，请换一个选题再试。";
}


async function* streamOpenAICompatible(
  system: string,
  messages: AgentMessage[],
  config: { baseUrl: string; apiKey?: string; model: string },
) {
  if (!config.apiKey) throw new Error("大模型 API key 未配置");

  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.65,
      stream: true,
      messages: [{ role: "system", content: system }, ...messages.map(toOpenAIMessage)],
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await readModelError(response);
    throw new Error(`大模型服务调用失败：${response.status}${detail ? `，${detail}` : ""}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      const data = line.replace(/^data:\s*/, "").trim();
      if (data === "[DONE]") return;
      const payload = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
      const chunk = payload.choices?.[0]?.delta?.content;
      if (chunk) yield chunk;
    }
  }
}

async function callGoogleGemini(system: string, messages: AgentMessage[]) {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Google Gemini API key 未配置");

  const model = process.env.MODEL_NAME ?? "gemini-2.5-flash";
  const baseUrl = process.env.MODEL_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
  const request = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: system }],
      },
      contents: messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        temperature: 0.6,
      },
    }),
  };
  const url = `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let response = await fetch(url, request);
  if (response.status === 429 || response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 900));
    response = await fetch(url, request);
  }

  if (!response.ok) {
    throw new Error(`Google Gemini 调用失败：${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n") || "我暂时没有生成出结果，请换一个选题再试。"
  );
}

async function* streamGoogleGemini(system: string, messages: AgentMessage[]) {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Google Gemini API key 未配置");

  const model = process.env.MODEL_NAME ?? "gemini-2.5-flash";
  const baseUrl = process.env.MODEL_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
  const url = `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: system }],
      },
      contents: messages.map(toGeminiContent),
      generationConfig: {
        temperature: 0.65,
      },
    }),
  });

  if (!response.ok || !response.body) throw new Error(`Google Gemini 调用失败：${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = JSON.parse(line.replace(/^data:\s*/, "")) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const chunk = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text)
        .filter(Boolean)
        .join("");
      if (chunk) yield chunk;
    }
  }
}

async function runDemoAgent(
  input: string,
  profile: Awaited<ReturnType<typeof tryGetBrokerProfile>>,
  thinkingSnapshot: Awaited<ReturnType<typeof tryGetLatestThinkingProfileSnapshot>>,
  styleMode: WritingStyleMode = "traffic",
) {
  const topics = await getHotTopics();

  if (/热点|选题|话题|今天|热榜/.test(input)) {
    return [
      "今天可以优先看这几个保险化选题：",
      "",
      ...topics.slice(0, 5).map((topic, index) =>
        [
          `${index + 1}. ${topic.title}`,
          `保险角度：${topic.recommendedAngle}`,
          `适合人群：${topic.category}`,
          `风险边界：${topic.riskNote}`,
        ].join("\n"),
      ),
      "",
      "你可以直接回复编号，例如“写第 2 个，60 秒视频号口播”。",
    ].join("\n");
  }

  const topic = topics.find((item) => input.includes(item.title)) ?? topics[0];
  const platform = /抖音/.test(input) ? "抖音" : /小红书/.test(input) ? "小红书" : "视频号";
  const duration = /90/.test(input) ? "90 秒" : /30/.test(input) ? "30 秒" : "自然长度";

  const brief = thinkingSnapshot?.snapshot_json ? buildThinkingProfileBrief(thinkingSnapshot.snapshot_json, thinkingSnapshot.summary_json) : null;
  return [
    `下面是一版${styleMode === "traffic" ? "流量文案" : styleMode === "marketing" ? "营销文案" : ""}适合${platform}的${duration}口播稿，已按“${brief?.persona ?? profile?.display_name ?? "专业理性，擅长家庭保障和养老规划"}”的人设处理：`,
    "",
    `标题：${topic.title}背后，普通家庭真正该看懂的风险`,
    "",
    "开头钩子：",
    `最近“${topic.title}”讨论很多，但我更建议大家不要只看热闹，要看它背后的家庭风险。`,
    "",
    "正文：",
    `${topic.recommendedAngle}很多人买保险时容易先问“哪款产品好”，但真正专业的顺序应该是：先看家庭责任，再看现金流压力，再看已有保障缺口。`,
    "如果是医疗风险，要分清医保、百万医疗、重疾险各自解决的问题；如果是养老风险，要分清短期储蓄和长期现金流安排；如果是意外和财产风险，要看责任范围、免责条款和理赔条件。",
    "",
    "结尾引导：",
    "如果你也想知道自己家的保障是不是有明显缺口，可以先整理家庭成员、收入、负债和已有保单，再做一次基础体检。",
    "",
    "封面文案：",
    `${topic.title}，和保险有什么关系？`,
    "",
    "评论区引导：",
    "你更关心医疗、养老，还是家庭收入中断风险？可以打在评论区。",
  ].join("\n");
}

function toGeminiContent(message: AgentMessage) {
  return {
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  };
}

function toOpenAIMessage(message: AgentMessage) {
  return {
    role: message.role,
    content: message.content,
  };
}
