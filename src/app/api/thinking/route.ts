import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import {
  tryGetBrokerProfile,
  tryGetLatestThinkingProfileSnapshot,
  tryGetLatestQuestionnaire,
  trySaveQuestionnaire,
  trySaveThinkingProfileSnapshot,
  tryUpdateBrokerProfile,
} from "@/lib/db/repositories";
import { computeThinkingProfileSummary, thinkingQuestions } from "@/lib/thinking/questionnaire";
import {
  createEmptyQuestionnaireAnswers,
  localQuestionnaireTemplate,
  type QuestionnaireAnswers,
} from "@/lib/thinking/questionnaire-template";
import { buildThinkingProfileBrief, buildThinkingProfileSnapshot } from "@/lib/thinking/profile-snapshot";

const thinkingSchema = z.object({
  persona: z.string().trim().min(1).max(500),
  targetAudience: z.string().trim().min(1).max(500),
  specialty: z.string().trim().min(1).max(500),
  topicPreference: z.string().trim().min(1).max(500),
});

const questionnaireSubmitSchema = z.object({
  answers: z.record(z.string(), z.record(z.string(), z.object({
    items: z.array(z.object({
      content: z.string(),
      input_type: z.literal("text"),
    })),
  }))),
  profile: z.object({
    persona: z.string().trim().min(1).max(10000),
    targetAudience: z.string().trim().min(1).max(10000),
    specialty: z.string().trim().min(1).max(10000),
    topicPreference: z.string().trim().min(1).max(10000),
    displayName: z.string().trim().optional().default(""),
    ipTagline: z.string().trim().optional().default(""),
    profileSummary: z.string().trim().optional().default(""),
    brandKeywords: z.array(z.string().trim()).optional().default([]),
    contentStyleSummary: z.string().trim().optional().default(""),
  }),
  status: z.enum(["draft", "completed"]).optional().default("completed"),
});

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const profile = await tryGetBrokerProfile(user.id);
  const questionnaire = await tryGetLatestQuestionnaire(user.id);
  const thinkingProfileSnapshot = await tryGetLatestThinkingProfileSnapshot(user.id);
  if (!profile && !questionnaire && !thinkingProfileSnapshot) {
    return Response.json({ error: "思维档案暂不可用" }, { status: 404 });
  }

  const derived = thinkingProfileSnapshot?.snapshot_json
    ? buildThinkingProfileBrief(thinkingProfileSnapshot.snapshot_json, thinkingProfileSnapshot.summary_json)
    : null;
  const summary = computeThinkingProfileSummary({
    persona: derived?.persona ?? "",
    targetAudience: derived?.targetAudience ?? "",
    specialty: derived?.specialty ?? "",
    topicPreference: derived?.topicPreference ?? "",
  });

  return Response.json({
    profile,
    summary,
    questions: thinkingQuestions,
    thinkingProfileSnapshot: thinkingProfileSnapshot
      ? {
          id: thinkingProfileSnapshot.id,
          questionnaireId: thinkingProfileSnapshot.questionnaire_id,
          version: thinkingProfileSnapshot.version,
          updatedAt: thinkingProfileSnapshot.updated_at,
          snapshot: thinkingProfileSnapshot.snapshot_json,
          summary: thinkingProfileSnapshot.summary_json,
        }
      : null,
    questionnaire: questionnaire
      ? {
          id: questionnaire.id,
          status: questionnaire.status,
          completionPercent: questionnaire.completion_percent,
          updatedAt: questionnaire.updated_at,
          answers: buildQuestionnaireAnswerMap(questionnaire.answers),
          template: localQuestionnaireTemplate,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const raw = await request.json();
  const questionnairePayload = questionnaireSubmitSchema.safeParse(raw);

  if (questionnairePayload.success) {
    const input = questionnairePayload.data;
    const savedQuestionnaire = await trySaveQuestionnaire({
      userId: user.id,
      template: localQuestionnaireTemplate,
      answers: input.answers as QuestionnaireAnswers,
      status: input.status,
      source: "user_fill",
      summaryText: input.profile.persona,
    });

    const builtProfile = buildThinkingProfileSnapshot(input.answers as QuestionnaireAnswers, localQuestionnaireTemplate);
    const savedThinkingSnapshot = await trySaveThinkingProfileSnapshot({
      userId: user.id,
      questionnaireId: savedQuestionnaire?.id ?? null,
      snapshot: builtProfile.snapshot,
      summary: builtProfile.summary,
    });

    const profile = await tryUpdateBrokerProfile({
      userId: user.id,
      displayName: input.profile.displayName,
      ipTagline: input.profile.ipTagline,
      profileSummary: input.profile.profileSummary,
      brandKeywords: input.profile.brandKeywords,
      contentStyleSummary: input.profile.contentStyleSummary,
      sourceQuestionnaireId: savedQuestionnaire?.id ?? null,
    });

    if (!profile || !savedQuestionnaire || !savedThinkingSnapshot) {
      return Response.json({ error: "思维保存失败，请稍后再试。" }, { status: 503 });
    }

    const derivedSummary = computeThinkingProfileSummary(buildThinkingProfileBrief(builtProfile.snapshot, builtProfile.summary));

    return Response.json({
      ok: true,
      profile,
      summary: derivedSummary,
      questionnaire: {
        id: savedQuestionnaire.id,
        completionPercent: savedQuestionnaire.completionPercent,
        status: input.status,
      },
      thinkingProfileSnapshot: {
        id: savedThinkingSnapshot.id,
        questionnaireId: savedThinkingSnapshot.questionnaire_id,
        version: savedThinkingSnapshot.version,
      },
    });
  }

  const input = thinkingSchema.parse(raw);
  const defaultAnswers = createEmptyQuestionnaireAnswers(localQuestionnaireTemplate);
  hydrateDefaultQuestionnaireAnswers(defaultAnswers, input);

  const savedQuestionnaire = await trySaveQuestionnaire({
    userId: user.id,
    template: localQuestionnaireTemplate,
    answers: defaultAnswers,
    status: "completed",
    source: "legacy_summary",
    summaryText: input.persona,
  });
  const builtProfile = buildThinkingProfileSnapshot(defaultAnswers, localQuestionnaireTemplate);
  const savedThinkingSnapshot = await trySaveThinkingProfileSnapshot({
    userId: user.id,
    questionnaireId: savedQuestionnaire?.id ?? null,
    snapshot: builtProfile.snapshot,
    summary: builtProfile.summary,
  });
  const profile = await tryUpdateBrokerProfile({
    userId: user.id,
    sourceQuestionnaireId: savedQuestionnaire?.id ?? null,
  });

  if (!profile || !savedThinkingSnapshot) {
    return Response.json({ error: "思维保存失败，请稍后再试。" }, { status: 503 });
  }

  const summary = computeThinkingProfileSummary(buildThinkingProfileBrief(builtProfile.snapshot, builtProfile.summary));

  return Response.json({ ok: true, profile, summary });
}

function buildQuestionnaireAnswerMap(
  rows: Array<{ section_key: string; question_key: string; answer_text: string; answer_json: Record<string, unknown> }>,
) {
  const output = createEmptyQuestionnaireAnswers(localQuestionnaireTemplate);
  for (const row of rows) {
    const current = output[row.section_key]?.[row.question_key];
    if (!current) continue;
    const jsonItems = Array.isArray((row.answer_json as { items?: unknown[] })?.items)
      ? ((row.answer_json as { items?: Array<{ content?: string }> }).items ?? [])
      : [];
    const firstItem = jsonItems[0]?.content;
    current.items[0].content = typeof firstItem === "string" && firstItem.trim().length > 0 ? firstItem : row.answer_text ?? "";
  }
  return output;
}

function hydrateDefaultQuestionnaireAnswers(
  answers: QuestionnaireAnswers,
  input: z.infer<typeof thinkingSchema>,
) {
  const sections = localQuestionnaireTemplate.structure.sections;
  const firstSection = sections[0];
  const secondSection = sections[1];
  const thirdSection = sections[2];
  const fifthSection = sections[4];

  if (firstSection?.questions[0]) {
    answers[firstSection.section_id][firstSection.questions[0].question_id].items[0].content = input.persona;
  }
  if (secondSection?.questions[0]) {
    answers[secondSection.section_id][secondSection.questions[0].question_id].items[0].content = input.specialty;
  }
  if (thirdSection?.questions[1]) {
    answers[thirdSection.section_id][thirdSection.questions[1].question_id].items[0].content = input.targetAudience;
  }
  if (fifthSection?.questions[0]) {
    answers[fifthSection.section_id][fifthSection.questions[0].question_id].items[0].content = input.topicPreference;
  }
}
