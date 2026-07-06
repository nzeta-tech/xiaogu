import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
const migrationsDir = path.join(process.cwd(), "migrations");
const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

try {
  await pool.query("create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())");

  for (const file of files) {
    const applied = await pool.query("select 1 from schema_migrations where version = $1", [file]);
    if (applied.rowCount) {
      console.log(`skip ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations(version) values ($1)", [file]);
      await pool.query("commit");
      console.log(`applied ${file}`);
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }
  }
} finally {
  await pool.end();
}
