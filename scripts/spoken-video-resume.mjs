import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const TTL = 24 * 60 * 60 * 1000;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function videoResumeCache(root, scope) {
  const dir = path.join(root, "resume", hash(scope));
  return {
    async getOrCreate(stage, input, produce, validate) {
      const file = path.join(dir, `${hash([stage, input])}.json`);
      try {
        const saved = JSON.parse(await readFile(file, "utf8"));
        if (saved.version === 1 && Number.isFinite(saved.savedAt) &&
            Date.now() >= saved.savedAt && Date.now() - saved.savedAt < TTL && validate(saved.value)) return saved.value;
      } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      }
      const value = await produce();
      if (!validate(value)) throw new Error(`Invalid video checkpoint: ${stage}`);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, savedAt: Date.now(), value }), { mode: 0o600 });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
      return value;
    },
    clear: () => rm(dir, { recursive: true, force: true }),
  };
}
