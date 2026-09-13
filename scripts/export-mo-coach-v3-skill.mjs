#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { Pool } from "pg";

const versionId = "4db2caff-4dfc-4b56-b3f8-dd0ebff1233a";
const outputPath = new URL("../artifacts/mo-coach-v3-skill.md", import.meta.url);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(`select c.name,v.version,v.change_summary,v.ip_positioning_prompt,v.content_creation_prompt,v.growth_prompt from creative_coach_versions v join creative_coaches c on c.id=v.coach_id where v.id=$1`, [versionId]);
  const row = result.rows[0];
  if (!row) throw new Error("未找到 Mo姐 V3");
  const markdown = `# ${row.name} · V${row.version} Skill\n\n> ${row.change_summary}\n\n## IP 定位能力\n\n${row.ip_positioning_prompt}\n\n## 内容创作能力\n\n${row.content_creation_prompt}\n\n## 获客增长能力\n\n${row.growth_prompt}\n`;
  await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  console.log(JSON.stringify({ output: outputPath.pathname, characters: markdown.length }));
} finally { await pool.end(); }
