import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const questionnaireTemplate = {
  structure: {
    sections: [
      {
        section_id: "1764945012678_usl9qr2k8",
        questions: [
          { question_id: "1764945046689_v4lusyj09" },
          { question_id: "1765020425848_qf4i4bjyl" },
          { question_id: "1764945079553_zwzadou5l" },
          { question_id: "1764945141627_nw9e6dhgh" },
          { question_id: "1764945408081_9bqvdwrt4" },
          { question_id: "1765020702852_ezm4w38oc" },
        ],
      },
      {
        section_id: "Ky7Wx3",
        questions: [
          { question_id: "1778811660899_z50qzcnww" },
          { question_id: "Bm9Pq2" },
          { question_id: "Xn4Rt7" },
          { question_id: "Lp2Yq9" },
          { question_id: "1778811775490_akg445pk1" },
        ],
      },
      {
        section_id: "Uw6Dh8",
        questions: [
          { question_id: "1778820351193_jya9d0yor" },
          { question_id: "Vn1Kg3" },
          { question_id: "Sx8Lm6" },
          { question_id: "1778811879021_q2094ow72" },
        ],
      },
      {
        section_id: "Qw8Vb4",
        questions: [
          { question_id: "Hg3Nx6" },
          { question_id: "Jk7Pm2" },
        ],
      },
      {
        section_id: "Hn5Tp6",
        questions: [
          { question_id: "Kq9Wm4" },
          { question_id: "Vl3Bx7" },
          { question_id: "Rz8Pn2" },
          { question_id: "Fs6Dq1" },
          { question_id: "Tc2Yh9" },
          { question_id: "Gm4Lx5" },
          { question_id: "Nv7Kt3" },
          { question_id: "Jx5Rm6" },
        ],
      },
    ],
  },
};

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("begin");

  const questionnaires = await client.query(`
    select q.id, q.user_id
    from profile_questionnaires q
    where q.status = 'completed'
      and not exists (
        select 1
        from thinking_profile_snapshots s
        where s.questionnaire_id = q.id
      )
    order by q.updated_at asc
  `);

  let backfilled = 0;

  for (const questionnaire of questionnaires.rows) {
    const answersResult = await client.query(
      `select section_key, question_key, answer_text
       from profile_questionnaire_answers
       where questionnaire_id = $1
       order by sort_order asc, created_at asc`,
      [questionnaire.id],
    );

    const answers = createEmptyAnswers(questionnaireTemplate);
    for (const row of answersResult.rows) {
      if (answers[row.section_key]?.[row.question_key]) {
        answers[row.section_key][row.question_key].items[0].content = row.answer_text ?? "";
      }
    }

    const built = buildThinkingProfileSnapshot(answers);
    await client.query(
      `insert into thinking_profile_snapshots(user_id, questionnaire_id, version, status, snapshot_json, summary_json)
       values ($1, $2, 1, 'active', $3::jsonb, $4::jsonb)
       on conflict (questionnaire_id, version) do update set
         snapshot_json = excluded.snapshot_json,
         summary_json = excluded.summary_json,
         updated_at = now()`,
      [questionnaire.user_id, questionnaire.id, JSON.stringify(built.snapshot), JSON.stringify(built.summary)],
    );
    backfilled += 1;
  }

  await client.query("commit");
  console.log(JSON.stringify({ scanned: questionnaires.rowCount ?? 0, backfilled }));
} catch (error) {
  await client.query("rollback");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

function createEmptyAnswers(template) {
  const output = {};
  template.structure.sections.forEach((section) => {
    output[section.section_id] = {};
    section.questions.forEach((question) => {
      output[section.section_id][question.question_id] = { items: [{ content: "", input_type: "text" }] };
    });
  });
  return output;
}

function buildThinkingProfileSnapshot(answers) {
  const get = (sectionId, questionId) => answers[sectionId]?.[questionId]?.items?.[0]?.content?.trim() ?? "";
  const split = (value) => value.split(/\n|；|;|，|,|、/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
  const unique = (values, limit) => {
    const seen = new Set();
    const output = [];
    for (const value of values) {
      const normalized = (value || "").trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      output.push(normalized);
    }
    return output.slice(0, limit);
  };
  const compact = (values) => values.map((item) => (item || "").trim()).filter(Boolean);
  const trimLabel = (value) => value.replace(/\s+/g, " ").trim().slice(0, 36);

  const personal = questionnaireTemplate.structure.sections[0];
  const content = questionnaireTemplate.structure.sections[1];
  const audience = questionnaireTemplate.structure.sections[2];
  const beliefs = questionnaireTemplate.structure.sections[3];
  const deep = questionnaireTemplate.structure.sections[4];

  const displayName = get(personal.section_id, personal.questions[0].question_id);
  const honors = split(get(personal.section_id, personal.questions[3].question_id));
  const tags = split(get(personal.section_id, personal.questions[4].question_id));
  const careerPath = get(personal.section_id, personal.questions[5].question_id);
  const contentStatus = get(content.section_id, content.questions[0].question_id);
  const socialSamples = compact([
    get(content.section_id, content.questions[1].question_id),
    get(content.section_id, content.questions[2].question_id),
    get(content.section_id, content.questions[3].question_id),
  ]);
  const timeBudget = get(content.section_id, content.questions[4].question_id);
  const earnings = get(audience.section_id, audience.questions[0].question_id);
  const currentAudience = get(audience.section_id, audience.questions[1].question_id);
  const clientQuotes = split(get(audience.section_id, audience.questions[2].question_id));
  const commonQuestions = split(get(audience.section_id, audience.questions[3].question_id));
  const believes = split(get(beliefs.section_id, beliefs.questions[0].question_id));
  const disbelieves = split(get(beliefs.section_id, beliefs.questions[1].question_id));
  const turningPoints = split(get(deep.section_id, deep.questions[0].question_id));
  const fearsAndDrives = compact([
    get(deep.section_id, deep.questions[1].question_id),
    get(deep.section_id, deep.questions[2].question_id),
  ]);
  const failureView = get(deep.section_id, deep.questions[3].question_id);
  const decisionStyle = get(deep.section_id, deep.questions[4].question_id);
  const closePeopleFeedback = split(get(deep.section_id, deep.questions[5].question_id));
  const memorableMoment = get(deep.section_id, deep.questions[6].question_id);
  const clientStories = split(get(deep.section_id, deep.questions[7].question_id));

  const storyAnchor = turningPoints[0] || clientStories[0] || failureView || memorableMoment || careerPath;
  const trustReasons = compact([tags.join(" · "), honors.join(" · "), clientQuotes[0], storyAnchor]);
  const pains = unique([currentAudience, ...commonQuestions.slice(0, 3), ...clientQuotes.filter((item) => /担心|焦虑|不懂|犹豫|害怕|买错|踩坑/.test(item)).slice(0, 2), earnings], 6);
  const buyingMotivations = unique([
    ...clientQuotes.filter((item) => /信任|听懂|安心|靠谱|清楚/.test(item)),
    ...commonQuestions.filter((item) => /怎么买|怎么配|值不值|适不适合|有没有必要/.test(item)),
    ...believes.filter((item) => /长期|底线|判断|框架|验证/.test(item)),
  ], 6);
  const tone = unique([
    ...tags.filter((item) => /理性|专业|克制|直接|温柔|锋利|细心|真诚/.test(item)),
    ...believes.filter((item) => /理性|长期|验证|透明|专业/.test(item)),
    ...disbelieves.filter((item) => /焦虑|夸大|忽悠/.test(item)).map((item) => `反对${item}`),
    ...closePeopleFeedback.filter((item) => /较真|理性|认真|直接/.test(item)),
  ], 8);
  const pillarTopics = unique([
    ...commonQuestions.slice(0, 3),
    ...believes.filter((item) => /保险|客户|家庭|专业|态度|人生态度/.test(item)),
    currentAudience ? `围绕${currentAudience}做风险与决策拆解` : "",
    earnings ? `围绕${earnings}延伸服务优势` : "",
  ], 8);
  const repeatableAngles = unique([
    storyAnchor ? `从“${trimLabel(storyAnchor)}”切入建立信任` : "",
    ...clientStories.slice(0, 2).map((item) => `案例复盘：${trimLabel(item)}`),
    ...commonQuestions.slice(0, 2).map((item) => `问题拆解：${trimLabel(item)}`),
    failureView ? `踩坑反思：${trimLabel(failureView)}` : "",
  ], 6);
  const tabooAngles = unique([...disbelieves.map((item) => `避免${trimLabel(item)}`), "避免空泛鸡血式表达", "避免制造焦虑逼单"], 6);

  const snapshot = {
    identity_profile: {
      display_name: displayName,
      core_identity: compact([displayName, ...tags.slice(0, 6)]),
      life_roles: tags.filter((item) => /妈妈|宝妈|爸爸|父亲|母亲|创业|博士|老师|医生|企业主/.test(item)),
      career_path: careerPath,
      honors,
      turning_points: compact(turningPoints),
    },
    audience_profile: {
      primary_audience: currentAudience.split("\n")[0]?.trim() ?? currentAudience,
      secondary_audience: currentAudience.split("\n").slice(1).join(" ").trim(),
      client_pains: pains,
      common_questions: commonQuestions,
      buying_motivations: buyingMotivations,
    },
    trust_signals: {
      trust_reasons: trustReasons,
      client_quotes: clientQuotes,
      personal_story_anchor: storyAnchor,
      case_signals: compact(clientStories),
    },
    belief_system: {
      believes,
      disbelieves,
      decision_style: decisionStyle,
      fears_and_drives: compact([...fearsAndDrives, failureView]),
    },
    expression_style: {
      tone,
      style_summary: compact([contentStatus, socialSamples[0], memorableMoment]).join(" "),
      content_preferences: unique([contentStatus, ...socialSamples, timeBudget ? `适合${timeBudget}节奏的内容编排` : "", ...commonQuestions.slice(0, 2).map((item) => `围绕“${item}”展开拆解`)], 8),
      time_budget: timeBudget,
    },
    content_motifs: {
      pillar_topics: pillarTopics,
      repeatable_angles: repeatableAngles,
      taboo_angles: tabooAngles,
    },
    evidence_map: {
      identity_profile: compact([displayName, careerPath, honors.join("；"), tags.join("；")]),
      audience_profile: compact([currentAudience, earnings, commonQuestions.join("；")]),
      trust_signals: compact([clientQuotes.join("；"), storyAnchor, clientStories.join("；")]),
      belief_system: compact([believes.join("；"), disbelieves.join("；"), decisionStyle, failureView]),
      expression_style: compact([contentStatus, socialSamples.join("；"), timeBudget, memorableMoment]),
      content_motifs: compact([pillarTopics.join("；"), repeatableAngles.join("；")]),
    },
  };

  const summary = {
    one_liner: compact([displayName, tags.slice(0, 2).join("·"), pillarTopics[0]]).join(" · ").slice(0, 120),
    positioning_hint: compact([trustReasons[0], believes[0], storyAnchor]).join(" ").slice(0, 220),
    audience_hint: compact([snapshot.audience_profile.primary_audience, pains.slice(0, 2).join("；")]).join(" | ").slice(0, 220),
    style_hint: compact([tone.slice(0, 4).join(" · "), timeBudget]).join(" | ").slice(0, 160),
  };

  return { snapshot, summary };
}
