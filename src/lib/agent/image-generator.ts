import { isDemoModeEnabled } from "@/lib/config/runtime";

const IMAGE_REQUEST_TIMEOUT_MS = clampDuration(process.env.IMAGE_REQUEST_TIMEOUT_MS, 240000, 60000, 300000);
const IMAGE_GENERATION_BUDGET_MS = clampDuration(process.env.IMAGE_GENERATION_BUDGET_MS, 600000, IMAGE_REQUEST_TIMEOUT_MS, 900000);
const IMAGE_REQUEST_MAX_ATTEMPTS = 2;
const IMAGE_SAFE_SIZE = "1024x1024";
const IMAGE_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export async function generateImageSet(input: {
  prompt: string;
  style: string;
  ratio: string;
  count?: number;
  referenceImages?: string[];
}) {
  const apiKey =
    process.env.OPENAI_IMAGE_API_KEY ??
    process.env.IMAGE_MODEL_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.MODEL_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const baseUrl = process.env.OPENAI_IMAGE_API_BASE ?? process.env.MODEL_API_BASE ?? "https://api.openai.com/v1";
  const desiredCount = Math.min(Math.max(input.count ?? 2, 1), 4);

  if (!apiKey) {
    if (!isDemoModeEnabled()) {
      return {
        mode: "fallback" as const,
        images: [],
        summary: "图片模型未配置，无法生成真实图片。",
        retryable: false,
      };
    }

    return {
      mode: "demo" as const,
      images: buildMockImages(input.prompt, input.style, input.ratio, desiredCount),
      summary: buildFallbackSummary(input.prompt, input.style, input.ratio, desiredCount),
    };
  }

  const images = await requestCompatibleImages({
    apiKey,
    baseUrl,
    model,
    prompt: input.prompt,
    ratio: input.ratio,
    desiredCount,
    referenceImages: input.referenceImages ?? [],
  });

  if (images.length === 0) {
    return {
      mode: "rate_limited" as const,
      images: [],
      summary: buildRateLimitedSummary(input.prompt, input.style, input.ratio, desiredCount),
      retryable: true,
    };
  }

  return {
    mode: "image" as const,
    images,
    summary: `已按 ${input.style} 风格生成 ${images.length} 张 ${input.ratio} 图片。`,
    retryable: false,
  };
}

async function requestCompatibleImages(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  ratio: string;
  desiredCount: number;
  referenceImages: string[];
}) {
  const singles: Array<{ id: string; url: string }> = [];
  const deadlineAt = Date.now() + IMAGE_GENERATION_BUDGET_MS;
  const sizeCandidates = buildPreferredSizeCandidates(input.ratio);

  for (let index = 0; index < input.desiredCount; index += 1) {
    if (Date.now() >= deadlineAt) {
      console.warn("image generation budget exhausted before completing image set", {
        desiredCount: input.desiredCount,
        generatedCount: singles.length,
        budgetMs: IMAGE_GENERATION_BUDGET_MS,
      });
      break;
    }

    const image =
      input.referenceImages.length > 0
        ? await requestSingleImageWithReferenceImages({
            endpoint: `${input.baseUrl.replace(/\/$/, "")}/images/edits`,
            apiKey: input.apiKey,
            model: input.model,
            prompt: input.prompt,
            sizeCandidates,
            deadlineAt,
            referenceImages: input.referenceImages,
          })
        : await requestSingleImageWithFallbackSizes({
            endpoint: `${input.baseUrl.replace(/\/$/, "")}/images/generations`,
            apiKey: input.apiKey,
            model: input.model,
            prompt: input.prompt,
            sizeCandidates,
            deadlineAt,
          });
    if (image) singles.push({ ...image, id: `image-${index + 1}` });
    if (image && index < input.desiredCount - 1) {
      await sleep(1500);
    }
  }
  return singles;
}

async function requestSingleImageWithReferenceImages(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  sizeCandidates: string[];
  deadlineAt: number;
  referenceImages: string[];
}) {
  const validReferences = input.referenceImages
    .filter((item) => item.startsWith("data:image/"))
    .slice(0, 4);

  if (validReferences.length === 0) {
    return null;
  }

  for (const size of input.sizeCandidates) {
    if (Date.now() >= input.deadlineAt) {
      return null;
    }
    const batch = await requestImageEditBatch({
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      size,
      deadlineAt: input.deadlineAt,
      referenceImages: validReferences,
    });
    if (batch[0]) return batch[0];
  }

  return null;
}

async function requestSingleImageWithFallbackSizes(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  sizeCandidates: string[];
  deadlineAt: number;
}) {
  for (const size of input.sizeCandidates) {
    if (Date.now() >= input.deadlineAt) {
      return null;
    }
    const batch = await requestImageBatch({
      endpoint: input.endpoint,
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      size,
      deadlineAt: input.deadlineAt,
    });
    if (batch[0]) return batch[0];
  }
  return null;
}

async function requestImageBatch(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  deadlineAt: number;
}) {
  const maxAttempts = IMAGE_REQUEST_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remainingMs = input.deadlineAt - Date.now();
    if (remainingMs <= 0) {
      console.warn("image generation request skipped because overall budget expired", {
        size: input.size,
        attempt,
        budgetMs: IMAGE_GENERATION_BUDGET_MS,
      });
      return [];
    }

    const timeoutMs = Math.min(IMAGE_REQUEST_TIMEOUT_MS, remainingMs);
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(input.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: input.model,
          prompt: input.prompt,
          size: input.size,
          quality: "low",
          output_format: "jpeg",
        }),
      });

      if (IMAGE_RETRYABLE_STATUSES.has(response.status)) {
        const message = await response.text().catch(() => "");
        console.warn(response.status === 429 ? "image generation rate limited" : "image generation request retryable failure", {
          status: response.status,
          size: input.size,
          attempt,
          message: message.slice(0, 240),
        });

        if (attempt < maxAttempts) {
          await sleep(1500 * attempt);
          continue;
        }
        return [];
      }

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        console.warn("image generation request failed", { status: response.status, size: input.size, message: message.slice(0, 240) });
        return [];
      }

      const payload = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
      return (payload.data ?? [])
        .map((item, index) => ({
          id: `image-${index + 1}`,
          url: item.url ?? (item.b64_json ? `data:image/jpeg;base64,${item.b64_json}` : ""),
        }))
        .filter((item) => item.url);
    } catch (error) {
      console.warn(timedOut ? "image generation request timed out" : "image generation request crashed", {
        size: input.size,
        attempt,
        timeoutMs,
        error,
      });

      if (attempt < maxAttempts) {
        await sleep(1500 * attempt);
        continue;
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return [];
}

async function requestImageEditBatch(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  size: string;
  deadlineAt: number;
  referenceImages: string[];
}) {
  const remainingMs = input.deadlineAt - Date.now();
  if (remainingMs <= 0) {
    return [];
  }

  const timeoutMs = Math.min(IMAGE_REQUEST_TIMEOUT_MS, remainingMs);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const form = new FormData();
    form.append("model", input.model);
    form.append("prompt", input.prompt);
    form.append("size", input.size);
    form.append("quality", "low");
    form.append("output_format", "jpeg");

    for (const [index, reference] of input.referenceImages.entries()) {
      const blob = dataUrlToBlob(reference);
      if (!blob) continue;
      form.append("image", blob, `reference-${index + 1}.${pickExtensionFromMime(blob.type)}`);
    }

    const response = await fetch(input.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      console.warn("image generation edit request failed", {
        status: response.status,
        size: input.size,
        message: message.slice(0, 240),
      });
      return [];
    }

    const payload = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    return (payload.data ?? [])
      .map((item, index) => ({
        id: `image-${index + 1}`,
        url: item.url ?? (item.b64_json ? `data:image/jpeg;base64,${item.b64_json}` : ""),
      }))
      .filter((item) => item.url);
  } catch (error) {
    console.warn(timedOut ? "image generation edit request timed out" : "image generation edit request crashed", {
      size: input.size,
      timeoutMs,
      error,
    });
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPreferredSizeCandidates(ratio: string) {
  const targetSize = normalizeRatioToSize(ratio);
  if (targetSize === IMAGE_SAFE_SIZE) {
    return [IMAGE_SAFE_SIZE];
  }
  // Cheap-llm is currently unstable for long-running image jobs.
  // Prefer a single lightweight size to avoid multi-minute fallback loops.
  return [IMAGE_SAFE_SIZE];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampDuration(rawValue: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), minimum), maximum);
}

function normalizeRatioToSize(ratio: string) {
  if (["3:4", "4:5", "2:3", "9:16"].includes(ratio)) return "1024x1536";
  if (["4:3", "5:4", "3:2", "16:9"].includes(ratio)) return "1536x1024";
  return "1024x1024";
}

function dataUrlToBlob(value: string) {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  const [, mime, body] = match;
  return new Blob([Buffer.from(body, "base64")], { type: mime });
}

function pickExtensionFromMime(mime: string) {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

function buildFallbackSummary(prompt: string, style: string, ratio: string, count: number) {
  return [
    `当前为演示模式，仅返回演示占位预览。`,
    `风格：${style}`,
    `比例：${ratio}`,
    `建议张数：${count}`,
    "",
    "图片提示词底稿：",
    prompt,
  ].join("\n");
}

function buildRateLimitedSummary(prompt: string, style: string, ratio: string, count: number) {
  return [
    `图片服务当前繁忙，本次未生成图片，请稍后重试。`,
    `风格：${style}`,
    `比例：${ratio}`,
    `建议张数：${count}`,
    "",
    "图片提示词底稿：",
    prompt,
  ].join("\n");
}

function buildMockImages(prompt: string, style: string, ratio: string, count: number) {
  const { width, height } = normalizeRatioToCanvas(ratio);
  const title = extractTitle(prompt);
  return Array.from({ length: Math.max(1, Math.min(count, 4)) }, (_, index) => ({
    id: `mock-${index + 1}`,
    url: buildMockImageDataUrl({
      width,
      height,
      style,
      ratio,
      title,
      subtitle: `结果 ${index + 1}`,
    }),
  }));
}

function normalizeRatioToCanvas(ratio: string) {
  if (["3:4", "4:5", "2:3", "9:16"].includes(ratio)) return { width: 900, height: 1200 };
  if (["4:3", "5:4", "3:2", "16:9"].includes(ratio)) return { width: 1200, height: 900 };
  return { width: 1080, height: 1080 };
}

function extractTitle(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.includes("：") && line.length <= 28) || "知识卡片";
}

function buildMockImageDataUrl(input: {
  width: number;
  height: number;
  style: string;
  ratio: string;
  title: string;
  subtitle: string;
}) {
  const theme = pickTheme(input.style);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bg1}" />
      <stop offset="100%" stop-color="${theme.bg2}" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="48" fill="url(#g)" />
  <circle cx="${input.width - 140}" cy="140" r="120" fill="${theme.blob}" fill-opacity="0.18" />
  <circle cx="160" cy="${input.height - 160}" r="150" fill="${theme.blob}" fill-opacity="0.12" />
  <rect x="72" y="72" width="${input.width - 144}" height="${input.height - 144}" rx="36" fill="rgba(255,255,255,0.74)" />
  <text x="120" y="170" fill="${theme.accent}" font-size="34" font-family="Arial, sans-serif" font-weight="700">${escapeXml(input.subtitle)}</text>
  <text x="120" y="250" fill="#1f2937" font-size="64" font-family="Arial, sans-serif" font-weight="800">${escapeXml(input.title)}</text>
  <text x="120" y="340" fill="#475569" font-size="30" font-family="Arial, sans-serif">${escapeXml(`风格 ${input.style}`)}</text>
  <text x="120" y="390" fill="#475569" font-size="30" font-family="Arial, sans-serif">${escapeXml(`比例 ${input.ratio}`)}</text>
  <text x="120" y="${input.height - 120}" fill="#64748b" font-size="26" font-family="Arial, sans-serif">演示占位预览</text>
</svg>`.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function pickTheme(style: string) {
  if (style.includes("dark") || style.includes("black")) {
    return { bg1: "#0f172a", bg2: "#1e293b", blob: "#60a5fa", accent: "#93c5fd" };
  }
  if (style.includes("zen") || style.includes("morandi")) {
    return { bg1: "#f4ede4", bg2: "#d8c8bb", blob: "#a16207", accent: "#9a3412" };
  }
  return { bg1: "#fdf2f8", bg2: "#dbeafe", blob: "#2563eb", accent: "#1d4ed8" };
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
