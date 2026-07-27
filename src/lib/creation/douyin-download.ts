import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const videoMarker = "__DOUYIN_VIDEO_PATH__=";
const infoMarker = "__DOUYIN_INFO__=";

export const douyinMediaDir = process.env.VIRAL_MEDIA_DIR ?? "/tmp/xiaogu-viral-media";

export async function inspectDouyinPublicMetadata(url: string) {
  const executable = process.env.DOUYIN_YT_DLP_PATH ?? "yt-dlp";
  const args = ["--no-playlist", "--skip-download", "--no-warnings", "--print", `${infoMarker}%()j`];
  if (process.env.DOUYIN_COOKIES_FROM_BROWSER) {
    args.push("--cookies-from-browser", process.env.DOUYIN_COOKIES_FROM_BROWSER);
  }
  args.push(normalizeDouyinVideoUrl(url));

  try {
    const { stdout } = await execFileAsync(executable, args, {
      timeout: Number(process.env.DOUYIN_METADATA_TIMEOUT_MS ?? 25_000),
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PATH: `${process.env.PATH ?? ""}:/usr/local/bin:/usr/bin` },
    });
    const infoText = stdout.split("\n").filter((line) => line.startsWith(infoMarker)).pop()?.slice(infoMarker.length).trim();
    if (!infoText) return null;
    const info = JSON.parse(infoText) as Record<string, unknown>;
    const timestamp = typeof info.timestamp === "number" ? new Date(info.timestamp * 1000).toISOString() : String(info.upload_date ?? "");
    return {
      title: String(info.title ?? info.description ?? "").trim(),
      authorName: String(info.channel ?? info.uploader ?? "").trim(),
      thumbnailUrl: typeof info.thumbnail === "string" ? info.thumbnail : "",
      publishedAt: timestamp,
      metricValue: typeof info.like_count === "number" ? info.like_count : undefined,
      sourceUrl: String(info.webpage_url ?? url),
    };
  } catch {
    return null;
  }
}

function normalizeDouyinVideoUrl(input: string) {
  try {
    const url = new URL(input);
    const legacyId = url.pathname.match(/^\/shipin\/(\d+)/)?.[1];
    if (legacyId) url.pathname = `/video/${legacyId}`;
    return url.toString();
  } catch {
    return input;
  }
}

export async function transcribeDownloadedDouyin(videoFile: string) {
  const target = path.join(path.resolve(douyinMediaDir), path.basename(videoFile));
  try {
    const info = await stat(target);
    if (!info.isFile() || info.size > 100 * 1024 * 1024) return "";
    const form = new FormData();
    form.append("file", new Blob([await readFile(target)], { type: "video/mp4" }), path.basename(target));
    form.append("language", "zh");
    const localBase = process.env.VIRAL_TRANSCRIBE_API_BASE?.trim();
    if (localBase) {
      const localResponse = await fetch(`${localBase.replace(/\/$/, "")}/transcribe`, {
        method: "POST", body: form,
        signal: AbortSignal.timeout(Number(process.env.VIRAL_INSPECT_TRANSCRIBE_TIMEOUT_MS ?? 240000)),
      });
      if (localResponse.ok) {
        const payload = await localResponse.json() as { text?: string };
        return payload.text?.trim().slice(0, 12000) ?? "";
      }
    }
    return "";
  } catch {
    return "";
  }
}

export async function downloadDouyinPublic(url: string) {
  const outputDir = path.resolve(douyinMediaDir);
  await mkdir(outputDir, { recursive: true });
  const executable = process.env.DOUYIN_YT_DLP_PATH ?? "yt-dlp";
  const args = [
    "--no-playlist", "--continue", "--no-overwrites",
    "--format", "bv*+ba/b", "--merge-output-format", "mp4",
    "--paths", outputDir,
    "--output", "%(id)s.%(ext)s",
    "--print", `after_move:${videoMarker}%(filepath)s`,
    "--print", `after_move:${infoMarker}%()j`,
  ];
  if (process.env.DOUYIN_COOKIES_FROM_BROWSER) {
    args.push("--cookies-from-browser", process.env.DOUYIN_COOKIES_FROM_BROWSER);
  }
  args.push(url);

  let stdout = "";
  try {
    const result = await execFileAsync(executable, args, {
      timeout: Number(process.env.DOUYIN_DOWNLOAD_TIMEOUT_MS ?? 90000),
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PATH: `${process.env.PATH ?? ""}:/usr/local/bin:/usr/bin` },
    });
    stdout = result.stdout;
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string; code?: string | number };
    const message = `${detail.stderr ?? ""}\n${detail.stdout ?? ""}`.trim();
    if (/fresh cookies|cookies are needed|login required/i.test(message)) throw new Error("抖音作品需要登录 Cookie，当前服务无法读取浏览器登录状态。");
    if (/429|too many requests|rate limit/i.test(message)) throw new Error("抖音来源暂时限流，请稍后重试。");
    if (detail.code === "ENOENT") throw new Error("服务端未安装 yt-dlp。");
    throw new Error(message.slice(-500) || "抖音作品下载失败。");
  }

  const videoPath = stdout.split("\n").filter((line) => line.startsWith(videoMarker)).pop()?.slice(videoMarker.length).trim();
  const infoText = stdout.split("\n").filter((line) => line.startsWith(infoMarker)).pop()?.slice(infoMarker.length).trim();
  if (!videoPath || !infoText) throw new Error("下载完成但没有返回标准作品信息。");
  const info = JSON.parse(infoText) as Record<string, unknown>;
  const resolvedVideoPath = path.resolve(videoPath);
  const resolvedOutputDir = `${path.resolve(outputDir)}${path.sep}`;
  if (!resolvedVideoPath.startsWith(resolvedOutputDir)) throw new Error("下载结果路径校验失败。");
  const videoFile = path.basename(resolvedVideoPath);
  const id = String(info.id ?? "");
  if (!id || !/^\d+$/.test(id)) throw new Error("下载结果校验失败。");

  let thumbnailFile = "";
  const thumbnail = typeof info.thumbnail === "string" ? info.thumbnail : "";
  if (thumbnail.startsWith("https://")) {
    try {
      const response = await fetch(thumbnail, { signal: AbortSignal.timeout(12000) });
      const bytes = await response.arrayBuffer();
      if (response.ok && bytes.byteLength > 0 && bytes.byteLength <= 5 * 1024 * 1024) {
        thumbnailFile = `${id}.jpg`;
        await writeFile(path.join(outputDir, thumbnailFile), Buffer.from(bytes));
      }
    } catch {
      thumbnailFile = "";
    }
  }
  return {
    id,
    title: String(info.title ?? info.description ?? "").trim(),
    author: String(info.channel ?? info.uploader ?? "").trim(),
    publishedAt: typeof info.timestamp === "number" ? new Date(info.timestamp * 1000).toISOString() : String(info.upload_date ?? ""),
    likeCount: typeof info.like_count === "number" ? String(info.like_count) : "",
    sourceUrl: String(info.webpage_url ?? url),
    videoFile,
    thumbnailFile,
    durationSeconds: typeof info.duration === "number" ? info.duration : undefined,
  };
}
