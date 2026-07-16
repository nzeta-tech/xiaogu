"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { apiPath, appPath } from "@/lib/client/url";
import type { ThinkingProfileSnapshot, ThinkingProfileSummary } from "@/lib/thinking/profile-snapshot";

type Profile = {
  display_name?: string;
  ip_tagline?: string;
  profile_summary?: string;
  brand_keywords?: string[];
  content_style_summary?: string;
};

type ThinkingSummary = {
  ready: boolean;
  completion: number;
  styleSummary: string;
  completedCount: number;
  totalCount: number;
};

type Me = {
  name?: string;
  email?: string;
  role?: string;
};

type QuestionnaireMeta = {
  id: string;
  status: string;
  completionPercent: number;
  updatedAt: string;
};

type ThinkingProfileSnapshotMeta = {
  id: string;
  questionnaireId: string;
  version: number;
  updatedAt: string;
  snapshot: ThinkingProfileSnapshot;
  summary: ThinkingProfileSummary;
};

export function ProfilePageClient() {
  const [profile, setProfile] = useState<Profile>({
    display_name: "",
    ip_tagline: "",
    profile_summary: "",
    brand_keywords: [],
    content_style_summary: "",
  });
  const [summary, setSummary] = useState<ThinkingSummary | null>(null);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireMeta | null>(null);
  const [thinkingProfileSnapshot, setThinkingProfileSnapshot] = useState<ThinkingProfileSnapshotMeta | null>(null);

  const resourceCount = useMemo(
    () => {
      if (thinkingProfileSnapshot?.summary) {
        return [
          thinkingProfileSnapshot.summary.one_liner,
          thinkingProfileSnapshot.summary.positioning_hint,
          thinkingProfileSnapshot.summary.audience_hint,
          thinkingProfileSnapshot.summary.style_hint,
        ].filter((value) => value.trim()).length;
      }
      return [profile.display_name, profile.ip_tagline, profile.profile_summary].filter((value) => (value ?? "").trim()).length;
    },
    [profile, thinkingProfileSnapshot],
  );
  const hasThinking = Boolean(thinkingProfileSnapshot || summary?.ready);
  const hasAnyAnswer = Boolean(questionnaire || thinkingProfileSnapshot || resourceCount > 0);
  const progress = questionnaire?.completionPercent ?? summary?.completion ?? (hasAnyAnswer ? 50 : 0);
  const completedCount = questionnaire ? Math.round((questionnaire.completionPercent / 100) * (summary?.totalCount ?? 25)) : summary?.completedCount ?? resourceCount;
  const totalCount = summary?.totalCount ?? 25;

  useEffect(() => {
    async function loadProfile() {
      const [profileResponse, meResponse] = await Promise.all([
        fetch(apiPath("/api/thinking")),
        fetch(apiPath("/api/auth/me")),
      ]);
      const profilePayload = (await profileResponse.json()) as {
        profile?: Profile;
        summary?: ThinkingSummary;
        questionnaire?: QuestionnaireMeta | null;
        thinkingProfileSnapshot?: ThinkingProfileSnapshotMeta | null;
      };
      const mePayload = (await meResponse.json()) as { user?: Me };
      if (profilePayload.profile) setProfile(profilePayload.profile);
      setSummary(profilePayload.summary ?? null);
      setQuestionnaire(profilePayload.questionnaire ?? null);
      setThinkingProfileSnapshot(profilePayload.thinkingProfileSnapshot ?? null);
      void mePayload;
    }

    void loadProfile();
  }, []);

  return (
    <div className="user-thinking-page thinkingPage">
      <section className="page-description">
        <p className="description-title">创建你的思维，自动分析专属写作风格</p>
        <p className="description-subtitle">让 AI 创作更贴近你的真实经验、服务对象和表达边界</p>
      </section>

      <div className="main-content">
        <div className="left-panel">
          <section className="questionnaire-card">
            <div className="card-header">
              <div className="card-title">
                <span className="card-title-icon el-icon" aria-hidden="true">📝</span>
                <span>我的思维</span>
              </div>
            </div>

            <div className="card-content">
              <div className="questionnaire-status">
                {!hasAnyAnswer ? (
                  <div className="status-display">
                    <div className="status-icon none" aria-hidden="true">📝</div>
                    <span className="status-text">还未创建思维</span>
                  </div>
                ) : hasThinking ? (
                  <div className="status-display">
                    <div className="status-icon completed" aria-hidden="true">✓</div>
                    <div className="status-info">
                      <span className="el-tag el-tag--success el-tag--large">已完成</span>
                      <span className="status-time">{formatUpdatedAt(questionnaire?.updatedAt)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="status-display">
                    <div className="progress-circle" style={{ "--progress": `${progress}%` } as CSSProperties}>
                      <span className="progress-text">{progress}%</span>
                    </div>
                    <div className="status-info">
                      <span className="el-tag el-tag--warning el-tag--large">问卷草稿</span>
                      <div className="progress-details">
                        <span>必填 {completedCount}/{totalCount}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="action-section">
                <a className="el-button el-button--primary el-button--large" href={appPath("/questionnaire")}>
                  {hasThinking ? "修改思维" : hasAnyAnswer ? "继续填写" : "创建思维"}
                </a>
              </div>
            </div>
          </section>

          {hasAnyAnswer ? (
            <div className="advanced-link">
              <button className="advanced-text" type="button">高级选项</button>
            </div>
          ) : null}

          <div className="thinking-tip">
            <span className="tip-icon" aria-hidden="true">💡</span>
            <span className="tip-text">提交思维会自动分析写作风格</span>
          </div>
        </div>

        <aside className="right-panel">
          <section className="writing-style-card">
            <div className="card-header">
              <div className="card-title">
                <span className="card-title-icon el-icon" aria-hidden="true">✍️</span>
                <span>我的写作风格</span>
              </div>
              <div className="header-meta">
                <span className={hasThinking ? "el-tag el-tag--success el-tag--small" : "el-tag el-tag--info el-tag--small"}>
                  {hasThinking ? "分析完毕" : "未完成"}
                </span>
              </div>
            </div>

            <div className="card-content">
              {hasThinking ? (
                <div className="style-completed">
                  <div className="status-icon completed" aria-hidden="true">✓</div>
                  <div className="status-info">
                    <span className="el-tag el-tag--success el-tag--large">已完成</span>
                    <span className="status-time">{formatUpdatedAt(questionnaire?.updatedAt)}</span>
                  </div>
                </div>
              ) : hasAnyAnswer ? (
                <div className="style-empty">
                  <div className="style-status-steps">
                    <div className="status-step completed">
                      <span className="step-icon">✓</span>
                      <span className="step-text">您已提交思维</span>
                    </div>
                    <div className="status-step pending">
                      <span className="step-icon">2</span>
                      <span className="step-text">系统将自动为您分析写作风格</span>
                    </div>
                  </div>
                  <p className="auto-process-hint">写作风格分析由系统自动处理，如长时间未生成，请联系管理员</p>
                </div>
              ) : (
                <div className="style-empty">
                  <p className="empty-hint">创建思维后会自动分析您的写作风格</p>
                </div>
              )}

              {hasAnyAnswer ? (
                <div className="style-empty" style={{ marginTop: 16 }}>
                  {profile.display_name || profile.ip_tagline ? (
                    <p className="empty-hint">
                      {(profile.display_name || "未命名账号").trim()}
                      {profile.ip_tagline ? ` · ${profile.ip_tagline}` : ""}
                    </p>
                  ) : null}
                  {profile.brand_keywords?.length ? (
                    <p className="empty-hint">关键词：{profile.brand_keywords.join(" · ")}</p>
                  ) : null}
                  {profile.profile_summary ? <p className="auto-process-hint">{profile.profile_summary}</p> : null}
                  {!profile.profile_summary && thinkingProfileSnapshot?.summary?.positioning_hint ? (
                    <p className="auto-process-hint">{thinkingProfileSnapshot.summary.positioning_hint}</p>
                  ) : null}
                  {!profile.brand_keywords?.length && thinkingProfileSnapshot?.snapshot?.content_motifs?.pillar_topics?.length ? (
                    <p className="empty-hint">内容母题：{thinkingProfileSnapshot.snapshot.content_motifs.pillar_topics.slice(0, 3).join(" · ")}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function formatUpdatedAt(value?: string) {
  if (!value) return "刚刚更新";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
