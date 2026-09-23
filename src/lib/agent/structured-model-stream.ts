// Structured calls still return one complete string to callers. Streaming keeps
// upstream gateways alive without exposing partial JSON as a successful result.
export async function readStructuredModelStream(response: Response): Promise<string> {
  if (!response.body) throw new Error("模型未返回结构化响应");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = "", text = "", complete = false;
  try {
    while (!complete) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") { complete = true; break; }
        const event = JSON.parse(data);
        if (event.error) throw new Error("模型结构化响应中断，请重试");
        const content = event.choices?.[0]?.delta?.content;
        if (typeof content === "string") text += content;
        if (text.length + pending.length > 1_000_000) throw new Error("模型结构化响应过长");
      }
    }
    if (!complete || !text.trim()) throw new Error("模型结构化响应不完整，请重试");
    return text;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
