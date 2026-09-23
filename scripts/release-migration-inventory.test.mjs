import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidate = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const versions = execFileSync("git", ["-C", repo, "ls-tree", "-r", "--name-only", candidate, "--", "migrations"], { encoding: "utf8" })
  .split("\n").filter((file) => /^migrations\/.+\.sql$/.test(file)).map((file) => path.basename(file));
const script = path.join(repo, "scripts/release-migration-inventory.mjs");

test("release migration inventory accepts every committed migration", () => {
  const result = spawnSync(process.execPath, [script, repo, candidate], { input: `${versions.join("\n")}\n`, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Migration inventory verified/);
});

test("release migration inventory blocks a missing committed migration", () => {
  const omitted = "066_digital_human_assets.sql";
  assert.ok(versions.includes(omitted));
  const result = spawnSync(process.execPath, [script, repo, candidate], { input: `${versions.filter((version) => version !== omitted).join("\n")}\n`, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /066_digital_human_assets\.sql/);
});

test("release migration inventory ignores uncommitted migration files", () => {
  const result = spawnSync(process.execPath, [script, repo, candidate], { input: `${versions.join("\n")}\n`, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /081_spoken_video_production/);
});
