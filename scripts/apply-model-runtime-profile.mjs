#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const profilePath = process.argv.find((argument) => argument.endsWith(".json"));
const envIndex = process.argv.indexOf("--env-file");
const envPath = envIndex >= 0 ? process.argv[envIndex + 1] : "";
const dryRun = process.argv.includes("--dry-run");
const envOnly = process.argv.includes("--env-only");
const databaseOnly = process.argv.includes("--database-only");
if (!profilePath || (envOnly && databaseOnly)) throw new Error("Usage: node scripts/apply-model-runtime-profile.mjs <profile.json> [--env-file <path>] [--env-only|--database-only] [--dry-run]");

const profile = JSON.parse(await readFile(profilePath, "utf8"));
if (profile.schemaVersion !== 1 || !profile.environment || !profile.runtime) throw new Error("Unsupported model-runtime profile");
for (const key of ["MODEL_PROVIDER", "MODEL_NAME", "MODEL_API_BASE"]) {
  if (!profile.environment[key]) throw new Error(`Missing ${key} in model-runtime profile`);
}

async function applyEnvironment() {
  if (!envPath) throw new Error("--env-file is required when applying environment settings");
  const original = await readFile(envPath, "utf8");
  let updated = original;
  for (const [key, value] of Object.entries(profile.environment)) {
    const line = `${key}=${value}`;
    const expression = new RegExp(`^${key}=.*$`, "m");
    updated = expression.test(updated) ? updated.replace(expression, line) : `${updated.replace(/\s*$/, "")}\n${line}\n`;
  }
  if (!dryRun && updated !== original) {
    const temporaryPath = `${envPath}.xiaogu-model-runtime.tmp`;
    await writeFile(temporaryPath, updated, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, envPath);
  }
  return updated !== original;
}

async function applyDatabase() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("begin");
    const current = await client.query("select setting_value from system_settings where setting_key='runtime' for update");
    const previous = current.rows[0]?.setting_value ?? {};
    const next = { ...previous, ...profile.runtime };
    await client.query(
      `insert into system_settings(setting_key,setting_value,updated_at) values('runtime',$1::jsonb,now())
       on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_at=excluded.updated_at`,
      [JSON.stringify(next)],
    );
    if (dryRun) await client.query("rollback");
    else await client.query("commit");
    return JSON.stringify(previous) !== JSON.stringify(next);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

const envChanged = databaseOnly ? false : await applyEnvironment();
const databaseChanged = envOnly ? false : await applyDatabase();
process.stdout.write(`${JSON.stringify({ profileId: profile.profileId, envChanged, databaseChanged, dryRun })}\n`);
