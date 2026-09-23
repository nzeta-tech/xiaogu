#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const [repoPath, candidateSha] = process.argv.slice(2);
if (!repoPath || !candidateSha) {
  console.error("Usage: release-migration-inventory.mjs <repo-path> <candidate-sha> < applied-versions.txt");
  process.exit(2);
}

let expected;
try {
  expected = execFileSync("git", ["-C", repoPath, "ls-tree", "-r", "--name-only", candidateSha, "--", "migrations"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => /^migrations\/.+\.sql$/.test(file))
    .map((file) => file.slice("migrations/".length));
} catch (error) {
  console.error(`Cannot read candidate migration inventory: ${error.message}`);
  process.exit(2);
}

let appliedText = "";
for await (const chunk of process.stdin) appliedText += chunk;
const applied = new Set(appliedText.split(/\r?\n/).filter(Boolean));
const missing = expected.filter((version) => !applied.has(version));
if (missing.length) {
  console.error(`[xiaogu-deploy] BLOCKED: ${missing.length} candidate migration(s) are absent from production schema_migrations:`);
  for (const version of missing) console.error(`  ${version}`);
  console.error("Apply and verify migrations before publishing the Web artifact.");
  process.exit(1);
}
console.log(`[xiaogu-deploy] Migration inventory verified: ${expected.length} candidate migrations applied`);
