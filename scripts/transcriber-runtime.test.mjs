import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("transcriber pins the PyAV API expected by faster-whisper", async () => {
  const requirements = await readFile(
    new URL("../docker/transcriber/requirements.txt", import.meta.url),
    "utf8",
  );
  assert.match(requirements, /^faster-whisper==1\.2\.1$/m);
  assert.match(requirements, /^av==15\.1\.0$/m);
});
