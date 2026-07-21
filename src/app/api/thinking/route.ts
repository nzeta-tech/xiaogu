import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { bootstrapAvatarFromThinkingSubmission } from "@/lib/avatar/bootstrap";
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
    return Response.json({ error: "人设档案暂不可用" }, { status: 404 });
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
      return Response.json({ error: "人设保存失败，请稍后再试。" }, { status: 503 });
    }

    const bootstrapped = await bootstrapAvatarFromThinkingSubmission({
      userId: user.id,
      questionnaireId: savedQuestionnaire.id,
      snapshot: builtProfile.snapshot,
      summary: builtProfile.summary,
    });
    if (!bootstrapped) {
      return Response.json({ error: "人设已保存，但数字分身初始化失败，请稍后重试。" }, { status: 503 });
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
    return Response.json({ error: "人设保存失败，请稍后再试。" }, { status: 503 });
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
  setAnswer("identity", "role_context", input.persona);
  setAnswer("audience", "specialty", input.specialty);
  setAnswer("audience", "primary_audience", input.targetAudience);
  setAnswer("voice", "tone_preference", input.topicPreference);

  function setAnswer(sectionId: string, questionId: string, value: string) {
    if (answers[sectionId]?.[questionId]) answers[sectionId][questionId].items[0].content = value;
  }
}
