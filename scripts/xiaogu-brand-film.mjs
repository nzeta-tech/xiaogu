#!/usr/bin/env node
/**
 * Xiaogu brand-film production runner.
 * All provider-specific values are environment variables so API keys and endpoints
 * never enter source control. Network calls occur only in `submit` and `poll`.
 */
import { copyFile, mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const filmDir = path.join(root, "marketing-film");
const manifestPath = path.join(filmDir, "film-manifest.json");
const rendersDir = path.join(filmDir, "renders");
const jobsPath = path.join(rendersDir, "jobs.json");
const selectionPath = path.join(rendersDir, "selection.json");
const outputDir = path.join(filmDir, "output");
const args = process.argv.slice(2);
const command = args[0];
const arg = (name) => args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const run = (bin, values) => {
  const result = spawnSync(bin, values, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${bin} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};
const readJson = async (file, fallback) => existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : fallback;
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const ensure = async (...dirs) => Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true })));
const slug = (value) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
const generationUnits = (manifest) => manifest.seedancePlan?.units?.length ? manifest.seedancePlan.units : manifest.shots;

function audioAndSubtitleInstruction(manifest, unit) {
  const dialogue = (manifest.audioDesign?.dialogue || []).filter((item) => item.unit === unit.id);
  const narration = (manifest.audioDesign?.narration || []).filter((item) => item.unit === unit.id);
  const speech = [...dialogue.map((item) => `${item.speaker}：“${item.line}”`), ...narration.map((item) => `旁白：“${item.line}”`)];
  const subtitles = [...dialogue.map((item) => item.line), ...narration.map((item) => item.line)];
  if (unit.id === "u09") subtitles.push(unit.overlay);
  return `音频、口型与字幕：直接生成自然中文普通话、与说话者同步的口型、轻环境音乐；不得使用后期配音或后期字幕。${speech.length ? `角色台词：${speech.join("；")}` : "仅保留轻环境音乐。"} 必须在画面下三分之一清晰显示完全一致的简体中文字幕，按说话时序出现：${subtitles.join(" / ")}。`;
}
const selectedUnitIds = (manifest) => (arg("shots") || generationUnits(manifest).map((unit) => unit.id).join(",")).split(",").filter(Boolean);

async function loadManifest() { return JSON.parse(await readFile(manifestPath, "utf8")); }

function apiUrl(template, taskId = "") {
  const base = (process.env.SEEDANCE_API_BASE_URL || "").replace(/\/$/, "");
  const suffix = (template || "").replace("{taskId}", encodeURIComponent(taskId));
  return `${base}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
}

function pick(object, explicitPath = "") {
  const get = (value, key) => key.split(".").reduce((current, part) => current?.[part], value);
  if (explicitPath) return get(object, explicitPath);
  for (const key of ["video_url", "videoUrl", "output.url", "data.video_url", "data.output.url", "data.url", "url"]) {
    const value = get(object, key);
    if (typeof value === "string" && /^https?:/.test(value)) return value;
  }
  return "";
}

function taskIdFrom(response) {
  for (const key of ["task_id", "taskId", "id", "data.task_id", "data.taskId", "data.id"]) {
    const value = key.split(".").reduce((current, part) => current?.[part], response);
    if (typeof value === "string" || typeof value === "number") return String(value);
  }
  return "";
}

async function preflight() {
  const manifest = await loadManifest();
  const required = ["SEEDANCE_API_BASE_URL", "SEEDANCE_API_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
  const logo = path.join(root, "public/brand/xiaogu-icon.png");
  const characterFiles = ["xiaogu-fairy.png", "broker-hero.png"].map((name) => path.join(filmDir, "assets/characters", name));
  const units = generationUnits(manifest);
  const productRefs = units.flatMap((unit) => unit.productAssets || []);
  const missingProductRefs = productRefs.filter((asset) => !existsSync(path.join(filmDir, asset)));
  console.log(`Film: ${manifest.title}`);
  console.log(`Seedance units: ${units.length}; planned duration: ${units.reduce((sum, unit) => sum + unit.duration, 0)}s; max unit: ${Math.max(...units.map((unit) => unit.duration))}s`);
  console.log(`FFmpeg: ${ffmpeg ? "ready" : "missing"}`);
  console.log(`Logo: ${existsSync(logo) ? "ready" : "missing"}`);
  console.log(`Characters: ${characterFiles.every(existsSync) ? "ready" : "not yet supplied"}`);
  console.log(`Product visuals: ${missingProductRefs.length ? `missing ${[...new Set(missingProductRefs)].join(", ")}` : `${new Set(productRefs).size} ready`}`);
  console.log(`Seedance: ${missing.length ? `configure ${missing.join(", ")} in .env` : "ready"}`);
  if (!ffmpeg) process.exitCode = 1;
}

async function prepare() {
  const manifest = await loadManifest();
  await ensure(rendersDir, outputDir, path.join(filmDir, "assets/brand"), path.join(filmDir, "assets/characters"), path.join(filmDir, "assets/product"), path.join(filmDir, "assets/product-visuals"), path.join(filmDir, "assets/audio"));
  await copyFile(path.join(root, "public/brand/xiaogu-icon.png"), path.join(filmDir, "assets/brand/xiaogu-logo.png"));
  const common = `${manifest.visualBible.style}\n角色一致性：${manifest.visualBible.fairy}\n主角一致性：${manifest.visualBible.hero}\n禁止项：${manifest.visualBible.negative}`;
  const units = generationUnits(manifest);
  const requests = units.map((unit) => ({
    shotId: unit.id, beat: unit.beat, duration: unit.duration, candidates: 4,
    prompt: `${common}\n\n本生成单元：${unit.prompt}\n\n${audioAndSubtitleInstruction(manifest, unit)}`,
    postOverlay: unit.overlay,
    references: ["assets/brand/xiaogu-logo.png", "assets/characters/xiaogu-fairy.png", "assets/characters/broker-hero.png", ...(unit.productAssets || [])]
  }));
  await writeJson(path.join(rendersDir, "seedance-requests.json"), requests);
  await writeJson(selectionPath, { note: "Replace each null value with a relative candidate video path after review.", shots: Object.fromEntries(units.map((unit) => [unit.id, null])) });
  console.log(`Prepared ${requests.length} Seedance units. No external API call was made.`);
}

async function submit() {
  if (!process.env.SEEDANCE_API_BASE_URL || !process.env.SEEDANCE_API_KEY) throw new Error("Seedance credentials are required. Set them in .env.");
  const manifest = await loadManifest();
  const wanted = new Set(selectedUnitIds(manifest));
  const units = generationUnits(manifest);
  const jobs = await readJson(jobsPath, {});
  const references = (process.env.SEEDANCE_REFERENCE_IMAGE_URLS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const productReferenceBase = (process.env.SEEDANCE_PRODUCT_REFERENCE_BASE_URL || "").replace(/\/$/, "");
  if (!references.length) throw new Error("Set SEEDANCE_REFERENCE_IMAGE_URLS to publicly reachable logo, fairy, and hero image URLs before submitting.");
  for (const shot of units.filter((item) => wanted.has(item.id))) {
    for (let candidate = 1; candidate <= Number(process.env.SEEDANCE_CANDIDATES_PER_SHOT || 4); candidate += 1) {
      const key = `${shot.id}-c${candidate}`;
      if (jobs[key]) { console.log(`Skip ${key}: already submitted.`); continue; }
      const productReferences = productReferenceBase ? (shot.productAssets || []).map((asset) => `${productReferenceBase}/${asset.replace(/^assets\//, "")}`) : [];
      const body = { model: process.env.SEEDANCE_MODEL || "seedance-2.0", prompt: `${manifest.visualBible.style}\n${manifest.visualBible.fairy}\n${manifest.visualBible.hero}\n禁止：${manifest.visualBible.negative}\n\n${shot.prompt}\n\n${audioAndSubtitleInstruction(manifest, shot)}`, duration: shot.duration, aspect_ratio: manifest.format.aspectRatio, reference_images: [...references, ...productReferences], metadata: { project: "xiaogu-brand-film", shotId: shot.id, candidate } };
      const response = await fetch(apiUrl(process.env.SEEDANCE_SUBMIT_PATH || "/v1/video/tasks"), { method: "POST", headers: { Authorization: `Bearer ${process.env.SEEDANCE_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Seedance submit ${key}: ${response.status} ${JSON.stringify(json)}`);
      const taskId = taskIdFrom(json);
      if (!taskId) throw new Error(`Seedance response for ${key} has no task id. Adjust the adapter fields. Response: ${JSON.stringify(json)}`);
      jobs[key] = { shotId: shot.id, candidate, taskId, status: "submitted", submittedAt: new Date().toISOString(), response: json };
      await writeJson(jobsPath, jobs);
      console.log(`Submitted ${key}: ${taskId}`);
    }
  }
}

async function poll() {
  if (!process.env.SEEDANCE_API_BASE_URL || !process.env.SEEDANCE_API_KEY) throw new Error("Seedance credentials are required.");
  const jobs = await readJson(jobsPath, {});
  await ensure(path.join(rendersDir, "clips"));
  for (const [key, job] of Object.entries(jobs)) {
    if (job.status === "completed" || job.status === "failed") continue;
    const response = await fetch(apiUrl(process.env.SEEDANCE_STATUS_PATH || "/v1/video/tasks/{taskId}", job.taskId), { headers: { Authorization: `Bearer ${process.env.SEEDANCE_API_KEY}` } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Seedance poll ${key}: ${response.status} ${JSON.stringify(json)}`);
    const state = String(json.status || json.data?.status || "pending").toLowerCase();
    const videoUrl = pick(json, process.env.SEEDANCE_VIDEO_URL_PATH);
    job.status = /fail|error|cancel/.test(state) ? "failed" : videoUrl ? "completed" : state;
    job.lastResponse = json; job.updatedAt = new Date().toISOString();
    if (videoUrl) {
      const destination = path.join(rendersDir, "clips", `${slug(key)}.mp4`);
      const video = await fetch(videoUrl);
      if (!video.ok) throw new Error(`Download ${key}: ${video.status}`);
      await writeFile(destination, Buffer.from(await video.arrayBuffer()));
      job.file = path.relative(root, destination);
      job.technical = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", destination]));
    }
    await writeJson(jobsPath, jobs);
    console.log(`${key}: ${job.status}`);
  }
}

async function contacts() {
  const jobs = await readJson(jobsPath, {});
  const cards = Object.entries(jobs).map(([key, job]) => `<article><h2>${key} · ${job.status}</h2>${job.file ? `<video controls preload="metadata" src="../${job.file.replace(/^marketing-film\//, "")}"></video>` : "<p>Not downloaded yet.</p>"}<pre>${job.technical ? JSON.stringify(job.technical, null, 2) : ""}</pre></article>`).join("\n");
  const html = `<!doctype html><meta charset="utf-8"><title>小谷 AI 候选镜头</title><style>body{font:15px system-ui;margin:32px;background:#f5fbfa;color:#123}article{background:#fff;padding:16px;margin:16px 0;border-radius:12px}video{width:min(720px,100%)}pre{white-space:pre-wrap;color:#567}</style><h1>小谷 AI《你说的每一句，都值得被听见》候选镜头</h1><p>选定镜头后，在 selection.json 填入对应视频路径，再运行 assemble。</p>${cards}`;
  await writeFile(path.join(rendersDir, "contact-sheet.html"), html);
  console.log(`Wrote ${path.join(rendersDir, "contact-sheet.html")}`);
}

async function assemble() {
  const manifest = await loadManifest();
  const selection = await readJson(selectionPath, null);
  if (!selection?.shots) throw new Error("Run prepare first, then fill selection.json.");
  const selected = generationUnits(manifest).map((shot) => ({ ...shot, file: selection.shots[shot.id] })).filter((shot) => shot.file);
  if (!selected.length) throw new Error("No clips selected. Fill marketing-film/renders/selection.json first.");
  await ensure(outputDir, path.join(rendersDir, "normalized"));
  const font = process.env.XIAOGU_FILM_FONT || "/System/Library/Fonts/Hiragino Sans GB.ttc";
  const normalized = [];
  for (const shot of selected) {
    const source = path.resolve(root, shot.file);
    const target = path.join(rendersDir, "normalized", `${shot.id}.mp4`);
    const text = shot.overlay.replace(/'/g, "’").replace(/:/g, "\\:").replace(/\n/g, "\\n");
    const filter = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,drawtext=fontfile=${font}:text='${text}':fontcolor=white:fontsize=36:line_spacing=12:x=(w-text_w)/2:y=h-150:box=1:boxcolor=0x002f2a99:boxborderw=20`;
    run("ffmpeg", ["-y", "-i", source, "-t", String(shot.duration), "-vf", filter, "-r", "25", "-pix_fmt", "yuv420p", "-an", target]);
    normalized.push(target);
  }
  const concat = path.join(rendersDir, "concat.txt");
  await writeFile(concat, normalized.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"));
  const output = path.join(outputDir, "xiaogu-brand-film-draft-16x9.mp4");
  run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", output]);
  console.log(`Draft assembled: ${output}`);
}

const commands = { preflight, prepare, submit, poll, contacts, assemble };
if (!commands[command]) {
  console.error("Usage: node --env-file=.env scripts/xiaogu-brand-film.mjs <preflight|prepare|submit|poll|contacts|assemble> [--shots=s01,s02]");
  process.exit(1);
}
commands[command]().catch((error) => { console.error(`\n${error.message}`); process.exit(1); });
