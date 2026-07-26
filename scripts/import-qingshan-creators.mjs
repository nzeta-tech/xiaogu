import fs from "node:fs/promises";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/import-qingshan-creators.mjs <qingshan-response.json>");
  process.exit(1);
}
const secret = process.env.VIRAL_PREPARATION_SECRET || process.env.CRON_SECRET;
if (!secret) {
  console.error("VIRAL_PREPARATION_SECRET or CRON_SECRET is required");
  process.exit(1);
}
const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
const endpoint = process.env.VIRAL_QINGSHAN_IMPORT_URL ?? "http://127.0.0.1:3000/api/internal/viral-data/import-qingshan-creators";
const response = await fetch(endpoint, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(60_000),
});
const body = await response.text();
if (!response.ok) {
  console.error(`HTTP ${response.status}: ${body}`);
  process.exit(1);
}
console.log(body);
