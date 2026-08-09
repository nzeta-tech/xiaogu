export async function transcribePublicMedia(mediaUrl: string) {
  return (await transcribePublicMediaDetailed(mediaUrl)).text;
}

export async function transcribePublicMediaDetailed(mediaUrl: string): Promise<{ text: string; error: string }> {
  const downloadTimeoutMs = Number(process.env.VIRAL_PUBLIC_MEDIA_DOWNLOAD_TIMEOUT_MS ?? 600_000);
  let bytes: ArrayBuffer;
  let contentType = "video/mp4";
  try {
    const downloaded = await downloadPublicMedia(mediaUrl, downloadTimeoutMs);
    bytes = downloaded.bytes;
    contentType = downloaded.contentType;
  } catch (error) {
    return { text: "", error: error instanceof Error && error.name === "TimeoutError" ? "视频下载超时，请稍后重试" : "视频下载服务异常" };
  }

  return transcribeWithDiagnostics(bytes, contentType);
}

async function transcribeWithDiagnostics(bytes: ArrayBuffer, contentType: string): Promise<{ text: string; error: string }> {
  const localBase = process.env.VIRAL_TRANSCRIBE_API_BASE?.trim();
  if (!localBase) return { text: "", error: "本地转写服务未配置" };
  let lastError = "口播转写服务异常";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: contentType }), "source-media.mp4");
      form.append("language", "zh");
      const response = await fetch(`${localBase.replace(/\/$/, "")}/transcribe`, {
        method: "POST", body: form,
        signal: AbortSignal.timeout(Number(process.env.VIRAL_INSPECT_TRANSCRIBE_TIMEOUT_MS ?? 1_800_000)),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
        return { text: "", error: `口播转写失败（HTTP ${response.status}${detail ? `：${detail}` : ""}）` };
      }
      const payload = await response.json() as { text?: string };
      const text = payload.text?.trim().slice(0, 12_000) ?? "";
      return text ? { text, error: "" } : { text: "", error: "未识别到可用口播内容" };
    } catch (error) {
      const detail = error instanceof Error ? error : null;
      lastError = detail?.name === "TimeoutError" ? "口播转写超时，请稍后重试" : `口播转写连接异常${detail?.message ? `：${detail.message.slice(0, 120)}` : ""}`;
      if (attempt === 0 && detail?.name !== "TimeoutError") await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  return { text: "", error: lastError };
}

async function downloadPublicMedia(mediaUrl: string, timeoutMs: number) {
  let lastError: unknown;
  // Finder's signed download endpoint occasionally has a slow first-byte
  // response. Retry once with a fresh connection before marking a work failed.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const mediaResponse = await fetch(mediaUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!mediaResponse.ok) throw new Error(`HTTP ${mediaResponse.status}`);
      const contentLength = Number(mediaResponse.headers.get("content-length") ?? 0);
      if (contentLength > 200 * 1024 * 1024) throw new Error("MEDIA_TOO_LARGE");
      const bytes = await mediaResponse.arrayBuffer();
      if (bytes.byteLength > 200 * 1024 * 1024) throw new Error("MEDIA_TOO_LARGE");
      return { bytes, contentType: mediaResponse.headers.get("content-type") ?? "video/mp4" };
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message === "MEDIA_TOO_LARGE") throw error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("MEDIA_DOWNLOAD_FAILED");
}
