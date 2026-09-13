#!/usr/bin/env node
import { spawn } from "node:child_process";

const coaches = [
  { creatorName:"人间清醒王小姐HK", coachName:"人间清醒王小姐HK教练", sourceSkillIds:["f058e0f1-92b2-4ee2-8e71-f3f083adf234"] },
  { creatorName:"维港保典", coachName:"维港保典教练", sourceSkillIds:["26a745f5-3036-4439-8e1f-d90f5d2d69ee"] },
  { creatorName:"紫荆保险规划", coachName:"紫荆保险规划教练", sourceSkillIds:["dbf9fb5f-9926-47c4-9d9f-029b997f5512"] },
  { creatorName:"港圈Lina姐", coachName:"港圈Lina姐教练", sourceSkillIds:["801cbbe0-06ca-4eaf-aa3c-bca6b97d2088"] },
  { creatorName:"朱美音", coachName:"朱美音教练", sourceSkillIds:["84a41e21-9e82-4367-98db-4cfd0e2cff45"] },
];

const requested = new Set(process.argv.slice(2));
const selected = requested.size ? coaches.filter((coach) => requested.has(coach.creatorName) || requested.has(coach.coachName)) : coaches;
if (!selected.length) throw new Error("没有匹配到要训练的教练");

for (const coach of selected) {
  console.log(JSON.stringify({ phase:"coach-start",coach:coach.coachName }));
  const args = [
    "--env-file=.env",
    "scripts/retrain-creative-coach-progressive-skills.mjs",
    "--coach-name", coach.coachName,
    "--creator-name", coach.creatorName,
    "--source-skill-ids", coach.sourceSkillIds.join(","),
    "--activate",
  ];
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd:process.cwd(),stdio:"inherit",env:process.env });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`${coach.coachName} 训练失败，退出码 ${exitCode}`);
  console.log(JSON.stringify({ phase:"coach-complete",coach:coach.coachName }));
}

console.log(JSON.stringify({ phase:"batch-complete",coaches:selected.map((coach) => coach.coachName) }));
