import { query } from "../db/client.ts";

export type CreativeCoachSkillModules = {
  schemaVersion?: number;
  persona?: {
    identity?: string;
    audience?: string[];
    stablePositions?: string[];
    voiceTraits?: string[];
    adaptiveVoice?: Array<{ taskProfile?: string; guidance?: string }>;
    avoid?: string[];
    evidence?: Array<{ workId?: string; title?: string; excerpt?: string }>;
  };
  research?: string;
  brief?: string;
  writing?: string;
  voice?: string;
  taskPatterns?: Array<{
    key?: string;
    profile?: Record<string, unknown>;
    typicalMethods?: string[];
    omittedMethods?: string[];
    stoppingRule?: string;
    evidence?: Array<{ title?: string; excerpt?: string }>;
  }>;
  stoppingRules?: Array<{ when?: string; stopAfter?: string; doNotAdd?: string[]; evidence?: Array<{ title?: string; excerpt?: string }> }>;
  discoveredMethods?: Array<{
    key?: string;
    name?: string;
    summary?: string;
    steps?: string[];
    notFor?: string[];
    evidence?: Array<{ title?: string; excerpt?: string }>;
    level?: "general" | "strategy" | "functional" | "atomic";
    parentSkillId?: string | null;
    solves?: string[];
    when?: string[];
    requires?: string[];
    conflictsWith?: string[];
    stoppingRule?: string;
    positiveExamples?: Array<{ title?: string; excerpt?: string }>;
    counterExamples?: Array<{ title?: string; excerpt?: string; reason?: string }>;
    supportCount?: number;
  }>;
  skillHierarchy?: Array<{
    id?: string;
    name?: string;
    level?: "general" | "strategy" | "functional" | "atomic";
    parentSkillId?: string | null;
    description?: string;
    solves?: string[];
    when?: string[];
    notFor?: string[];
    childSkillIds?: string[];
  }>;
  skillPatches?: Array<{ operation?: "add" | "strengthen" | "split" | "merge" | "deprecate" | "unchanged"; targetSkillId?: string; reason?: string; evidenceCount?: number; sourceWorkIds?: string[] }>;
};

export type CreativeCoachSkillRoute = {
  strategySkillIds: string[];
  candidateMethodIds: string[];
  rationale: string;
};

export type CreativeCoachRuntime = {
  id: string;
  label: string;
  ipPositioningPrompt: string;
  contentCreationPrompt: string;
  growthPrompt: string;
  skillModules: CreativeCoachSkillModules;
};

function parseSkillModules(value: unknown): CreativeCoachSkillModules {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const modules = value as Record<string, unknown>;
  const templates = Object.fromEntries(["research", "brief", "writing", "voice"].flatMap((stage) => {
    const template = modules[stage];
    return typeof template === "string" && template.trim() ? [[stage, template.trim()]] : [];
  })) as CreativeCoachSkillModules;
  if (Array.isArray(modules.discoveredMethods)) templates.discoveredMethods = modules.discoveredMethods.slice(0, 12) as CreativeCoachSkillModules["discoveredMethods"];
  if (Array.isArray(modules.taskPatterns)) templates.taskPatterns = modules.taskPatterns.slice(0, 16) as CreativeCoachSkillModules["taskPatterns"];
  if (Array.isArray(modules.stoppingRules)) templates.stoppingRules = modules.stoppingRules.slice(0, 16) as CreativeCoachSkillModules["stoppingRules"];
  if (Array.isArray(modules.skillHierarchy)) templates.skillHierarchy = modules.skillHierarchy.slice(0, 120) as CreativeCoachSkillModules["skillHierarchy"];
  if (Array.isArray(modules.skillPatches)) templates.skillPatches = modules.skillPatches.slice(0, 120) as CreativeCoachSkillModules["skillPatches"];
  if (modules.persona && typeof modules.persona === "object" && !Array.isArray(modules.persona)) templates.persona = modules.persona as CreativeCoachSkillModules["persona"];
  if (Number.isFinite(Number(modules.schemaVersion))) templates.schemaVersion = Number(modules.schemaVersion);
  return templates;
}

const cleanIds = (value: unknown, limit: number) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, limit)
  : [];

export function renderCreativeCoachPersona(runtime: CreativeCoachRuntime) {
  const persona = runtime.skillModules.persona;
  if (!persona) return runtime.skillModules.voice ?? "";
  return JSON.stringify({ identity:persona.identity,audience:persona.audience,stablePositions:persona.stablePositions,voiceTraits:persona.voiceTraits,adaptiveVoice:persona.adaptiveVoice,avoid:persona.avoid });
}

export function renderCreativeCoachSkillIndex(runtime: CreativeCoachRuntime) {
  const hierarchy = runtime.skillModules.skillHierarchy ?? [];
  if (hierarchy.length) return hierarchy.map((item) => JSON.stringify({ id:item.id,name:item.name,level:item.level,parentSkillId:item.parentSkillId,description:item.description,solves:item.solves,when:item.when,notFor:item.notFor,childSkillIds:item.childSkillIds })).join("\n");
  return (runtime.skillModules.discoveredMethods ?? []).map((item) => JSON.stringify({ id:item.key,name:item.name,level:item.level ?? "functional",parentSkillId:item.parentSkillId,description:item.summary,solves:item.solves,when:item.when,notFor:item.notFor })).join("\n");
}

export function buildCreativeCoachSkillRoutePrompt(runtime: CreativeCoachRuntime, taskProfile: Record<string, unknown>) {
  return [
    "你是教练Skill渐进加载路由器，不写正文、不选择观点。根据任务画像先选择0或1个strategy，再选择最多6个值得展开查看的候选方法。允许不选。",
    "这里只看到轻量目录。不得因名称听起来相关就选择；优先匹配solves、when和notFor。候选不是最终使用方法，后续教练仍需执行不可替代价值和删除测试。",
    `【任务画像】${JSON.stringify(taskProfile)}`,
    `【全量轻量Skill目录】\n${renderCreativeCoachSkillIndex(runtime)}`,
    "严格JSON：{strategySkillIds:string[],candidateMethodIds:string[],rationale:string}。strategySkillIds最多1个，candidateMethodIds最多6个。",
  ].join("\n\n");
}

export function parseCreativeCoachSkillRoute(raw: string, runtime: CreativeCoachRuntime): CreativeCoachSkillRoute {
  const allowed = new Set((runtime.skillModules.skillHierarchy ?? []).map((item) => item.id).concat((runtime.skillModules.discoveredMethods ?? []).map((item) => item.key)).filter((item): item is string => Boolean(item)));
  try {
    const value = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
    return {
      strategySkillIds: cleanIds(value.strategySkillIds, 1).filter((id) => allowed.has(id)),
      candidateMethodIds: cleanIds(value.candidateMethodIds, 6).filter((id) => allowed.has(id)),
      rationale: typeof value.rationale === "string" ? value.rationale.trim().slice(0, 800) : "",
    };
  } catch { return { strategySkillIds: [], candidateMethodIds: [], rationale: "路由结果无法解析，使用零方法安全回退" }; }
}

export function renderSelectedCreativeCoachMethods(runtime: CreativeCoachRuntime, names: Array<string | null | undefined>) {
  const selected = new Set(names.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map((name) => name.trim()));
  const methods = (runtime.skillModules.discoveredMethods ?? []).filter((method) => selected.has(method.key ?? "") || selected.has(method.name ?? "")).slice(0, 6);
  if (!methods.length) return "";
  return methods.map((method) => JSON.stringify({ name:method.name,key:method.key,summary:method.summary,steps:method.steps,notFor:method.notFor,evidence:method.evidence?.slice(0,3) })).join("\n");
}

export function renderProgressivelyLoadedCreativeCoachSkills(runtime: CreativeCoachRuntime, route: CreativeCoachSkillRoute) {
  const ids = [...route.strategySkillIds, ...route.candidateMethodIds];
  return renderSelectedCreativeCoachMethods(runtime, ids);
}

export function renderCreativeCoachMethodCatalog(runtime: CreativeCoachRuntime) {
  const methods = (runtime.skillModules.discoveredMethods ?? []).slice(0, 12).map((method) => JSON.stringify({ key:method.key,name:method.name,summary:method.summary,notFor:method.notFor })).join("\n");
  const patterns = (runtime.skillModules.taskPatterns ?? []).slice(0, 12).map((pattern) => JSON.stringify(pattern)).join("\n");
  const stops = (runtime.skillModules.stoppingRules ?? []).slice(0, 12).map((rule) => JSON.stringify(rule)).join("\n");
  return [methods, patterns ? `【历史任务画像与方法组合】\n${patterns}` : "", stops ? `【作者停止条件】\n${stops}` : ""].filter(Boolean).join("\n\n");
}

export function renderCreativeCoachSkill(runtime: CreativeCoachRuntime, stage: "research" | "brief" | "writing") {
  const template = runtime.skillModules[stage];
  if (template) {
    const rendered = template.replaceAll("{{coach_label}}", runtime.label);
    const voice = stage === "writing" ? runtime.skillModules.voice?.replaceAll("{{coach_label}}", runtime.label) : "";
    return [rendered, voice ? `【表达声纹｜只控制表达实现】\n${voice}` : ""].filter(Boolean).join("\n\n");
  }
  // Compatibility for historical coach versions that have not yet been modularized.
  if (stage === "research") return [runtime.ipPositioningPrompt, runtime.growthPrompt].filter(Boolean).join("\n\n");
  if (stage === "brief") return [runtime.contentCreationPrompt, runtime.ipPositioningPrompt, runtime.growthPrompt].filter(Boolean).join("\n\n");
  return [runtime.contentCreationPrompt, runtime.skillModules.voice ? `【表达声纹｜只控制表达实现】\n${runtime.skillModules.voice}` : ""].filter(Boolean).join("\n\n");
}

export async function resolveCreativeCoachRuntime(userId: string, versionId: string): Promise<CreativeCoachRuntime | null> {
  if (!versionId) return null;
  const result = await query<{
    id: string;
    name: string;
    version: number;
    ip_positioning_prompt: string;
    content_creation_prompt: string;
    growth_prompt: string;
    skill_modules: unknown;
  }>(
    `select versions.id, coaches.name, versions.version, versions.ip_positioning_prompt,
            versions.content_creation_prompt, versions.growth_prompt, versions.skill_modules
       from creative_coach_versions versions
       join creative_coaches coaches on coaches.id=versions.coach_id
      where (($1='default' and coaches.is_system=true) or versions.id::text=$1)
        and versions.status in ('active','restored') and coaches.status='active'
        and (coaches.coach_scope='platform' or (coaches.coach_scope='personal' and coaches.user_id=$2))
      limit 1`,
    [versionId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("所选创作教练版本不存在或当前不可用，请重新选择。");
  return {
    id: row.id,
    label: `${row.name} · V${row.version}`,
    ipPositioningPrompt: row.ip_positioning_prompt.trim(),
    contentCreationPrompt: row.content_creation_prompt.trim(),
    growthPrompt: row.growth_prompt.trim(),
    skillModules: parseSkillModules(row.skill_modules),
  };
}

export function formatCreativeCoachRuntime(runtime: CreativeCoachRuntime) {
  return [
    `【创作教练｜${runtime.label}】`,
    runtime.ipPositioningPrompt ? `【IP定位】\n${runtime.ipPositioningPrompt}` : "",
    runtime.growthPrompt ? `【获客增长】\n${runtime.growthPrompt}` : "",
    runtime.contentCreationPrompt ? `【内容创作】\n${runtime.contentCreationPrompt}` : "",
    "执行顺序：先用IP定位判断长期方向，再用获客增长确定本题目标与受众，最后由内容创作决定切口、结构、语言和收束。三项能力不得互相改写职责。",
  ].filter(Boolean).join("\n\n");
}
