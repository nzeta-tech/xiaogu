export class VideoStageOutputError extends Error {}

export function isRetryableVideoStageError(error) {
  if (error instanceof VideoStageOutputError || error instanceof SyntaxError) return true;
  const status = Number(error?.status);
  if ([400, 401, 403, 404, 422].includes(status)) return false;
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  if (error?.killed && error?.signal === "SIGTERM") return true;
  if (["TimeoutError", "AbortError"].includes(error?.name)) return true;
  // Do not classify verbose CLI stderr: recovered warnings may include unrelated errors.
  const message = String(error?.message || error).split("\n")[0];
  if (/\b(?:401|403)\b|unauthorized|forbidden|invalid.*(?:key|token)/i.test(message)) return false;
  return /timeout|timed out|TLS handshake|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|socket hang up|\b429\b|\b50[0234]\b/i.test(message + " " + (error?.cause?.code || error?.code || ""));
}

// Only use for repeatable reads/model stages, never provider creation or billing.
export async function retryVideoStage(work, { attempts = 2, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await work(attempt); }
    catch (error) {
      if (attempt >= attempts || !isRetryableVideoStageError(error)) throw error;
      await sleep(Math.min(1000 * 2 ** (attempt - 1), 5000));
    }
  }
}
