const MAX_EXTRACTED_KNOWLEDGE_CHARS = 6000;
export type ImageRemixConsistencyAudit = {
  status: "passed" | "warning" | "unavailable";
  facts: string[];
  results: Array<{ imageId: string; status: "passed" | "warning" | "unavailable"; mismatches: string[] }>;
};

/**
 * Reads the useful knowledge from a user-provided card before it is remixed.
 * The extracted text is passed to the image model so that it does not have to
 * infer dense Chinese copy while simultaneously redrawing the card.
 */
export async function extractKnowledgeFromReferenceImage(referenceImage: unknown) {
  if (typeof referenceImage !== "string" || !referenceImage.startsWith("data:image/")) return "";

  const apiKey = process.env.OPENAI_IMAGE_API_KEY ?? process.env.IMAGE_MODEL_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.MODEL_API_KEY;
  if (!apiKey) return "";

  const baseUrl = process.env.OPENAI_VISION_API_BASE ?? process.env.OPENAI_IMAGE_API_BASE ?? process.env.MODEL_API_BASE ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_VISION_MODEL ?? process.env.MODEL_NAME ?? "gpt-4o-mini";
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: "你是中文知识卡片内容校对员。只提取图片中能够确认的知识，不补写、不猜测。",
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: referenceImage } },
              { type: "text", text: "请完整转写并按层级整理图片中的主标题、所有小标题、关键结论、要点、数字、表格/流程信息和行动提示。尽量保留原文措辞与数字；看不清的内容标记为“[无法确认]”，不要省略已读到的重点。" },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) return "";
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return payload.choices?.[0]?.message?.content?.trim().slice(0, MAX_EXTRACTED_KNOWLEDGE_CHARS) ?? "";
  } catch {
    // Image remix still works with the original image if the optional OCR step is unavailable.
    return "";
  }
}

/**
 * Checks whether the text rendered in remixed images still contains the
 * non-negotiable facts read from the reference card. This is advisory: users
 * can still download the image, but get an explicit review prompt.
 */
export async function auditImageRemixConsistency(input: {
  referenceKnowledge: string;
  images: Array<{ id: string; url: string }>;
}): Promise<ImageRemixConsistencyAudit> {
  if (!input.referenceKnowledge.trim() || input.images.length === 0) {
    return { status: "unavailable", facts: [], results: [] };
  }

  const apiKey = process.env.OPENAI_IMAGE_API_KEY ?? process.env.IMAGE_MODEL_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.MODEL_API_KEY;
  if (!apiKey) return { status: "unavailable", facts: [], results: [] };
  const baseUrl = process.env.OPENAI_VISION_API_BASE ?? process.env.OPENAI_IMAGE_API_BASE ?? process.env.MODEL_API_BASE ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_VISION_MODEL ?? process.env.MODEL_NAME ?? "gpt-4o-mini";

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是中文知识卡片的内容一致性校验器。仅依据可见文字校验，不猜测或补写。" },
          {
            role: "user",
            content: [
              { type: "text", text: `原图已识别的知识如下：\n${input.referenceKnowledge}\n\n先提取其中必须保持一致的事实（产品名、数字、日期、保障范围、否定/限制表述），再逐张读取下列二创图片的文字。返回 JSON：{\"facts\":[\"…\"],\"results\":[{\"imageId\":\"…\",\"mismatches\":[\"缺失或不一致的事实：…\"]}]}. 若该图与所有事实一致，mismatches 为空数组。只列出能够确认的差异。` },
              ...input.images.map((image) => ({ type: "image_url", image_url: { url: image.url }, imageId: image.id })),
              { type: "text", text: `图片顺序及 ID：${input.images.map((image) => image.id).join("、")}。results 必须按此顺序返回对应 imageId。` },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) return { status: "unavailable", facts: [], results: [] };
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as { facts?: unknown; results?: unknown };
    const facts = Array.isArray(parsed.facts) ? parsed.facts.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
    const resultById = new Map(
      (Array.isArray(parsed.results) ? parsed.results : [])
        .filter((item): item is { imageId?: unknown; mismatches?: unknown } => Boolean(item && typeof item === "object"))
        .map((item) => [
          typeof item.imageId === "string" ? item.imageId : "",
          Array.isArray(item.mismatches) ? item.mismatches.filter((value): value is string => typeof value === "string").slice(0, 10) : [],
        ]),
    );
    const results = input.images.map((image) => {
      const mismatches = resultById.get(image.id);
      return mismatches == null
        ? { imageId: image.id, status: "unavailable" as const, mismatches: [] }
        : { imageId: image.id, status: mismatches.length ? "warning" as const : "passed" as const, mismatches };
    });
    return { status: results.some((result) => result.status === "warning") ? "warning" : results.some((result) => result.status === "passed") ? "passed" : "unavailable", facts, results };
  } catch {
    return { status: "unavailable", facts: [], results: [] };
  }
}
