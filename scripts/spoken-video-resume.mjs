import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import {measureVideoStage} from "./spoken-video-performance.mjs";

const TTL = 24 * 60 * 60 * 1000;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function videoResumeCache(root, scope) {
  const dir = path.join(root, "resume", hash(scope));
  const checkpointFile = (stage, input) => path.join(dir, `${hash([stage, input])}.json`);
  const read = async (stage, input, validate) => {
    const file = checkpointFile(stage, input);
    try {
      const saved = JSON.parse(await readFile(file, "utf8"));
      if (saved.version === 1 && Number.isFinite(saved.savedAt) &&
          Date.now() >= saved.savedAt && Date.now() - saved.savedAt < TTL && validate(saved.value)) return { hit: true, value: saved.value };
    } catch (error) {
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    return { hit: false, value: undefined };
  };
  const write = async (stage, input, value, validate) => {
    if (!validate(value)) throw new Error(`Invalid video checkpoint: ${stage}`);
    const file = checkpointFile(stage, input);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, savedAt: Date.now(), value }), { mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await rm(temporary, { force: true });
    }
    return value;
  };
  return {
    async get(stage, input, validate) {
      const cached = await read(stage, input, validate);
      return cached.hit ? measureVideoStage(`${stage}_cache_hit`, async () => cached.value) : undefined;
    },
    put: write,
    async getOrCreate(stage, input, produce, validate) {
      const cached = await read(stage, input, validate);
      if (cached.hit) return measureVideoStage(`${stage}_cache_hit`, async () => cached.value);
      const value = await measureVideoStage(stage,produce);
      return write(stage, input, value, validate);
    },
    clear: () => rm(dir, { recursive: true, force: true }),
  };
}
