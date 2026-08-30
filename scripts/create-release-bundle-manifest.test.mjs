import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repoRoot, "scripts/create-release-bundle-manifest.mjs");

function run(arguments_) {
  return spawnSync(process.execPath, [script, "--descriptor", "config/release/production.json", ...arguments_], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("release bundle binds and re-verifies Git, coach snapshot, and model profile", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "xiaogu-release-bundle-"));
  const output = path.join(directory, "release-bundle.json");
  const created = run(["--output", output]);
  assert.equal(created.status, 0, created.stderr);

  const manifest = JSON.parse(await readFile(output, "utf8"));
  assert.match(manifest.releaseBundleId, /^[0-9a-f]{12}-[0-9a-f]{12}-[0-9a-f]{12}$/);
  assert.equal(manifest.creativeCoaches.coachCount, 6);
  assert.equal(manifest.modelRuntime.profileId, "xiaogu-production-text-v1");
  assert.equal(run(["--verify", output]).status, 0);

  manifest.modelRuntime.model = "tampered";
  await writeFile(output, JSON.stringify(manifest), "utf8");
  const tampered = run(["--verify", output]);
  assert.notEqual(tampered.status, 0);
  assert.match(tampered.stderr, /does not match/);
});
