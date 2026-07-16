import pg from "pg";

const email = "guyu@xiaogu.ai";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

try {
  const userResult = await pool.query("select id, name, email, role from users where lower(email) = lower($1)", [email]);
  const user = userResult.rows[0];
  if (!user) throw new Error(`${email} does not exist`);

  const [profileResult, questionnaireResult, snapshotResult, worksResult] = await Promise.all([
    pool.query(
      `select display_name, ip_tagline, profile_summary, brand_keywords, content_style_summary
       from broker_profiles where user_id = $1`,
      [user.id],
    ),
    pool.query(
      `select q.id, q.completion_percent,
              coalesce(jsonb_object_agg(a.question_key, a.answer_text) filter (where a.question_key is not null), '{}'::jsonb) as answers
       from profile_questionnaires q
       left join profile_questionnaire_answers a on a.questionnaire_id = q.id
       where q.user_id = $1
       group by q.id
       order by max(q.updated_at) desc limit 1`,
      [user.id],
    ),
    pool.query(
      `select id, questionnaire_id, version, snapshot_json, summary_json
       from thinking_profile_snapshots where user_id = $1 order by updated_at desc limit 1`,
      [user.id],
    ),
    pool.query(
      `select w.id, w.title, w.source_channel,
              coalesce(v.content, '') as content
       from works w
       left join lateral (
         select content from work_versions where work_id = w.id order by version_no desc limit 1
       ) v on true
       where w.user_id = $1 and coalesce(v.content, '') <> ''
       order by w.updated_at desc limit 16`,
      [user.id],
    ),
  ]);

  const profile = profileResult.rows[0] ?? {};
  const questionnaire = questionnaireResult.rows[0] ?? { answers: {} };
  const currentSnapshot = snapshotResult.rows[0];
  if (!currentSnapshot) throw new Error("A thinking profile snapshot is required before avatar backfill");

  const evidence = {
    user: { name: user.name, role: user.role },
    profile,
    questionnaireAnswers: questionnaire.answers,
    snapshot: currentSnapshot.snapshot_json,
    summary: currentSnapshot.summary_json,
    workSamples: worksResult.rows.map((work) => ({
      title: work.title,
      channel: work.source_channel,
      content: String(work.content).slice(0, 2400),
    })),
  };

  const inferred = await inferMissingAvatarFields(evidence);
  const mergedSnapshot = deepFill(currentSnapshot.snapshot_json, inferred.snapshotPatch ?? {});
  const mergedSummary = deepFill(currentSnapshot.summary_json, inferred.summaryPatch ?? {});

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update broker_profiles set
         display_name = case when display_name = '' then $2 else display_name end,
         ip_tagline = case when ip_tagline = '' then $3 else ip_tagline end,
         profile_summary = case when profile_summary = '' then $4 else profile_summary end,
         brand_keywords = case when cardinality(brand_keywords) = 0 then $5::text[] else brand_keywords end,
         content_style_summary = case when content_style_summary = '' then $6 else content_style_summary end,
         updated_at = now()
       where user_id = $1`,
      [
        user.id,
        inferred.profilePatch?.display_name ?? user.name,
        inferred.profilePatch?.ip_tagline ?? "",
        inferred.profilePatch?.profile_summary ?? "",
        Array.isArray(inferred.profilePatch?.brand_keywords) ? inferred.profilePatch.brand_keywords : [],
        inferred.profilePatch?.content_style_summary ?? "",
      ],
    );

    const nextThinkingVersion = Number(currentSnapshot.version) + 1;
    await client.query(`update thinking_profile_snapshots set status = 'superseded' where user_id = $1 and status = 'active'`, [user.id]);
    await client.query(
      `insert into thinking_profile_snapshots(user_id, questionnaire_id, version, status, snapshot_json, summary_json)
       values ($1, $2, $3, 'active', $4::jsonb, $5::jsonb)
       on conflict (questionnaire_id, version) do update set status = 'active', snapshot_json = excluded.snapshot_json,
         summary_json = excluded.summary_json, updated_at = now()`,
      [user.id, currentSnapshot.questionnaire_id, nextThinkingVersion, JSON.stringify(mergedSnapshot), JSON.stringify(mergedSummary)],
    );

    await client.query(`delete from avatar_memory_items where user_id = $1 and metadata_json->>'backfillKey' = 'guyu-avatar-v1'`, [user.id]);
    await client.query(`delete from avatar_memory_sources where user_id = $1 and metadata_json->>'backfillKey' = 'guyu-avatar-v1'`, [user.id]);

    const source = await client.query(
      `insert into avatar_memory_sources(user_id, source_type, title, content, status, metadata_json)
       values ($1, 'manual', '已有画像与历史作品', $2, 'active', jsonb_build_object('backfillKey', 'guyu-avatar-v1', 'evidenceWorks', $3::int))
       returning id`,
      [user.id, "由既有人设问卷、结构化画像和历史作品汇总，不包含客户敏感原文。", worksResult.rowCount],
    );
    const sourceId = source.rows[0].id;

    const verifiedMemories = buildVerifiedMemories(profile, mergedSnapshot);
    for (const memory of verifiedMemories) {
      await client.query(
        `insert into avatar_memory_items(user_id, category, title, content, source_id, origin, status, confidence, sensitivity, usage_scope, metadata_json)
         values ($1, $2, $3, $4, $5, 'imported', 'active', $6, 'normal', 'all', jsonb_build_object('backfillKey', 'guyu-avatar-v1', 'evidence', $7::text))`,
        [user.id, memory.category, memory.title, memory.content, sourceId, memory.confidence, memory.evidence],
      );
    }

    const candidates = Array.isArray(inferred.candidateMemories) ? inferred.candidateMemories : [];
    for (const memory of candidates.slice(0, 16)) {
      if (!validCategory(memory.category) || !String(memory.content ?? "").trim()) continue;
      await client.query(
        `insert into avatar_memory_items(user_id, category, title, content, source_id, origin, status, confidence, sensitivity, usage_scope, metadata_json)
         values ($1, $2, $3, $4, $5, 'inferred', 'candidate', $6, 'normal', 'content', jsonb_build_object('backfillKey', 'guyu-avatar-v1', 'evidence', $7::jsonb))`,
        [user.id, memory.category, String(memory.title ?? "AI 候选记忆").slice(0, 120), String(memory.content).slice(0, 5000), sourceId, clampConfidence(memory.confidence), JSON.stringify(memory.evidence ?? [])],
      );
    }

    await client.query(
      `insert into avatar_privacy_settings(user_id, learning_enabled, behavior_learning_enabled, customer_memory_enabled, auto_inference_enabled)
       values ($1, true, true, false, true) on conflict (user_id) do nothing`,
      [user.id],
    );

    const activeMemories = await client.query(
      `select id, category, title, content, confidence from avatar_memory_items where user_id = $1 and status = 'active' order by updated_at desc`,
      [user.id],
    );
    const nextAvatarVersion = await client.query(`select coalesce(max(version), 0) + 1 as version from avatar_versions where user_id = $1`, [user.id]);
    await client.query(`update avatar_versions set status = 'superseded' where user_id = $1 and status = 'active'`, [user.id]);
    await client.query(
      `insert into avatar_versions(user_id, version, label, snapshot_json, change_summary, source, status)
       values ($1, $2, $3, $4::jsonb, $5, 'ai-backfill', 'active')`,
      [user.id, nextAvatarVersion.rows[0].version, `V${nextAvatarVersion.rows[0].version} · 初始回填`, JSON.stringify({ profile: mergedSnapshot, summary: mergedSummary, memories: activeMemories.rows }), `基于 ${worksResult.rowCount} 份历史作品和既有画像建立初始数字分身`],
    );

    await client.query("commit");
    console.log(JSON.stringify({ email, verifiedMemories: verifiedMemories.length, inferredCandidates: candidates.length, evidenceWorks: worksResult.rowCount, thinkingVersion: nextThinkingVersion, avatarVersion: nextAvatarVersion.rows[0].version }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

async function inferMissingAvatarFields(evidence) {
  const system = [
    "你是数字分身资料审计员。根据真实已有资料，补齐缺失的内容经营画像。",
    "必须区分事实与推断：不得虚构学历、资质、收入、客户数量、荣誉、客户案例、健康信息或家庭事实。",
    "不得推断或填写 MBTI 答案和类型。",
    "只有资料直接支持的内容才能进入 snapshotPatch；推断出的表达偏好和内容策略只能进入 candidateMemories。",
    "输出严格 JSON，不要代码块。",
    '结构：{"profilePatch":{},"snapshotPatch":{},"summaryPatch":{},"candidateMemories":[{"category":"expression","title":"","content":"","confidence":60,"evidence":[""]}]}',
    "category 只能是 identity、audience、expertise、expression、story、boundary。",
  ].join("\n");
  const prompt = `请审计并补齐以下资料中的空字段。作品样本只用于推断表达偏好，不得把文案中的虚构角色当作本人事实。\n${JSON.stringify(evidence)}`;
  const provider = process.env.MODEL_PROVIDER ?? "openai";
  if (provider === "google") return callGoogle(system, prompt);
  const baseUrl = (process.env.MODEL_API_BASE ?? (provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1")).replace(/\/$/, "");
  const apiKey = provider === "groq" ? process.env.GROQ_API_KEY ?? process.env.MODEL_API_KEY : process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("Model API key is required for AI backfill");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.MODEL_NAME ?? "gpt-4o-mini", temperature: 0.15, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
  });
  if (!response.ok) throw new Error(`AI backfill failed: ${response.status}`);
  const payload = await response.json();
  return parseJson(payload.choices?.[0]?.message?.content ?? "");
}

async function callGoogle(system, prompt) {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Google API key is required for AI backfill");
  const model = process.env.MODEL_NAME ?? "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.15, responseMimeType: "application/json" } }),
  });
  if (!response.ok) throw new Error(`AI backfill failed: ${response.status}`);
  const payload = await response.json();
  return parseJson(payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
}

function parseJson(value) {
  const normalized = String(value).replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(normalized);
}

function deepFill(existing, patch) {
  if (Array.isArray(existing)) return existing.length > 0 ? existing : Array.isArray(patch) ? patch : existing;
  if (existing && typeof existing === "object") {
    const output = { ...existing };
    for (const [key, value] of Object.entries(patch && typeof patch === "object" ? patch : {})) output[key] = key in output ? deepFill(output[key], value) : value;
    return output;
  }
  if (existing === "" || existing === null || existing === undefined) return patch ?? existing;
  return existing;
}

function buildVerifiedMemories(profile, snapshot) {
  const result = [];
  const add = (category, title, content, confidence, evidence) => {
    const normalized = String(content ?? "").trim();
    if (normalized) result.push({ category, title, content: normalized, confidence, evidence });
  };
  const confirmed = (values) => (values ?? []).filter((value) => String(value ?? "").trim() && !looksExplicitlyInferred(value));
  add("identity", "个人定位", confirmed([profile.display_name, profile.ip_tagline, profile.profile_summary]).join("。"), 100, "broker_profiles");
  add("identity", "职业路径", confirmed([snapshot.identity_profile?.career_path]).join(""), 100, "questionnaire.career_path");
  add("audience", "核心服务客群", confirmed([snapshot.audience_profile?.primary_audience]).join(""), 100, "questionnaire.primary_audience");
  add("audience", "客户高频问题", confirmed(snapshot.audience_profile?.common_questions).join("；"), 95, "questionnaire.common_questions");
  add("expertise", "长期内容母题", confirmed(snapshot.content_motifs?.pillar_topics).join("；"), 92, "thinking_snapshot.content_motifs");
  add("expertise", "核心专业信念", confirmed(snapshot.belief_system?.believes).join("；"), 100, "questionnaire.core_beliefs");
  add("expression", "表达语气", confirmed([profile.content_style_summary, ...(snapshot.expression_style?.tone ?? [])]).join("；"), 95, "profile_and_snapshot.expression_style");
  const storyAnchor = looksExplicitlyInferred(snapshot.trust_signals?.personal_story_anchor)
    ? snapshot.identity_profile?.career_path
    : snapshot.trust_signals?.personal_story_anchor;
  add("story", "真实故事锚点", storyAnchor, 100, looksExplicitlyInferred(snapshot.trust_signals?.personal_story_anchor) ? "questionnaire.career_path" : "questionnaire.turning_points");
  add("boundary", "表达与合规边界", confirmed([...(snapshot.belief_system?.disbelieves ?? []), ...(snapshot.content_motifs?.taboo_angles ?? [])]).join("；"), 100, "questionnaire.boundaries");
  return result;
}

function looksExplicitlyInferred(value) {
  return /(?:推测|推断|可能|大概率|很可能|更可能|反推|未提供|没有提供|假设|猜测|也许|或许)/.test(String(value ?? ""));
}

function validCategory(value) {
  return ["identity", "audience", "expertise", "expression", "story", "boundary"].includes(value);
}

function clampConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(35, Math.min(85, Math.round(number))) : 55;
}
