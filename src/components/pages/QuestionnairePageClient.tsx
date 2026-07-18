"use client";

import { useEffect, useMemo, useState } from "react";
import { apiPath, appPath } from "@/lib/client/url";
import { usePageMeta } from "@/lib/client/page-meta";
import {
  createEmptyQuestionnaireAnswers,
  localQuestionnaireTemplate,
  type QuestionnaireAnswers,
  type QuestionnaireQuestion,
  type QuestionnaireQuestionType,
  type QuestionnaireTemplate,
} from "@/lib/thinking/questionnaire-template";
import type { ThinkingProfileSnapshot, ThinkingProfileSummary } from "@/lib/thinking/profile-snapshot";

type ThinkingProfilePayload = {
  profile?: {
    display_name?: string;
    ip_tagline?: string;
    profile_summary?: string;
  };
  questionnaire?: {
    id: string;
    status: string;
    completionPercent: number;
    updatedAt: string;
    answers: QuestionnaireAnswers;
    template?: QuestionnaireTemplate;
  } | null;
  thinkingProfileSnapshot?: {
    id: string;
    questionnaireId: string;
    version: number;
    updatedAt: string;
    snapshot: ThinkingProfileSnapshot;
    summary: ThinkingProfileSummary;
  } | null;
};

const storageKey = "ica-persona-questionnaire-draft-v3";
const questionnaireCharLimit = 30000;

export function QuestionnairePageClient() {
  const [template] = useState<QuestionnaireTemplate>(localQuestionnaireTemplate);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(() => createEmptyQuestionnaireAnswers(localQuestionnaireTemplate));
  const [lastSaved, setLastSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [autoSavePulse, setAutoSavePulse] = useState(false);
  usePageMeta({ title: "数字分身 · 人设问卷", description: `数字分身 / 第 ${activeSectionIndex + 1} 部分`, status: submitting ? "提交中" : saving ? "保存中" : lastSaved ? "已保存" : "" });

  const activeSection = template.structure.sections[activeSectionIndex];

  const requiredQuestionCount = useMemo(
    () => template.structure.sections.reduce((total, section) => total + section.questions.filter((question) => question.is_required).length, 0),
    [template],
  );

  const optionalQuestionCount = useMemo(
    () => template.structure.sections.reduce((total, section) => total + section.questions.filter((question) => !question.is_required).length, 0),
    [template],
  );

  const completedRequired = useMemo(
    () =>
      template.structure.sections.reduce(
        (total, section) => total + section.questions.filter((question) => question.is_required && hasAnswer(answers, section.section_id, question.question_id)).length,
        0,
      ),
    [answers, template],
  );

  const completedOptional = useMemo(
    () =>
      template.structure.sections.reduce(
        (total, section) => total + section.questions.filter((question) => !question.is_required && hasAnswer(answers, section.section_id, question.question_id)).length,
        0,
      ),
    [answers, template],
  );

  const requiredProgress = requiredQuestionCount === 0 ? 0 : Math.round((completedRequired / requiredQuestionCount) * 100);
  const optionalProgress = optionalQuestionCount === 0 ? 0 : Math.round((completedOptional / optionalQuestionCount) * 100);
  const charCount = useMemo(() => countCharacters(answers), [answers]);
  const canSubmit = completedRequired === requiredQuestionCount;

  useEffect(() => {
    async function loadQuestionnaire() {
      const draft = readDraft();
      let payload: ThinkingProfilePayload = {};

      try {
        const response = await fetch(apiPath("/api/thinking"));
        if (response.ok) {
          payload = (await response.json()) as ThinkingProfilePayload;
        }
      } catch {
        payload = {};
      }

      const serverTemplate = payload.questionnaire?.template ?? template;
      const initial = createEmptyQuestionnaireAnswers(serverTemplate);

      if (payload.thinkingProfileSnapshot?.snapshot) {
        hydrateAnswersFromThinkingSnapshot(initial, payload.thinkingProfileSnapshot.snapshot);
      } else {
        hydrateAnswersFromThinkingProfile(initial, payload);
      }
      if (payload.questionnaire?.answers) {
        hydrateAnswersFromDraft(initial, payload.questionnaire.answers);
      }
      if (draft) {
        hydrateAnswersFromDraft(initial, draft);
      }

      setAnswers(initial);
      if (draft?._meta?.updatedAt) {
        setLastSaved(formatSavedTime(draft._meta.updatedAt));
      }
    }

    void loadQuestionnaire();
  }, [template]);

  useEffect(() => {
    if (!isDirty) return;

    const timer = window.setInterval(() => {
      void saveDraft(false, true);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [answers, isDirty]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function updateAnswer(sectionId: string, questionId: string, value: string) {
    setAnswers((current) => ({
      ...current,
      [sectionId]: {
        ...current[sectionId],
        [questionId]: {
          ...current[sectionId][questionId],
          items: [{ content: value, input_type: "text" }],
        },
      },
    }));
    setIsDirty(true);
  }

  async function saveDraft(showNotice = true, isAutoSave = false) {
    setSaving(true);
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...answers,
        _meta: { updatedAt: new Date().toISOString() },
      }),
    );
    const savedAt = new Date().toISOString();
    setLastSaved(formatSavedTime(savedAt));
    setIsDirty(false);
    setSaving(false);

    if (isAutoSave) {
      setAutoSavePulse(true);
      window.setTimeout(() => setAutoSavePulse(false), 1800);
      return;
    }

    if (showNotice) setNotice("草稿保存成功");
  }

  async function submitQuestionnaire() {
    if (!canSubmit) {
      setNotice("请先完成所有必填问题");
      return;
    }

    setSubmitting(true);
    const response = await fetch(apiPath("/api/thinking"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answers,
        status: "completed",
        profile: {
          persona: buildQuestionnaireSummary(answers, template),
          targetAudience: getAnswerByQuestionId(answers, template, "primary_audience"),
          specialty: getAnswerByQuestionId(answers, template, "specialty"),
          topicPreference: [
            getAnswerByQuestionId(answers, template, "tone_preference"),
            getAnswerByQuestionId(answers, template, "core_beliefs"),
          ].filter(Boolean).join("\n"),
          displayName: getAnswerByQuestionId(answers, template, "display_name"),
          ipTagline: summarizeQuestionnaireTagline(answers, template),
          profileSummary: summarizeQuestionnaireProfile(answers, template),
          brandKeywords: splitKeywords(getAnswerByQuestionId(answers, template, "identity_tags")),
          contentStyleSummary: getAnswerByQuestionId(answers, template, "tone_preference"),
        },
      }),
    }).catch(() => null);
    setSubmitting(false);

    if (!response) {
      setNotice("本地提交接口暂不可用，已保留当前问卷内容");
      return;
    }

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setNotice(payload.error ?? "提交问卷失败");
      return;
    }

    localStorage.removeItem(storageKey);
    setIsDirty(false);
    setNotice("提交成功，正在生成人设画像...");
    window.setTimeout(() => {
      location.href = appPath("/thinking");
    }, 900);
  }

  return (
    <div className="user-questionnaire-page">
      <div className="questionnaire-content">
        <div className="content-layout">
          <aside className="sidebar-wrapper">
            <div className="left-sidebar">
              <div className="sidebar-header">
                <a className="back-btn" href={appPath("/thinking")}>
                  <span aria-hidden="true">‹</span>
                  返回
                </a>
              </div>

              <section className="progress-card">
                <div className="progress-header">
                  <h3 className="card-title">填写进度</h3>
                  {lastSaved ? (
                    <div className="last-saved">
                      <span>{lastSaved}</span>
                      {autoSavePulse ? <span className="auto-save-tag">自动保存</span> : null}
                    </div>
                  ) : null}
                </div>

                {requiredQuestionCount > 0 ? <ProgressItem count={`${completedRequired}/${requiredQuestionCount}`} label="必填问题" percentage={requiredProgress} /> : null}
                {optionalQuestionCount > 0 ? <ProgressItem count={`${completedOptional}/${optionalQuestionCount}`} label="选填问题" percentage={optionalProgress} /> : null}

                <div className="char-count-item">
                  <div className="char-count-row">
                    <div className="char-count-label">
                      <span>字数</span>
                    </div>
                    <div className="char-count-info">
                      <span className="current-chars">{charCount.toLocaleString()}</span>
                      <span className="separator">/</span>
                      <span className="limit-chars">{formatQuestionnaireLimit(questionnaireCharLimit)}</span>
                    </div>
                  </div>
                </div>
              </section>

              <nav className="section-nav" aria-label="问卷目录">
                <h3 className="nav-title">问卷目录</h3>
                <div className="nav-list">
                  {template.structure.sections.map((section, index) => {
                    const completed = section.questions.filter((question) => hasAnswer(answers, section.section_id, question.question_id)).length;
                    const isDone = section.questions.length > 0 && completed === section.questions.length;
                    return (
                      <button
                        className={`nav-item ${activeSectionIndex === index ? "active" : ""} ${isDone ? "completed" : ""}`}
                        key={section.section_id}
                        onClick={() => setActiveSectionIndex(index)}
                        type="button"
                      >
                        <span className="nav-item-number">{index + 1}</span>
                        <span className="nav-item-content">
                          <span className="nav-item-title">{section.section_title}</span>
                          <span className="nav-item-meta">{completed}/{section.questions.length} 问题</span>
                        </span>
                        {isDone ? <span className="nav-item-check">✓</span> : null}
                      </button>
                    );
                  })}
                </div>
              </nav>
            </div>
          </aside>

          <main className="questionnaire-main-content">
            <div className="fixed-header">
              <div className="content-header">
                <div className="title-row">
                  <h1 className="questionnaire-title">{template.title}</h1>
                  <div className="title-actions">
                    <button className="action-btn save-btn" disabled={saving} onClick={() => void saveDraft()} type="button">
                      {saving ? "保存中" : "保存"}
                    </button>
                    <button className="action-btn submit-btn" disabled={!canSubmit || submitting} onClick={() => void submitQuestionnaire()} type="button">
                      {submitting ? "提交中" : "提交"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="section-header">
                <h2 className="section-title">
                  <span className="section-number">{activeSectionIndex + 1}</span>
                  {activeSection.section_title}
                </h2>
                {activeSection.section_description ? <p className="section-description">{activeSection.section_description}</p> : null}
              </div>
            </div>

            <div className="scrollable-content">
              <div className="section-content">
                <div className="questions-list">
                  {activeSection.questions.map((question, index) => (
                    <QuestionItem
                      index={index}
                      key={question.question_id}
                      onChange={(value) => updateAnswer(activeSection.section_id, question.question_id, value)}
                      question={question}
                      value={getAnswerValue(answers, activeSection.section_id, question.question_id)}
                    />
                  ))}
                </div>
              </div>

              <div className="section-nav-btns">
                <button disabled={activeSectionIndex === 0} onClick={() => setActiveSectionIndex((current) => Math.max(0, current - 1))} type="button">
                  <span aria-hidden="true">‹</span>
                  上一章节
                </button>
                {activeSectionIndex < template.structure.sections.length - 1 ? (
                  <button onClick={() => setActiveSectionIndex((current) => Math.min(template.structure.sections.length - 1, current + 1))} type="button">
                    下一章节
                    <span aria-hidden="true">›</span>
                  </button>
                ) : null}
              </div>
            </div>

            {notice ? <div className="questionnaire-toast">{notice}</div> : null}
          </main>
        </div>
      </div>
    </div>
  );
}

function ProgressItem({ count, label, percentage }: { count: string; label: string; percentage: number }) {
  return (
    <div className="progress-item">
      <div className="progress-label">
        <span className="label-text">{label}</span>
        <span className="label-count">{count}</span>
      </div>
      <div className="progress-bar-wrapper">
        <div className="progress-bar">
          <span style={{ width: `${percentage}%` }} />
        </div>
      </div>
    </div>
  );
}

function QuestionItem({
  onChange,
  question,
  value,
  index,
}: {
  onChange: (value: string) => void;
  question: QuestionnaireQuestion;
  value: string;
  index: number;
}) {
  const needsAttention = question.is_required && !value.trim();

  return (
    <div className={`question-item ${needsAttention ? "needs-attention" : ""}`}>
      <div className="question-input">
        <div className="question-header">
          <h3 className="question-title">
            <span className="question-number">{index + 1}</span>
            <span className="question-text">{question.question_text}</span>
            <span className={question.is_required ? "question-tag required required-tag" : "question-tag"}>{question.is_required ? "必填" : getQuestionBadgeLabel(question)}</span>
          </h3>
          {question.helper_text ? <p className="question-helper">{question.helper_text}</p> : null}
        </div>
        <div className="question-content">
          {question.input_type === "choice" ? (
            <div className="question-choice-wrap">
              {question.choice_labels ? (
                <div className="question-choice-poles">
                  <span>{question.choice_labels.left}</span>
                  <span>{question.choice_labels.right}</span>
                </div>
              ) : null}
              <div className="question-choice-grid" role="radiogroup" aria-label={question.question_text}>
                {question.options?.map((option) => (
                  <button
                    aria-checked={value === option.value}
                    className={`question-choice-option ${value === option.value ? "selected" : ""}`}
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    role="radio"
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <textarea placeholder={question.placeholder || "请输入..."} value={value} onChange={(event) => onChange(event.target.value)} />
          )}
        </div>
      </div>
    </div>
  );
}

function getAnswerValue(answers: QuestionnaireAnswers, sectionId: string, questionId: string) {
  return answers[sectionId]?.[questionId]?.items[0]?.content ?? "";
}

function hasAnswer(answers: QuestionnaireAnswers, sectionId: string, questionId: string) {
  return Boolean(getAnswerValue(answers, sectionId, questionId).trim());
}

function countCharacters(answers: QuestionnaireAnswers) {
  return Object.values(answers)
    .flatMap((section) => Object.values(section))
    .flatMap((node) => node.items)
    .map((item) => item.content.trim())
    .filter(Boolean)
    .join("\n").length;
}

function formatSavedTime(iso: string) {
  return `上次保存于 ${new Date(iso).toLocaleString("zh-CN", { hour12: false })}`;
}

function getQuestionBadgeLabel(question: QuestionnaireQuestion) {
  const typeLabel = getQuestionTypeLabel(question.input_type);
  return typeLabel ? `${question.is_required ? "必填" : "选填"} · ${typeLabel}` : question.is_required ? "必填" : "选填";
}

function getQuestionTypeLabel(inputType: QuestionnaireQuestionType) {
  if (inputType === "voice") return "语音";
  if (inputType === "text_or_voice") return "文字/语音";
  return "";
}

function formatQuestionnaireLimit(limit: number) {
  return limit >= 10000 ? `${limit / 10000}万` : String(limit);
}

function hydrateAnswersFromDraft(initial: QuestionnaireAnswers, draft: QuestionnaireAnswers & { _meta?: { updatedAt?: string } }) {
  Object.entries(initial).forEach(([sectionId, questions]) => {
    Object.keys(questions).forEach((questionId) => {
      const value = draft?.[sectionId]?.[questionId]?.items?.[0]?.content;
      if (typeof value === "string") {
        initial[sectionId][questionId].items[0].content = value;
      }
    });
  });
}

function hydrateAnswersFromThinkingProfile(initial: QuestionnaireAnswers, payload: ThinkingProfilePayload) {
  void initial;
  void payload;
}

function hydrateAnswersFromThinkingSnapshot(initial: QuestionnaireAnswers, snapshot: ThinkingProfileSnapshot) {
  setInitialAnswer(initial, "display_name", snapshot.identity_profile.display_name);
  setInitialAnswer(initial, "role_context", snapshot.identity_profile.life_roles.join("\n"));
  setInitialAnswer(initial, "career_path", snapshot.identity_profile.career_path);
  setInitialAnswer(initial, "credentials", snapshot.identity_profile.honors.join("\n"));
  setInitialAnswer(initial, "identity_tags", snapshot.identity_profile.core_identity.join("\n"));
  setInitialAnswer(initial, "turning_points", snapshot.identity_profile.turning_points.join("\n"));
  setInitialAnswer(initial, "primary_audience", snapshot.audience_profile.primary_audience);
  setInitialAnswer(initial, "common_questions", snapshot.audience_profile.common_questions.join("\n"));
  setInitialAnswer(initial, "client_pains", snapshot.audience_profile.client_pains.join("\n"));
  setInitialAnswer(initial, "trust_evidence", snapshot.trust_signals.client_quotes.join("\n"));
  setInitialAnswer(initial, "case_stories", snapshot.trust_signals.case_signals.join("\n"));
  setInitialAnswer(initial, "content_status", snapshot.expression_style.style_summary);
  setInitialAnswer(initial, "tone_preference", snapshot.expression_style.tone.join("\n"));
  setInitialAnswer(initial, "core_beliefs", snapshot.belief_system.believes.join("\n"));
  setInitialAnswer(initial, "boundaries", snapshot.belief_system.disbelieves.join("\n"));
  setInitialAnswer(initial, "time_budget", snapshot.expression_style.time_budget);
}

function collectSectionAnswerText(answers: QuestionnaireAnswers, sectionId?: string) {
  if (!sectionId || !answers[sectionId]) return "";
  return Object.values(answers[sectionId])
    .map((node) => node.items[0]?.content?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

function buildQuestionnaireSummary(answers: QuestionnaireAnswers, template: QuestionnaireTemplate) {
  return template.structure.sections
    .map((section) => {
      const text = collectSectionAnswerText(answers, section.section_id);
      return text ? `${section.section_title}\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function summarizeQuestionnaireTagline(answers: QuestionnaireAnswers, template: QuestionnaireTemplate) {
  const name = getAnswerByQuestionId(answers, template, "display_name").trim();
  const tags = splitKeywords(getAnswerByQuestionId(answers, template, "identity_tags"));
  const audience = getAnswerByQuestionId(answers, template, "primary_audience").split("\n").find(Boolean) ?? "";
  return [name, tags.slice(0, 2).join("·"), audience ? `服务${audience.slice(0, 18)}` : ""].filter(Boolean).join("·").slice(0, 80);
}

function summarizeQuestionnaireProfile(answers: QuestionnaireAnswers, template: QuestionnaireTemplate) {
  const career = getAnswerByQuestionId(answers, template, "career_path");
  const specialty = getAnswerByQuestionId(answers, template, "specialty");
  const belief = getAnswerByQuestionId(answers, template, "core_beliefs");
  return [career, specialty, belief].filter(Boolean).join("\n").slice(0, 500);
}

function splitKeywords(raw: string) {
  return raw
    .split(/[，,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function getAnswerByQuestionId(answers: QuestionnaireAnswers, template: QuestionnaireTemplate, questionId: string) {
  const section = template.structure.sections.find((item) => item.questions.some((question) => question.question_id === questionId));
  return section ? getAnswerValue(answers, section.section_id, questionId) : "";
}

function setInitialAnswer(answers: QuestionnaireAnswers, questionId: string, value?: string) {
  for (const section of Object.values(answers)) {
    if (section[questionId]) {
      section[questionId].items[0].content = value ?? "";
      return;
    }
  }
}

function readDraft(): (QuestionnaireAnswers & { _meta?: { updatedAt?: string } }) | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as QuestionnaireAnswers & { _meta?: { updatedAt?: string } }) : null;
  } catch {
    return null;
  }
}
