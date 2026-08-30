#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const descriptorArgument = option("--descriptor", "config/release/production.json");
const outputArgument = option("--output");
const expectedSha = option("--git-sha");
const verifyArgument = option("--verify");
const repoRoot = process.cwd();

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.resolve(repoRoot, relativePath), "utf8"));
}

async function fileIdentity(relativePath) {
  const bytes = await readFile(path.resolve(repoRoot, relativePath));
  return { path: relativePath, sha256: sha256(bytes), bytes: bytes.length };
}

const descriptor = await readJson(descriptorArgument);
if (descriptor.schemaVersion !== 1 || !descriptor.releaseProfileId) throw new Error("Unsupported release descriptor");
for (const key of ["creativeCoachSnapshot", "modelRuntimeProfile"]) {
  if (!descriptor[key] || path.isAbsolute(descriptor[key]) || descriptor[key].includes("..")) {
    throw new Error(`Unsafe or missing ${key} path`);
  }
}

const coachSnapshot = await readJson(descriptor.creativeCoachSnapshot);
const coachPayloadHash = sha256(JSON.stringify(coachSnapshot.coaches));
if (coachSnapshot.schemaVersion !== 1 || !Array.isArray(coachSnapshot.coaches) || coachSnapshot.coaches.length === 0 || coachPayloadHash !== coachSnapshot.sha256) {
  throw new Error("Creative-coach snapshot is empty, unsupported, or corrupt");
}

const modelProfile = await readJson(descriptor.modelRuntimeProfile);
if (modelProfile.schemaVersion !== 1 || !modelProfile.profileId || !modelProfile.environment?.MODEL_PROVIDER || !modelProfile.environment?.MODEL_NAME || !modelProfile.environment?.MODEL_API_BASE) {
  throw new Error("Model-runtime profile is incomplete or unsupported");
}

const fullGitSha = git("rev-parse", "HEAD");
if (expectedSha && !fullGitSha.startsWith(expectedSha)) throw new Error(`Git SHA mismatch: expected ${expectedSha}, got ${fullGitSha}`);

const files = {
  descriptor: await fileIdentity(descriptorArgument),
  creativeCoachSnapshot: await fileIdentity(descriptor.creativeCoachSnapshot),
  modelRuntimeProfile: await fileIdentity(descriptor.modelRuntimeProfile),
};
const releaseBundleId = `${fullGitSha.slice(0, 12)}-${coachSnapshot.sha256.slice(0, 12)}-${files.modelRuntimeProfile.sha256.slice(0, 12)}`;
const manifest = {
  schemaVersion: 1,
  releaseBundleId,
  releaseProfileId: descriptor.releaseProfileId,
  git: { sha: fullGitSha, shortSha: fullGitSha.slice(0, 12) },
  creativeCoaches: {
    snapshotId: coachSnapshot.snapshotId,
    payloadSha256: coachSnapshot.sha256,
    coachCount: coachSnapshot.coaches.length,
    file: files.creativeCoachSnapshot,
  },
  modelRuntime: {
    profileId: modelProfile.profileId,
    provider: modelProfile.environment.MODEL_PROVIDER,
    model: modelProfile.environment.MODEL_NAME,
    apiBase: modelProfile.environment.MODEL_API_BASE,
    file: files.modelRuntimeProfile,
  },
  descriptor: files.descriptor,
};

if (verifyArgument) {
  const existing = JSON.parse(await readFile(path.resolve(repoRoot, verifyArgument), "utf8"));
  if (JSON.stringify(existing) !== JSON.stringify(manifest)) throw new Error("Release bundle manifest does not match the current Git/config/data inputs");
  process.stdout.write(`${JSON.stringify({ releaseBundleId, verified: true })}\n`);
} else {
  if (!outputArgument) throw new Error("Usage: create-release-bundle-manifest.mjs --output <path> [--descriptor <path>] [--git-sha <sha>]");
  const outputPath = path.resolve(repoRoot, outputArgument);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ releaseBundleId, output: outputPath })}\n`);
}
