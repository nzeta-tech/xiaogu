const MAX_EXTRACTED_KNOWLEDGE_CHARS = 6000;

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
