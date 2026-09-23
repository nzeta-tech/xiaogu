const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export function isTransientVideoLookupError(error) {
  return /timeout|timed out|TLS handshake|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|socket hang up|\b429\b|\b50[234]\b/i.test(`${error?.message || error} ${error?.stderr || ""}`);
}

// Only retry reads. Never repeat a paid video submission after a network error.
export async function pollHeygenVideo(videoId, lookup, { sleep = wait, maxAttempts = 240, maxConsecutiveErrors = 6 } = {}) {
  let errors = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let current;
    try {
      current = await lookup();
      errors = 0;
    } catch (error) {
      if (!isTransientVideoLookupError(error)) throw error;
      if (++errors >= maxConsecutiveErrors) throw new Error("口播生成状态暂时无法查询，远端任务已保留，可恢复处理", { cause: error });
      await sleep(Math.min(5000 * 2 ** (errors - 1), 30000));
      continue;
    }
    if (current.status === "completed") return { videoId, videoUrl: current.video_url || current.url || "", subtitleUrl: current.subtitle_url || "", thumbnailUrl: current.thumbnail_url || "", duration: Number(current.duration) || 0 };
    if (current.status === "failed") throw new Error(current.failure_message || current.error?.message || "HeyGen 合成失败");
    await sleep(5000);
  }
  throw new Error("HeyGen 合成等待超时；远端任务 ID 已保存，可在后台核查");
}
