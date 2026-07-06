const provider = process.env.MODEL_PROVIDER ?? "openai";

const system = "你是一个服务保险经纪人的专业自媒体内容顾问。请用中文简洁回答。";
const prompt = process.env.MODEL_CHECK_PROMPT ?? "请生成一个保险经纪人视频号选题标题。";

if (provider === "google") {
  await checkGoogle();
} else {
  await checkOpenAICompatible(provider === "groq" ? getGroqConfig() : getOpenAICompatibleConfig());
}

async function checkOpenAICompatible(config) {
  if (!config.apiKey) {
    console.error("Model API key is required.");
    process.exit(1);
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`Model check failed: ${response.status}`);
    console.error(text);
    process.exit(1);
  }

  const payload = JSON.parse(text);
  console.log(payload.choices?.[0]?.message?.content ?? text);
}

async function checkGoogle() {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_API_KEY or GEMINI_API_KEY is required.");
    process.exit(1);
  }

  const baseUrl = process.env.MODEL_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta";
  const model = process.env.MODEL_NAME ?? "gemini-2.5-flash";
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    console.error(`Model check failed: ${response.status}`);
    console.error(text);
    process.exit(1);
  }

  const payload = JSON.parse(text);
  console.log(payload.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") ?? text);
}

function getGroqConfig() {
  return {
    baseUrl: process.env.MODEL_API_BASE ?? "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY ?? process.env.MODEL_API_KEY,
    model: process.env.MODEL_NAME ?? "llama-3.3-70b-versatile",
  };
}

function getOpenAICompatibleConfig() {
  return {
    baseUrl: process.env.MODEL_API_BASE ?? "https://api.openai.com/v1",
    apiKey: process.env.MODEL_API_KEY,
    model: process.env.MODEL_NAME ?? "gpt-4o-mini",
  };
}
