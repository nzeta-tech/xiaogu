#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const roots = ["src/components", "src/app", "src/lib/client"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const sensitiveKeys = "prompt|content|article|draft|body|text|source|transcript|reference_image";
const forbidden = [
  new RegExp(`[?&](?:${sensitiveKeys})=`),
  new RegExp(`(?:searchParams|params|query)\\.set\\(\\s*[\"'](?:${sensitiveKeys})[\"']`),
  new RegExp(`new URLSearchParams\\(\\s*\\{[^}]*\\b(?:${sensitiveKeys})\\s*:`, "s"),
];

async function sourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(target));
    else if (sourceExtensions.has(path.extname(entry.name))) output.push(target);
  }
  return output;
}

const files = (await Promise.all(roots.map(sourceFiles))).flat();
const violations = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const expression of forbidden) {
    const match = expression.exec(content);
    if (!match) continue;
    const line = content.slice(0, match.index).split("\n").length;
    violations.push(`${file}:${line}`);
  }
}

assert.deepEqual(
  violations,
  [],
  `创作内容不得通过 URL 查询参数交接，请改用 workId 或 creation-handoff：\n${violations.join("\n")}`,
);
console.log(JSON.stringify({ status: "passed", fixture: "creation-url-handoff", assertions: 1, files: files.length }));
