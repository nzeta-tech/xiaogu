"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getCreationAppFamily,
  getCreationExampleBySlug,
  getCreationExampleForApp,
  type CreationApp,
  type CreationAppFamily,
} from "@/lib/apps/catalog";
import { getEntryAdjustedApp, shouldShowRealExample } from "@/lib/apps/entry-app";
import { apiPath, appPath } from "@/lib/client/url";
import { usePageMeta } from "@/lib/client/page-meta";
import { CreationExamplePageClient } from "@/components/pages/CreationExamplePageClient";
import type { AvatarVisualAsset } from "@/lib/avatar/types";
import { CREATION_NETWORK_ERROR, getCreationUserError } from "@/lib/creation/errors";

type FieldValue = string | string[];

type SpeechRecognitionEventLike = Event & {
  resultIndex?: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function CreationAppPageClient({ app }: { app: CreationApp }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceEntry = searchParams.get("entry") ?? "";
  const pageApp = getEntryAdjustedApp(app, workspaceEntry);
  const appFamily = getCreationAppFamily(app.slug);
  const isImageCard = appFamily === "image-card";
  const isWriteCopy = appFamily === "write-copy";
  const isLeadCopy = app.slug === "lead-copy";
  const isMultiChannelPolishLayout = app.slug === "traffic-copy" || app.slug === "marketing-copy";
  const isLeadPackage = app.slug === "lead-package";
  const isLiveScript = app.slug === "live-script";
  const isGeneralContent = app.slug === "general-content";
  const isTopicPicker = appFamily === "topic-picker";
  const isWechatImages = appFamily === "wechat-images";
  const isPolicyRenewalCard = app.slug === "policy-renewal-card";
  const isXiaohongshuCheck = appFamily === "xiaohongshu-check";
  const isPolicyDiagnosis = app.slug === "policy-diagnosis";
  const isVideoScriptPolish = appFamily === "polish-video";
  const isWechatArticlePolish = appFamily === "polish-wechat-article";
  const isVoiceNoteEntry = app.slug === "write-copy" && workspaceEntry === "voice-note-copy";
  const isVoiceNoteSubpage = isWriteCopy && isVoiceNoteEntry;
  const isRecruitScriptEntry = app.slug === "team-recruit" && workspaceEntry === "recruit-script";
  const isRecruitFollowupEntry = app.slug === "team-recruit" && workspaceEntry === "recruit-followup";
  const isRecruitEntry = isRecruitScriptEntry || isRecruitFollowupEntry;
  const isCompactRecruitPage = isRecruitEntry;
  const isIpPositioningEntry = app.slug === "ip-positioning" && workspaceEntry === "ip-positioning";
  const isPersonalityCardEntry = app.slug === "ip-positioning" && workspaceEntry === "personality-card";
  const isBreakthroughEntry = app.slug === "breakthrough" && workspaceEntry === "breakthrough";
  const hasRealExample = shouldShowRealExample(app.slug, workspaceEntry);
  const isCompactWechatFlow = isWechatImages || isWechatArticlePolish;
  const isCompactWriteCopyFlow = isWriteCopy;
  const exampleSlug = searchParams.get("example");
  const activeExample = (exampleSlug ? getCreationExampleBySlug(exampleSlug) : null) ?? getCreationExampleForApp(app.slug, pageApp.exampleTitle);
  const filteredFields = pageApp.fields.filter((field) => {
    if ((isLeadCopy || isWriteCopy) && field.id === "targets") return false;
    return true;
  });
  const leadCopyTargetOptions = isLeadCopy ? (pageApp.fields.find((field) => field.id === "targets")?.options ?? []) : [];
  const writeCopyTargetOptions = isWriteCopy ? (pageApp.fields.find((field) => field.id === "targets")?.options ?? []) : [];
  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    const from = searchParams.get("from");
    const initialValues = createInitialValues(pageApp, exampleSlug ? activeExample : null, from === "workspace" || from === "create");
    const initialPrompt = searchParams.get("prompt")?.trim();
    const promptField = pageApp.fields.find((field) => field.type === "textarea" || field.type === "text" || field.type === "text_or_file");
    return initialPrompt && promptField ? { ...initialValues, [promptField.id]: initialPrompt } : initialValues;
  });
  const [loading, setLoading] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [error, setError] = useState("");
  const [draftStatus, setDraftStatus] = useState<"restored" | "saving" | "saved" | "">("");
  const [voiceFieldId, setVoiceFieldId] = useState<string | null>(null);
  const [voicePaused, setVoicePaused] = useState(false);
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const [uploadNames, setUploadNames] = useState<Record<string, string>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [uploadSuccess, setUploadSuccess] = useState<Record<string, string>>({});
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
  const [showAllWechatStyles, setShowAllWechatStyles] = useState(false);
  const [avatarPhotos, setAvatarPhotos] = useState<AvatarVisualAsset[]>([]);
  const [avatarPhotosLoading, setAvatarPhotosLoading] = useState(isImageCard || isPersonalityCardEntry || isWechatImages || isPolicyRenewalCard);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const valuesRef = useRef(values);
  const voiceSessionRef = useRef<{ fieldId: string; initialValue: FieldValue | undefined; segmentBaseValue: FieldValue | undefined } | null>(null);
  const voiceCancelingRef = useRef(false);
  const voiceCompletingRef = useRef(false);
  const voiceSupported = useMemo(() => Boolean(getSpeechRecognitionConstructor()), []);
  const draftKey = `creation-draft:${workspaceEntry || app.slug}`;
  const requiredFields = pageApp.fields.filter((field) => field.required);
  const completedRequiredFields = requiredFields.filter((field) => !isEmpty(values[field.id]));
  const missingRequiredFields = requiredFields.filter((field) => isEmpty(values[field.id]));
  const completionPercent = requiredFields.length ? Math.round((completedRequiredFields.length / requiredFields.length) * 100) : 100;
  const creationFrom = searchParams.get("from");
  const creationReturnHref = creationFrom === "dashboard" || creationFrom === "today" ? appPath("/today") : appPath("/create");
  const creationReturnLabel = creationFrom === "dashboard" || creationFrom === "today" ? "返回今日工作台" : "返回获客创作";
  const experienceCopy = getAppExperienceCopy(app.slug, workspaceEntry);
  const breakthroughGuideHref = appPath("/templates/breakthrough-growth-guide.md");
  const wechatArticle = typeof values.article === "string" ? values.article : "";
  const wechatArticleAnalysis = useMemo(() => analyzeWechatArticle(wechatArticle), [wechatArticle]);
  const wechatStyleRecommendation = useMemo(() => recommendWechatImageStyle(wechatArticle), [wechatArticle]);
  const wechatStyleOptions = pageApp.fields.find((field) => field.id === "style")?.options ?? [];
  const visibleFields = (isWechatImages
    ? [...filteredFields].sort((left, right) => (left.id === "article" ? -1 : right.id === "article" ? 1 : 0))
    : filteredFields
  ).filter((field) => !isPolicyRenewalCard || values.avatar_visual_mode === "yes" || !["reference_image", "portrait_treatment"].includes(field.id));

  usePageMeta({
    title: `${pageApp.name} · 新建创作`,
    description: `获客创作 / ${pageApp.name}`,
    status: loading ? "生成中" : draftStatus === "saved" ? "已保存" : "",
  });

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (!voiceFieldId || voicePaused) return undefined;
    const timer = window.setInterval(() => setVoiceElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [voiceFieldId, voicePaused]);

  useEffect(() => {
    if (!showAllWechatStyles) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAllWechatStyles(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showAllWechatStyles]);

  useEffect(() => {
    if (!isImageCard && !isPersonalityCardEntry && !isWechatImages && !isPolicyRenewalCard) return;
    const controller = new AbortController();
    void fetch(apiPath("/api/avatar/photos"), { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ photos?: AvatarVisualAsset[] }> : { photos: [] })
      .then((payload) => {
        const photos = payload.photos ?? [];
        setAvatarPhotos(photos);
        if (isPersonalityCardEntry) {
          const primary = photos.find((photo) => photo.is_primary && photo.status === "active" && photo.allow_creation);
          if (primary) setValues((current) => Array.isArray(current.avatar_visual_asset_ids) && current.avatar_visual_asset_ids.length > 0 ? current : { ...current, avatar_visual_asset_ids: [primary.id], avatar_visual_mode: "yes" });
        }
      })
      .catch((fetchError) => {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        setAvatarPhotos([]);
      })
      .finally(() => { if (!controller.signal.aborted) setAvatarPhotosLoading(false); });
    return () => controller.abort();
  }, [isImageCard, isPersonalityCardEntry, isWechatImages, isPolicyRenewalCard]);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(draftKey);
    if (!saved) return;
    try {
      const restored = JSON.parse(saved) as Record<string, FieldValue>;
      const frame = window.requestAnimationFrame(() => {
        setValues((current) => ({ ...current, ...restored }));
        setDraftStatus("restored");
      });
      return () => window.cancelAnimationFrame(frame);
    } catch {
      window.sessionStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem(draftKey, JSON.stringify(values));
      setDraftStatus("saved");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftKey, values]);

  async function handleSubmit() {
    const missingField = pageApp.fields.find((field) => field.required && isEmpty(values[field.id]));
    if (missingField) {
      setError(`${missingField.label}还没有填写。`);
      window.requestAnimationFrame(() => document.getElementById(`creation-field-${missingField.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    const selectedVisualIds = Array.isArray(values.avatar_visual_asset_ids) ? values.avatar_visual_asset_ids : [];
    const needsAvatarPhoto = isPersonalityCardEntry || isImageCard && values.draw_portrait === "yes" || (isWechatImages || isPolicyRenewalCard) && values.avatar_visual_mode === "yes";
    if (needsAvatarPhoto && selectedVisualIds.length === 0 && isEmpty(values.reference_image)) {
      setError("请选择数字分身形象照，或临时上传一张形象照。");
      window.requestAnimationFrame(() => document.getElementById("creation-avatar-visual-picker")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }

    setLoading(true);
    setError("");
    window.sessionStorage.setItem(draftKey, JSON.stringify(values));

    let response: Response;
    try {
      response = await fetch(apiPath(`/api/creation/apps/${app.slug}/prepare`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { ...values, app_entry: workspaceEntry || "" } }),
      });
    } catch {
      setError(CREATION_NETWORK_ERROR);
      setLoading(false);
      return;
    }

    const payload = (await response.json().catch(() => ({ error: CREATION_NETWORK_ERROR }))) as {
      error?: string;
      work?: { id?: string };
    };

    if (!response.ok || !payload.work?.id) {
      setError(getCreationUserError(payload.error, CREATION_NETWORK_ERROR));
      setLoading(false);
      return;
    }

    router.push(appPath(`/works/${payload.work.id}?from=creation-works&entry=${workspaceEntry || app.slug}`));
  }

  function updateField(fieldId: string, nextValue: FieldValue) {
    setDraftStatus("saving");
    setValues((current) => {
      if (fieldId === "draw_portrait" && nextValue === "yes" && (!Array.isArray(current.avatar_visual_asset_ids) || current.avatar_visual_asset_ids.length === 0)) {
        const primary = avatarPhotos.find((photo) => photo.is_primary && photo.status === "active" && photo.allow_creation);
        return { ...current, [fieldId]: nextValue, ...(primary ? { avatar_visual_asset_ids: [primary.id], avatar_visual_mode: "yes" } : {}) };
      }
      return { ...current, [fieldId]: nextValue };
    });
  }

  function openFilePicker(fieldId: string) {
    document.getElementById(`image-upload-${fieldId}`)?.click();
  }

  async function handleFileChange(fieldId: string, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setUploadErrors((current) => ({ ...current, [fieldId]: "文件不能超过 10MB。" }));
      return;
    }

    setUploadNames((current) => ({ ...current, [fieldId]: file.name }));
    setUploadErrors((current) => ({ ...current, [fieldId]: "" }));
    setUploadSuccess((current) => ({ ...current, [fieldId]: "" }));

    if (fieldId === "reference_image") {
      if (!file.type.startsWith("image/")) {
        setUploadErrors((current) => ({ ...current, [fieldId]: "请上传 JPG、PNG 或 WebP 图片。" }));
        return;
      }
      const encoded = await readFileAsDataUrl(file).catch(() => "");
      updateField(fieldId, encoded || file.name);
      return;
    }

    if (fieldId === "policy_document") {
      setUploadingFields((current) => ({ ...current, [fieldId]: true }));
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(apiPath("/api/creation/policy-renewal-extract"), {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json().catch(() => ({ error: "解析服务没有返回有效回应，可能是网络中断或服务暂时不可用。请检查网络后重试。" }))) as {
          fields?: Record<string, string>;
          missing?: string[];
          error?: string;
        };
        if (!response.ok) {
          setUploadErrors((current) => ({ ...current, [fieldId]: payload.error ?? "保单解析失败，请换一个文件重试。" }));
          return;
        }
        const parsedFields = Object.fromEntries(
          Object.entries(payload.fields ?? {}).filter(([, fieldValue]) => typeof fieldValue === "string" && fieldValue.trim()),
        );
        setValues((current) => ({
          ...current,
          policy_document: file.name,
          ...parsedFields,
        }));
        const parsedCount = Object.keys(parsedFields).length;
        const missingCount = Array.isArray(payload.missing) ? payload.missing.length : 0;
        setUploadSuccess((current) => ({
          ...current,
          [fieldId]:
            parsedCount > 0
              ? `已识别 ${parsedCount} 项${missingCount > 0 ? `，还有 ${missingCount} 项需手动补充` : "，表单已自动回填"}。`
              : "已完成解析，但暂未识别出标准字段，请手动补充。",
        }));
        return;
      } catch {
        setUploadErrors((current) => ({ ...current, [fieldId]: "保单文件没有成功送到解析服务，可能是网络中断或服务暂时不可用。请检查网络后重试。" }));
      } finally {
        setUploadingFields((current) => ({ ...current, [fieldId]: false }));
      }
    }

    setUploadingFields((current) => ({ ...current, [fieldId]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(apiPath("/api/creation/import-text"), {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({ error: "解析服务没有返回有效回应，可能是网络中断或服务暂时不可用。请检查网络后重试。" }))) as {
        text?: string;
        error?: string;
      };
      if (!response.ok) {
        setUploadErrors((current) => ({ ...current, [fieldId]: payload.error ?? "文件解析失败，请换一个文件重试。" }));
        return;
      }
      if (!payload.text?.trim()) {
        setUploadErrors((current) => ({ ...current, [fieldId]: "文件为空，暂时没有可导入的文本。" }));
        return;
      }
      setValues((current) => ({
        ...current,
        [fieldId]: appendTextValue(current[fieldId], payload.text ?? ""),
      }));
      setUploadSuccess((current) => ({ ...current, [fieldId]: "文件内容已导入。" }));
    } catch {
      setUploadErrors((current) => ({ ...current, [fieldId]: "文件没有成功送到解析服务，可能是网络中断或服务暂时不可用。请检查网络后重试。" }));
    } finally {
      setUploadingFields((current) => ({ ...current, [fieldId]: false }));
    }
  }

  function startVoiceInput(fieldId: string) {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setError("当前浏览器不支持语音输入。");
      return;
    }

    if (voiceFieldId === fieldId && !voicePaused) return;

    if (voiceFieldId && voiceFieldId !== fieldId) {
      setError("请先完成或取消当前语音输入。");
      return;
    }

    if (!voiceSessionRef.current || voiceSessionRef.current.fieldId !== fieldId) {
      voiceSessionRef.current = {
        fieldId,
        initialValue: valuesRef.current[fieldId],
        segmentBaseValue: valuesRef.current[fieldId],
      };
      setVoiceElapsed(0);
    } else {
      voiceSessionRef.current.segmentBaseValue = valuesRef.current[fieldId];
    }

    voiceCancelingRef.current = false;
    voiceCompletingRef.current = false;
    setVoiceFieldId(fieldId);
    setVoicePaused(false);
    setError("");

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "zh-CN";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .flatMap((result) => Array.from(result))
        .map((item) => item.transcript)
        .join("")
        .trim();
      if (!transcript) return;
      const session = voiceSessionRef.current;
      if (!session || session.fieldId !== fieldId) return;
      setValues((current) => ({
        ...current,
        [fieldId]: appendTextValue(session.segmentBaseValue, transcript),
      }));
    };
    recognition.onerror = () => {
      setError("语音输入失败，请再试一次。");
      resetVoiceInputState();
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (voiceCancelingRef.current) {
        const session = voiceSessionRef.current;
        if (session) {
          setValues((current) => ({ ...current, [session.fieldId]: session.initialValue ?? "" }));
        }
        resetVoiceInputState();
        return;
      }
      if (voiceCompletingRef.current) {
        resetVoiceInputState();
        return;
      }
      setVoicePaused(true);
    };
    recognition.start();
    recognitionRef.current = recognition;
  }

  function pauseVoiceInput() {
    if (!voiceFieldId) return;
    const session = voiceSessionRef.current;
    if (session) session.segmentBaseValue = valuesRef.current[voiceFieldId];
    setVoicePaused(true);
    recognitionRef.current?.stop();
  }

  function finishVoiceInput() {
    voiceCompletingRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    } else {
      resetVoiceInputState();
    }
  }

  function cancelVoiceInput() {
    const session = voiceSessionRef.current;
    voiceCancelingRef.current = true;
    if (session) {
      setValues((current) => ({ ...current, [session.fieldId]: session.initialValue ?? "" }));
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    } else {
      resetVoiceInputState();
    }
  }

  function resetVoiceInputState() {
    recognitionRef.current = null;
    voiceSessionRef.current = null;
    voiceCancelingRef.current = false;
    voiceCompletingRef.current = false;
    setVoiceFieldId(null);
    setVoicePaused(false);
    setVoiceElapsed(0);
  }

  return (
    <div className={buildAppPageClassName(appFamily, app.slug, workspaceEntry)}>
        <div className="page-content">
        <div className="page-back-bar pageBackBar">
          <a className="back-btn backLink" href={creationReturnHref}>← {creationReturnLabel}</a>
          <span className="subpageBreadcrumb">获客创作 / {pageApp.name}</span>
        </div>

        <section className={isImageCard ? "app-info-card imageCardHero" : isWriteCopy ? "app-info-card writeCopyHeroCard" : isWechatImages ? "app-info-card wechatImagesHeroCard" : isXiaohongshuCheck ? "app-info-card xiaohongshuCheckHeroCard" : isWechatArticlePolish ? "app-info-card wechatArticlePolishHeroCard" : isLiveScript ? "app-info-card liveScriptHeroCard" : "app-info-card"}>
          <div className="app-header">
            <span className="app-icon creationToolEmoji">{pageApp.emoji}</span>
            <div className="app-text">
              <h1 className="app-name">{pageApp.name}</h1>
              <p className="app-description">{pageApp.description}</p>
            </div>
            <div className="subpageTaskState" aria-label={`必填项完成 ${completedRequiredFields.length} / ${requiredFields.length}`}>
              <span>{completionPercent}%</span>
              <strong>{missingRequiredFields.length ? `还差 ${missingRequiredFields.length} 项` : "可以开始"}</strong>
            </div>
          </div>
          {isLeadCopy && !isMultiChannelPolishLayout ? (
            <div className="app-meta leadCopyMeta">
              <span>{app.points} 积分/次</span>
              {pageApp.badge ? <strong>{pageApp.badge}</strong> : null}
            </div>
          ) : isXiaohongshuCheck ? (
            <div className="app-meta xiaohongshuCheckMeta">
              <span>{app.points} 积分/次</span>
              <strong>审核型工具</strong>
            </div>
          ) : isPolicyDiagnosis ? (
            <div className="app-meta policyDiagnosisMeta">
              <span>{app.points} 积分/次</span>
              {pageApp.badge ? <strong>{pageApp.badge}</strong> : null}
              <em>工具型诊断页</em>
            </div>
          ) : !isGeneralContent && !isTopicPicker && !isWechatArticlePolish && !isVideoScriptPolish && !isMultiChannelPolishLayout && !isCompactWechatFlow && !isCompactWriteCopyFlow && !isCompactRecruitPage ? (
            <div className="app-meta">
              <span>{pageApp.points} 积分/次</span>
              {pageApp.badge ? <strong>{pageApp.badge}</strong> : null}
              {pageApp.requiresThinking ? <em>建议先完善人设</em> : null}
            </div>
          ) : null}
          {!isImageCard && !isLeadCopy && !isGeneralContent && !isTopicPicker && !isWechatArticlePolish && !isVideoScriptPolish && hasRealExample && activeExample && !isCompactWriteCopyFlow ? (
            <div className="creationAppExampleActions">
              <button className="creationAppCaseButton" onClick={() => setShowExample(true)} type="button">
                查看案例
              </button>
              <span className="creationAppCaseHint">{activeExample.title}</span>
            </div>
          ) : null}
          {exampleSlug ? <div className="resultSavedHint">已从功能示例进入。系统只使用你本次提交的素材，不会复写示例内容。</div> : null}
          <div className="creationOutcomeStrip">
            <div><span>建议准备</span><strong>{experienceCopy.input}</strong></div>
            <div><span>本次产出</span><strong>{experienceCopy.output}</strong></div>
          </div>
          {isGeneralContent && hasRealExample && activeExample ? (
            <div className="creationAppExampleActions generalContentExampleActions">
              <button className="creationAppCaseButton" onClick={() => setShowExample(true)} type="button">
                查看案例
              </button>
            </div>
          ) : null}
          {isLeadCopy && !isMultiChannelPolishLayout ? (
            <div className="leadCopyIntro">
              围绕引流转化目标，一次产出口播稿、小红书笔记和公众号文章。
            </div>
          ) : null}
          {isLeadPackage ? (
            <div className="leadPackageHeroBody">
              <div className="leadPackageHeroIntro">
                <strong>把一个保险主题扩成完整的引流资料包，不只写正文，还把领取动作和发布承接一起配齐。</strong>
                <p>围绕资料主题、领取福利和目标人群，一次完成资料定位、交付内容和引流动作。</p>
              </div>
              <div className="leadPackageHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>资料主题、福利钩子、目标人群</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>资料正文、目录结构、领取话术、发布文案</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>主题越具体，福利越清楚，生成内容越像可直接发出的资料产品</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isLiveScript ? (
            <div className="liveScriptHeroBody">
              <div className="liveScriptHeroIntro">
                <strong>只需写下一个直播观点，系统会帮你整理成完整的直播流程稿</strong>
                <p>把你想讲的主题、判断或要解决的问题写下来，系统会补齐开场、讲解、互动和收尾。</p>
              </div>
              <div className="liveScriptHeroChecklist">
                <div>
                  <span>适合输入</span>
                    <strong>一段完整观点，或几句想在直播间讲清楚的话</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>直播开场、节奏结构、重点讲解、互动承接和收口转化话术</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先把你最熟的真实表达写出来，越像你平时会讲的话，结果越自然</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isTopicPicker ? (
            <div className="topicPickerHeroBody">
              <div className="topicPickerHeroIntro">
                <strong>一次给你 6 个高质量选题，覆盖流量、信任、引流三个方向。</strong>
                <p>围绕你的平台、主题和人设画像，拆出可继续创作并能说明事实来源的选题方向。</p>
              </div>
              <div className="topicPickerHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>具体主题、主发平台、最近想重点讲的业务或活动</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>6 个选题，兼顾流量、信任、引流三类内容任务</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>主题越具体，越容易得到更贴近你当前业务的选题切口</strong>
                </div>
              </div>
              {hasRealExample && activeExample ? (
                <div className="creationAppExampleActions topicPickerExampleActions">
                  <button className="creationAppCaseButton" onClick={() => setShowExample(true)} type="button">
                    查看案例
                  </button>
                  <span className="creationAppCaseHint">{activeExample.title}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {isWriteCopy && !isCompactWriteCopyFlow && !isVoiceNoteSubpage ? (
            <div className="writeCopyHeroBody">
              <div className="writeCopyHeroIntro">
                <strong>{isVoiceNoteEntry ? "整理出独立观点、可引用金句和后续创作素材" : "分别生成口播稿、公众号、小红书和朋友圈内容"}</strong>
                <p>{isVoiceNoteEntry ? "这里专门用于录音稿拆解整理，不是默认的多平台批量分发。系统会先把学习、分享或培训录音整理成多个可复用内容片段。" : "可输入观点录音、文章、口播稿、聊天记录等素材。系统会先提炼你的核心表达，再拆成更适合不同发布场景的版本。"}</p>
              </div>
              <div className="writeCopyHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>{isVoiceNoteEntry ? "学习录音、分享逐字稿、培训笔记、聊天复盘" : "观点录音、文章、旧文案、培训笔记"}</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>{isVoiceNoteEntry ? "多个独立内容片段、金句和后续创作素材" : "可直接复制、导出、继续编辑"}</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>{isVoiceNoteEntry ? "先贴完整录音稿，再把其中值得单独展开的内容拆出来" : "先语音说想法，再补充要点"}</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isIpPositioningEntry ? (
            <div className="polishHeroBody">
              <div className="polishHeroIntro">
                <strong>结合数字分身和当前业务情况，梳理定位、标签与内容主线</strong>
                <p>这里更像思维驱动型定位页。包含定位分析、包装升级、个人传记文章，完成思维后可以直接开始创作。</p>
              </div>
              <div className="polishHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>账号现状、服务方向、客群轮廓、代表案例和当前卡点</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>定位分析、账号标签、个人传记、内容主线</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先完成人设画像，再补当前阶段最真实的业务现状</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isBreakthroughEntry ? (
            <div className="polishHeroBody">
              <div className="polishHeroIntro">
                <strong>有业务瓶颈、有卡点，就先把问题诊断清楚，再拉出破局动作清单</strong>
                <p>这页不是普通内容创作页，而是一套增长陪跑流程。建议先下载攻略文档、填好后上传，再围绕卡点生成破局路径。</p>
              </div>
              <div className="polishHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>当前瓶颈、业务背景、最近动作、卡住环节、已经试过的方法</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>问题诊断、短期动作、节奏安排、复盘指标</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先下载攻略模板整理，再粘贴或上传，结果会更接近增长陪跑的分析方式</strong>
                </div>
              </div>
              <div className="breakthroughActionRow">
                <a className="breakthroughGuideLink" download href={breakthroughGuideHref}>
                  下载破局攻略
                </a>
                <span className="breakthroughGuideHint">先按模板整理你的情况，再上传或粘贴，分析会更具体。</span>
              </div>
            </div>
          ) : null}
          {isPersonalityCardEntry ? (
            <div className="polishHeroBody">
              <div className="polishHeroIntro">
                <strong>个性名片不是定位长文，而是一张让人一眼记住你的展示卡</strong>
                <p>填写个人介绍、目标客户并上传清晰形象照，生成用于个人展示和传播的名片。</p>
              </div>
              <div className="polishHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>个人介绍、服务方向、代表标签、形象照</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>个性名片文案、展示结构、视觉风格方向</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先写一句最想让别人记住你的话，再补经历和照片</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isVideoScriptPolish ? null : null}
          {isWechatArticlePolish && !isCompactWechatFlow ? null : null}
          {isWechatImages ? (
            <div className="wechatImagesHeroBody">
              <div className="wechatImagesWorkflow" aria-label="公众号配图流程">
                <span className="active"><i>1</i>导入文章</span>
                <span><i>2</i>预览配图节点</span>
                <span><i>3</i>统一视觉风格</span>
                <span><i>4</i>生成 4 张配图</span>
              </div>
            </div>
          ) : null}
          {isXiaohongshuCheck ? (
            <div className="xiaohongshuCheckHeroBody">
              <div className="xiaohongshuCheckHeroIntro">
                <strong>小红书发出去前，先把容易卡流量和容易踩线的表达筛一遍。</strong>
                <p>这张二级页更偏“审核 + 修改建议”，不是从零重写一篇新笔记。输入现成文案后，会先指出潜在风险，再给更稳妥的替代表达方向。</p>
              </div>
              <div className="xiaohongshuCheckHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>准备发布的小红书文案、封面文案、评论区引导话术</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>风险点说明、违规位置提示、修改建议和更安全的改写方向</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先贴完整原文，再保留你最想表达的卖点，方便结果页逐段比对</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isPolicyDiagnosis ? (
            <div className="policyDiagnosisHeroBody">
              <div className="policyDiagnosisHeroIntro">
                <strong>先把家庭保单结构梳理清楚，再看缺口、重复和利益风险，不急着直接动方案。</strong>
                <p>这张二级页更接近工具型诊断页，而不是普通文案创作页。重点是把家庭成员、现有保单和你最担心的风险点说清楚，系统会按结构、责任边界、保费压力和保障缺口给出诊断。</p>
              </div>
              <div className="policyDiagnosisHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>家庭成员阶段、保单摘要、险种责任、保额保费、特别担心的问题</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>结构诊断、重复责任提醒、保障缺口、缴费压力与优化建议</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>按家庭成员分行整理保单，写得越像保单清单，诊断越稳</strong>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {isLeadPackage ? (
          <section className="leadPackageBriefingCard">
            <div className="leadPackageBriefingHeader">
              <div>
                <strong>怎么填，结果会更稳定</strong>
                <p>资料包页的关键是让用户一眼明白“这份资料值不值得领、怎么领、适合谁”。不要只写宽泛主题，尽量把场景和福利说具体。</p>
              </div>
              <span className="leadPackageBriefingBadge">资料包攻略</span>
            </div>
            <div className="leadPackageBriefingGrid">
              <article>
                <span>1. 资料主题</span>
                <strong>优先写具体问题或人群场景，比如宝妈医疗险避坑、家庭保单体检表</strong>
              </article>
              <article>
                <span>2. 领取福利</span>
                <strong>把评论词、私信词和可感知价值写清楚，方便系统补全承接动作</strong>
              </article>
              <article>
                <span>3. 目标人群</span>
                <strong>不要只写“客户”，最好写年龄、身份、家庭阶段或当前困扰</strong>
              </article>
            </div>
          </section>
        ) : null}


          {isWriteCopy && !isCompactWriteCopyFlow && !isVoiceNoteSubpage ? (
            <section className="writeCopyBriefingCard">
            <div className="writeCopyBriefingHeader">
              <div>
                <strong>怎么写，结果会更稳定</strong>
                <p>先扔素材，再选想生成的平台。素材越像你平时会说的话，结果越自然。</p>
              </div>
              <span className="writeCopyBriefingBadge">推荐先看案例</span>
            </div>
            <div className="writeCopyBriefingGrid">
              <article>
                <span>1. 素材输入</span>
                <strong>不要只写主题，尽量直接粘贴原话或原文</strong>
              </article>
              <article>
                <span>2. 风格选择</span>
                <strong>想保留个人表达，就选「更像自己」</strong>
              </article>
              <article>
                <span>3. 批量生成</span>
                <strong>一次多选口播、小红书、公众号、朋友圈</strong>
              </article>
            </div>
          </section>
        ) : null}

        {isLiveScript ? (
          <section className="liveScriptBriefingCard">
            <div className="liveScriptBriefingHeader">
              <div>
                <strong>怎么填，结果会更稳定</strong>
                <p>直播稿最怕只有主题没有细节。尽量把直播经验、目标客群、误区观点、产品卖点和你的真人经历写具体，脚本才会更像你能直接开讲的版本。</p>
              </div>
              <span className="liveScriptBriefingBadge">直播脚本攻略</span>
            </div>
            <div className="liveScriptBriefingGrid">
              <article>
                <span>1. 主题具体</span>
                <strong>不要只写“讲保险”，尽量写到具体险种、人群、场景或问题</strong>
              </article>
              <article>
                <span>2. 客群写细</span>
                <strong>年龄、身份、生活状态、认知和顾虑越清楚，脚本越有代入感</strong>
              </article>
              <article>
                <span>3. 误区和案例</span>
                <strong>把你最常遇到的误区、盲区、案例和问题写出来，最容易形成直播记忆点</strong>
              </article>
            </div>
          </section>
        ) : null}

        {isTopicPicker ? (
          <section className="topicPickerBriefingCard">
            <div className="topicPickerBriefingHeader">
              <div>
                <strong>怎么填，选题会更贴近发布场景</strong>
                <p>选题页最关键的是让系统知道你最近主讲什么、想在哪个平台发、这一轮更偏流量还是信任承接，而不是堆很多散碎素材。</p>
              </div>
              <span className="topicPickerBriefingBadge">选题攻略</span>
            </div>
            <div className="topicPickerBriefingGrid">
              <article>
                <span>1. 主题别太空</span>
                <strong>不要只写“保险”或“保障”，尽量细到高端医疗、儿童重疾、养老规划这类方向</strong>
              </article>
              <article>
                <span>2. 平台先定</span>
                <strong>视频号、小红书、公众号的切口不同，平台明确后选题会更贴近真实发布场景</strong>
              </article>
              <article>
                <span>3. 最近重点补一句</span>
                <strong>如果你最近在做活动、主推某类服务或想吸引某类客户，补一句会更像你当前的真实内容策略</strong>
              </article>
            </div>
          </section>
        ) : null}

        {isVideoScriptPolish ? null : null}
        {isXiaohongshuCheck ? (
          <section className="xiaohongshuCheckBriefingCard">
            <div className="xiaohongshuCheckBriefingHeader">
              <div>
                <strong>怎么贴内容，检查结果会更稳定</strong>
                <p>尽量贴完整的小红书文案，而不是只贴一句标题。这样系统才能同时检查绝对化表述、功效承诺、诱导动作和容易触发限流的敏感表达。</p>
              </div>
              <span className="xiaohongshuCheckBriefingBadge">发布前自检</span>
            </div>
            <div className="xiaohongshuCheckBriefingGrid">
              <article>
                <span>1. 贴完整文案</span>
                <strong>标题、正文、结尾引导最好一起贴，审核才不会漏掉前后语境</strong>
              </article>
              <article>
                <span>2. 保留原表达</span>
                <strong>先不要自己改太多，保留原始版本更容易定位真正的风险词和风险句</strong>
              </article>
              <article>
                <span>3. 重点看修改建议</span>
                <strong>结果页不只看哪里有问题，更要看可直接替换的表达方向</strong>
              </article>
            </div>
          </section>
        ) : null}
        {isPolicyDiagnosis ? (
          <section className="policyDiagnosisBriefingCard">
            <div className="policyDiagnosisBriefingHeader">
              <div>
                <strong>怎么填，诊断会更贴近真实需求</strong>
                <p>诊断页不是让你写一段抽象描述，而是先把家庭结构和保单责任摆平。尽量写清楚谁保了什么、保额多少、年缴多少、缴多久，以及你当前最担心的地方。</p>
              </div>
              <span className="policyDiagnosisBriefingBadge">诊断攻略</span>
            </div>
            <div className="policyDiagnosisBriefingGrid">
              <article>
                <span>1. 先写家庭结构</span>
                <strong>把家庭成员年龄、角色和当前保障状态写清楚，系统才知道风险应该落在谁身上</strong>
              </article>
              <article>
                <span>2. 保单尽量列表化</span>
                <strong>最好按“成员 / 险种 / 保额 / 年缴 / 缴费年限”整理，方便判断重复和缺口</strong>
              </article>
              <article>
                <span>3. 担心的问题单独说</span>
                <strong>如果你更担心现金流、重疾不足、寿险缺口或孩子保障，单独写出来会更贴近真实诊断场景</strong>
              </article>
            </div>
          </section>
        ) : null}
        {isBreakthroughEntry ? (
          <section className="polishBriefingCard breakthroughBriefingCard">
            <div className="polishBriefingHeader breakthroughBriefingHeader">
              <div>
                <strong>怎么填，破局方案会更可执行</strong>
                <p>不要只写一个笼统问题。把你最近的业务背景、做过的动作、最卡住的节点和希望先看到的结果讲清楚，系统才会更像一个陪跑顾问来拆问题。</p>
              </div>
              <span className="polishBriefingBadge">先下模板再填</span>
            </div>
            <div className="polishBriefingGrid breakthroughBriefingGrid">
              <article>
                <span>1. 卡点写具体</span>
                <strong>不要只写“没流量”或“没转化”，尽量写到哪个环节断了，比如有私信但没约到咨询。</strong>
              </article>
              <article>
                <span>2. 说清做过什么</span>
                <strong>把最近已经试过的内容节奏、承接动作、直播或私域动作写出来，方便系统判断问题不只是表面现象。</strong>
              </article>
              <article>
                <span>3. 结果先排优先级</span>
                <strong>先写你最想在 2 到 4 周内看到的变化，比如私信承接、稳定更新、成交动作复盘，不要一次想解决所有问题。</strong>
              </article>
            </div>
          </section>
        ) : null}

        <form className={isImageCard ? "create-form creationForm targetCreateForm imageCardCreateForm" : isPolicyRenewalCard ? "create-form creationForm targetCreateForm policyRenewalCreateForm" : isLiveScript ? "create-form creationForm targetCreateForm liveScriptCreateForm" : "create-form creationForm targetCreateForm"} onSubmit={(event) => event.preventDefault()}>
          {/* eslint-disable-next-line react-hooks/refs */}
          {visibleFields.map((field, index) => (
            <label className={getCreationFieldClassName(field.id, { isImageCard, isLiveScript, isXiaohongshuCheck })} id={`creation-field-${field.id}`} key={field.id}>
              <span className="field-card-header fieldCardHeader">
                <span className="step-indicator stepIndicator" aria-hidden="true">
                  <span className="step-number">{index + 1}</span>
                </span>
                <strong className="field-title">
                  {field.label}
                  {field.required ? <em className="required-mark">*</em> : null}
                  {supportsVoice(field.id) && field.type !== "text_or_file" ? (
                    <>
                      <span className={isImageCard ? "imageCardInlineOr" : "creationFieldInlineOr"}>或</span>
                      <button
                        className={voiceFieldId === field.id ? "imageCardVoiceButton active" : "imageCardVoiceButton"}
                        disabled={!voiceSupported}
                        onClick={() => startVoiceInput(field.id)}
                        type="button"
                      >
                        {voiceFieldId === field.id ? "录音中..." : "语音输入"}
                      </button>
                      <span className="imageCardVoiceHint">可多次添加</span>
                    </>
                  ) : null}
                </strong>
              </span>
              <span className="field-content">
                {renderField({
                  field,
                  value: values[field.id],
                  onChange: (nextValue) => updateField(field.id, nextValue),
                  isImageCard: isImageCard || isXiaohongshuCheck,
                  voiceActive: voiceFieldId === field.id,
                  voiceSupported,
                  onVoiceInput: () => startVoiceInput(field.id),
                  openFilePicker,
                  uploadName: uploadNames[field.id] ?? "",
                  uploadError: uploadErrors[field.id] ?? "",
                  uploadSuccess: uploadSuccess[field.id] ?? "",
                  uploading: Boolean(uploadingFields[field.id]),
                  onFileChange: (fileList) => handleFileChange(field.id, fileList),
                  styleOptionLimit: isWechatImages && field.id === "style" ? 6 : undefined,
                  styleRecommendation: isWechatImages && field.id === "style" ? wechatStyleRecommendation : undefined,
                  onShowAllStyles: isWechatImages && field.id === "style" ? () => setShowAllWechatStyles(true) : undefined,
                })}
                {voiceFieldId === field.id ? (
                  <VoiceInputPanel
                    elapsed={voiceElapsed}
                    paused={voicePaused}
                    onCancel={cancelVoiceInput}
                    onFinish={finishVoiceInput}
                    onPause={pauseVoiceInput}
                    onResume={() => startVoiceInput(field.id)}
                  />
                ) : null}
                {field.helper && !(isLeadCopy && field.id === "source") ? <span className="field-help">{field.helper}</span> : null}
                {(isImageCard || isWechatImages) && field.id === "source" ? <span className="imageCardMinorTip">可上传文本文件(txt/docx/pdf)，暂不支持图片</span> : null}
                {(isImageCard || isWechatImages) && field.id === "reference_image" ? <span className="imageCardMinorTip">参考图仅用于本次生成，请确认你有权使用。</span> : null}
                {isWechatImages && field.id === "article" ? (
                  <WechatArticleAnalysis analysis={wechatArticleAnalysis} />
                ) : null}
              </span>
            </label>
          ))}

          {(isPersonalityCardEntry || isImageCard && values.draw_portrait === "yes" || isWechatImages || isPolicyRenewalCard) ? (
            <AvatarVisualPicker
              appScope={isPersonalityCardEntry ? "personality-card" : isWechatImages ? "wechat-images" : isPolicyRenewalCard ? "policy-renewal-card" : "image-card"}
              enabled={isPersonalityCardEntry || isImageCard ? true : values.avatar_visual_mode === "yes"}
              loading={avatarPhotosLoading}
              maxSelection={isPolicyRenewalCard ? 1 : 4}
              photos={avatarPhotos}
              selectedIds={Array.isArray(values.avatar_visual_asset_ids) ? values.avatar_visual_asset_ids : []}
              showEnableToggle={isWechatImages || isPolicyRenewalCard}
              toggleTitle={isPolicyRenewalCard ? "卡片是否显示顾问形象" : "封面是否出现本人"}
              onEnabledChange={(enabled) => updateField("avatar_visual_mode", enabled ? "yes" : "no")}
              onSelectionChange={(ids) => updateField("avatar_visual_asset_ids", ids)}
            />
          ) : null}

          {isLeadCopy ? (
            <section className="field-card creationField batchCardLeadCopy">
              <div className="field-card-header fieldCardHeader">
                <span className="step-indicator stepIndicator" aria-hidden="true">
                  <span className="step-number">{pageApp.fields.length}</span>
                </span>
                <strong className="field-title">
                  生成类型
                  <em className="required-mark">*</em>
                </strong>
              </div>
              <div className="field-content">
                <div className="batch-selection-wrapper">
                  <div className="batch-checkbox-group">
                    {leadCopyTargetOptions.map((option) => {
                      const selected = Array.isArray(values.targets) ? values.targets : [];
                      const active = selected.includes(option.value);
                      return (
                        <button
                          className={active ? "batch-checkbox-item checked" : "batch-checkbox-item"}
                          key={option.value}
                          onClick={() =>
                            updateField(
                              "targets",
                              active ? selected.filter((item) => item !== option.value) : [...selected, option.value],
                            )
                          }
                          type="button"
                        >
                          <span className="batch-name">{option.label}</span>
                          {active ? <span className="check-icon">✓</span> : <span className="check-circle-empty" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="batch-tip">选择需要生成的文案类型，至少选择一个</div>
                </div>
              </div>
            </section>
          ) : null}

          {isWriteCopy ? (
            <section className="field-card creationField writeCopyTargetsCard">
              <div className="field-card-header fieldCardHeader">
                <span className="step-indicator stepIndicator" aria-hidden="true">
                  <span className="step-number">{visibleFields.length + 1}</span>
                </span>
                <strong className="field-title">
                  {isVoiceNoteSubpage ? "选择要整理成什么内容" : "选择要生成的渠道"}
                  <em className="required-mark">*</em>
                </strong>
              </div>
              <div className="field-content">
                <div className="writeCopyTargetGrid">
                  {writeCopyTargetOptions.map((option) => {
                    const selected = Array.isArray(values.targets) ? values.targets : [];
                    const active = selected.includes(option.value);
                    return (
                      <button
                        className={active ? "writeCopyTargetCard active" : "writeCopyTargetCard"}
                        key={option.value}
                        onClick={() =>
                          updateField(
                            "targets",
                            active ? selected.filter((item) => item !== option.value) : [...selected, option.value],
                          )
                        }
                        type="button"
                      >
                        <strong>{option.label}</strong>
                        <span>{describeWriteCopyTarget(option.value)}</span>
                        <em>{active ? "已选择" : "点击选择"}</em>
                      </button>
                    );
                  })}
                </div>
                <div className="batch-tip">选择需要生成的文案类型，至少选择一个</div>
              </div>
            </section>
          ) : null}

          {error ? <div className="formError submit-alert">{error}</div> : null}
          {pageApp.requiresThinking ? (
            <div className="resultSavedHint submit-alert">本应用会结合你的数字分身判断内容重点。<a href={appPath("/avatar")}>查看或完善数字分身</a></div>
          ) : null}
          {isWriteCopy && !isVoiceNoteSubpage ? (
            <div className="resultSavedHint submit-alert">需要更贴近你的表达习惯？<a href={appPath("/avatar")}>完善数字分身</a>，也可以直接按本次选择生成。</div>
          ) : null}
          {isTopicPicker ? (
            <div className="resultSavedHint submit-alert">选题会参考你的定位和目标客户。生成前可先<a href={appPath("/avatar")}>检查数字分身信息</a>。</div>
          ) : null}
          {isXiaohongshuCheck ? (
            <div className="resultSavedHint submit-alert">检测结果用于发布前辅助复核，不代表小红书官方审核结论。</div>
          ) : null}
          {isPolicyDiagnosis ? (
            <div className="resultSavedHint submit-alert">结果基于你提供的摘要信息，不替代正式保单条款解读或个性化保险建议。</div>
          ) : null}

          <section className="submit-section submitSection creationStickyAction">
            <div className="creationSubmitSummary">
              <strong>{missingRequiredFields.length ? `还需完成：${missingRequiredFields.map((field) => field.label).join("、")}` : "必填信息已完成"}</strong>
              <span>{draftStatus === "saving" ? "正在保存草稿…" : draftStatus === "restored" ? "已恢复上次草稿" : "草稿已自动保存"} · 本次消耗 {app.points} 积分</span>
              <i aria-hidden="true"><span style={{ width: `${completionPercent}%` }} /></i>
            </div>
            <button className="primaryButton submit-button submitButton" disabled={loading} onClick={() => void handleSubmit()} type="button">
              {loading
                ? isPolicyDiagnosis ? "复核中..." : isXiaohongshuCheck ? "检查中..." : isWechatImages ? "正在生成 4 张配图..." : isPolicyRenewalCard ? "正在生成保单提醒卡..." : "创作中..."
                : isXiaohongshuCheck ? `开始检查（${app.points}积分）` : isPolicyDiagnosis ? `开始复核（${app.points}积分）` : isWechatImages ? `生成 4 张配图 · ${app.points}积分` : isPolicyRenewalCard ? `生成保单提醒卡 · ${app.points}积分` : `开始创作（${app.points}积分）`}
            </button>
          </section>
        </form>
      </div>

      {showExample && activeExample ? (
        <CreationExamplePageClient
          app={app}
          example={activeExample}
          mode="modal"
          onClose={() => setShowExample(false)}
        />
      ) : null}

      {isWechatImages && showAllWechatStyles ? (
        <WechatStyleLibrary
          options={wechatStyleOptions}
          recommendation={wechatStyleRecommendation}
          selectedValue={typeof values.style === "string" ? values.style : ""}
          onClose={() => setShowAllWechatStyles(false)}
          onSelect={(nextValue) => {
            updateField("style", nextValue);
            setShowAllWechatStyles(false);
          }}
        />
      ) : null}

    </div>
  );
}

function createInitialValues(app: CreationApp, activeExample: { title?: string } | null, fromWorkspace: boolean) {
  const base = Object.fromEntries(app.fields.map((field) => [field.id, field.type === "multiselect" ? [] : ""])) as Record<string, FieldValue>;
  if (app.slug === "policy-renewal-card") {
    return {
      ...base,
      style: "renewal-handwritten",
      currency: "人民币",
      privacy_mode: "masked",
      contact_text: "如需协助了解续费流程，请随时联系我。",
      portrait_treatment: "soft-illustration",
      ratio: "3:4",
      avatar_visual_mode: "no",
      avatar_visual_asset_ids: [],
    };
  }
  if (app.slug === "write-copy") {
    return {
      ...base,
      tone: "self",
      source: buildWriteCopySourceSeed(activeExample?.title, fromWorkspace),
      targets: ["video_script", "xiaohongshu", "wechat_article", "moments"],
    };
  }
  if (app.slug === "wechat-images") {
    return {
      ...base,
      style: "documentary",
      avatar_visual_mode: "no",
      avatar_visual_asset_ids: [],
    };
  }
  if (app.slug === "general-content") {
    return {
      ...base,
      targets: ["video_script", "wechat_article"],
    };
  }
  if (app.slug === "letter") {
    return {
      ...base,
      theme: "",
      targets: ["wechat_article"],
    };
  }
  if (app.slug === "wechat-article-polish") {
    return {
      ...base,
      target: ["wechat_article"],
    };
  }
  if (app.slug === "ip-positioning" && app.name === "个性名片") {
    return { ...base, style: "professional", ratio: "3:4", avatar_visual_mode: "yes", avatar_visual_asset_ids: [] };
  }
  if (app.slug !== "image-card" || !fromWorkspace) return base;

  return {
    ...base,
    style: "illustration",
    source: activeExample?.title ? `${activeExample.title}\n\n请按这个案例的主题和表达方式，生成适合发布的知识卡片。` : "",
    draw_portrait: "no",
    ratio: "3:4",
  };
}

type WechatArticleAnalysis = {
  title: string;
  characterCount: number;
  paragraphCount: number;
  readingMinutes: number;
  nodes: Array<{ id: string; role: string; summary: string }>;
};

type WechatStyleRecommendation = {
  value: string;
  label: string;
  reason: string;
};

function WechatArticleAnalysis({ analysis }: { analysis: WechatArticleAnalysis }) {
  if (!analysis.characterCount) {
    return (
      <div className="wechatArticleEmptyAnalysis">
        <strong>文章导入后，这里会生成配图方案</strong>
        <span>自动识别文章标题、段落节奏和适合插图的位置，再统一选择视觉风格。</span>
      </div>
    );
  }

  return (
    <section className="wechatArticleAnalysis" aria-label="文章配图分析">
      <header>
        <div>
          <span>文章解析</span>
          <strong>{analysis.title}</strong>
        </div>
        <em>建议 4 张</em>
      </header>
      <div className="wechatArticleMetrics">
        <div><strong>{analysis.characterCount}</strong><span>正文字符</span></div>
        <div><strong>{analysis.paragraphCount}</strong><span>有效段落</span></div>
        <div><strong>{analysis.readingMinutes} 分钟</strong><span>预计阅读</span></div>
      </div>
      <div className="wechatImagePlanList">
        {analysis.nodes.map((node, index) => (
          <article key={node.id}>
            <i>{String(index + 1).padStart(2, "0")}</i>
            <div><strong>{node.role}</strong><span>{node.summary}</span></div>
            <em>建议</em>
          </article>
        ))}
      </div>
    </section>
  );
}

function WechatStyleLibrary({
  options,
  selectedValue,
  recommendation,
  onSelect,
  onClose,
}: {
  options: NonNullable<CreationApp["fields"][number]["options"]>;
  selectedValue: string;
  recommendation: WechatStyleRecommendation;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="wechatStyleLibraryBackdrop">
      <section aria-label="全部视觉风格" aria-modal="true" className="wechatStyleLibrary" role="dialog">
        <header>
          <div>
            <span>视觉风格库</span>
            <h2>选择整篇文章的统一风格</h2>
          </div>
          <button aria-label="关闭风格库" onClick={onClose} title="关闭" type="button">×</button>
        </header>
        <div className="wechatStyleLibraryGrid">
          {options.map((option) => {
            const active = selectedValue === option.value;
            const recommended = recommendation.value === option.value;
            return (
              <button className={active ? "wechatStyleLibraryItem active" : "wechatStyleLibraryItem"} key={option.value} onClick={() => onSelect(option.value)} type="button">
                {/* Preview assets come from configurable URLs; native img keeps them flexible here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {option.previewUrl ? <img alt={option.label} src={option.previewUrl} /> : <span className="wechatStyleLibraryPlaceholder" />}
                <strong>{option.label}</strong>
                {recommended ? <em>推荐</em> : null}
                {active ? <i>✓</i> : null}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AvatarVisualPicker({
  photos,
  selectedIds,
  appScope,
  enabled,
  loading,
  showEnableToggle,
  toggleTitle,
  maxSelection,
  onEnabledChange,
  onSelectionChange,
}: {
  photos: AvatarVisualAsset[];
  selectedIds: string[];
  appScope: string;
  enabled: boolean;
  loading: boolean;
  showEnableToggle: boolean;
  toggleTitle: string;
  maxSelection: number;
  onEnabledChange: (enabled: boolean) => void;
  onSelectionChange: (ids: string[]) => void;
}) {
  const availablePhotos = photos.filter((photo) => photo.status === "active" && photo.allow_creation && photo.usage_scopes.includes(appScope));
  return (
    <section className="creationAvatarVisualPicker" id="creation-avatar-visual-picker">
      <header>
        <div><span>数字分身形象</span><strong>{showEnableToggle ? toggleTitle : "选择本次使用的形象照"}</strong></div>
        {showEnableToggle ? <input checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} type="checkbox" /> : null}
      </header>
      {enabled ? (
        loading ? <p>正在读取形象库...</p> : availablePhotos.length ? (
          <div className="creationAvatarPhotoGrid">
            {availablePhotos.map((photo) => {
              const selected = selectedIds.includes(photo.id);
              return (
                <button className={selected ? "active" : ""} key={photo.id} onClick={() => onSelectionChange(selected ? selectedIds.filter((id) => id !== photo.id) : maxSelection === 1 ? [photo.id] : selectedIds.length < maxSelection ? [...selectedIds, photo.id] : selectedIds)} type="button">
                  {/* Avatar assets use runtime-generated URLs and vary in origin, so keep plain img here. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={photo.label || "数字分身形象照"} src={photo.content_url} />
                  <span>{photo.is_primary ? "主形象" : avatarPhotoRoleLabel(photo.role)}</span>
                  {selected ? <i>✓</i> : null}
                </button>
              );
            })}
          </div>
        ) : <p>暂无可用于此应用的形象照。<a href={appPath("/avatar")}>前往数字分身添加</a></p>
      ) : <p>本次只生成场景配图，不使用人物形象。</p>}
      {enabled && availablePhotos.length ? <small>{maxSelection === 1 ? "本次最多选择 1 张顾问形象照。" : "可选择 1–4 张；多角度照片有助于保持人物特征一致。"}</small> : null}
    </section>
  );
}

function avatarPhotoRoleLabel(role: AvatarVisualAsset["role"]) {
  return ({ portrait: "正面形象", professional: "职业半身", lifestyle: "自然生活", full_body: "全身照片", side_profile: "侧面形象" } as const)[role];
}

function analyzeWechatArticle(article: string): WechatArticleAnalysis {
  const normalized = article.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { title: "", characterCount: 0, paragraphCount: 0, readingMinutes: 0, nodes: [] };
  }

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const characterCount = normalized.replace(/\s/g, "").length;
  const title = normalizeWechatArticleTitle(lines[0] ?? "") || "未识别标题的公众号文章";
  const sourceParagraphs = paragraphs.length >= 4 ? paragraphs : lines;
  const nodeIndexes = [0, Math.floor(sourceParagraphs.length * 0.33), Math.floor(sourceParagraphs.length * 0.66), sourceParagraphs.length - 1];
  const roles = ["封面主题", "核心观点", "内容转折", "结尾收束"];

  return {
    title,
    characterCount,
    paragraphCount: sourceParagraphs.length,
    readingMinutes: Math.max(1, Math.ceil(characterCount / 400)),
    nodes: nodeIndexes.map((paragraphIndex, index) => ({
      id: `${index}-${paragraphIndex}`,
      role: roles[index],
      summary: summarizeWechatParagraph(sourceParagraphs[Math.max(0, paragraphIndex)] ?? title),
    })),
  };
}

function normalizeWechatArticleTitle(value: string) {
  return value
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:标题|文章标题)[：:]\s*/, "")
    .replace(/[“”"《》]/g, "")
    .trim()
    .slice(0, 36);
}

function summarizeWechatParagraph(value: string) {
  const normalized = value
    .replace(/^#{1,6}\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= 42) return normalized;
  return `${normalized.slice(0, 41)}…`;
}

function recommendWechatImageStyle(article: string): WechatStyleRecommendation {
  const text = article.toLowerCase();
  if (/数据|比例|结构|步骤|清单|方法|逻辑|对比/.test(text)) {
    return { value: "abstract", label: "几何抽象", reason: "文章偏知识拆解，几何画面更容易承接结构和观点。" };
  }
  if (/家庭|孩子|父母|陪伴|温暖|成长|生活/.test(text)) {
    return { value: "warm-drawing", label: "温暖手绘", reason: "文章包含家庭与生活场景，手绘表达更亲和，也更适合正文阅读。" };
  }
  if (/城市|职场|创业|商业|房产|资产/.test(text)) {
    return { value: "landscape", label: "城市风景", reason: "文章包含城市或商业议题，场景化画面更容易建立真实感。" };
  }
  if (/情绪|焦虑|选择|改变|故事|人生/.test(text)) {
    return { value: "cinematic-light", label: "电影光影", reason: "文章偏故事和情绪推进，光影画面更适合承接转折。" };
  }
  return { value: "documentary", label: "自然纪实", reason: "适配大多数公众号正文，画面克制、真实，不会抢正文信息。" };
}

function supportsVoice(fieldId: string) {
  return fieldId === "source" || fieldId === "article" || fieldId === "signature" || fieldId === "theme" || fieldId === "offer" || fieldId === "audience" || fieldId === "resume" || fieldId === "followup_notes" || fieldId === "draft" || fieldId === "policy_info" || fieldId === "insured_overview" || fieldId === "concerns" || fieldId === "live_point";
}

function getAppExperienceCopy(appSlug: string, entry: string) {
  if (entry === "voice-note-copy") return { input: "完整录音逐字稿或会议纪要", output: "清晰观点、金句和多平台内容" };
  if (entry === "recruit-script") return { input: "候选人简历与团队优势", output: "面谈流程、问题清单和跟进话术" };
  if (entry === "recruit-followup") return { input: "完整面谈记录或沟通纪要", output: "候选人判断、跟进计划和沟通内容" };
  if (entry === "personality-card") return { input: "个人介绍、目标客户和清晰形象照", output: "可展示和传播的个人名片" };
  const copy: Record<string, { input: string; output: string }> = {
    "write-copy": { input: "一份有事实和观点的真实素材", output: "口播、小红书、公众号和朋友圈版本" },
    "image-card": { input: "文章、口播稿或清晰主题", output: "按指定风格和比例生成知识卡片" },
    "policy-renewal-card": { input: "已核对的客户称呼、续保日期、保费与顾问信息", output: "一张由图片模型直接生成的图文融合提醒卡" },
    "lead-copy": { input: "客户问题、个人观点或参考内容", output: "适合引流承接的多平台文案" },
    "traffic-copy": { input: "热点事实、出处和你的判断", output: "有钩子、有逻辑的传播型内容" },
    "marketing-copy": { input: "客户画像、产品规则和真实案例", output: "四个营销角度的可信内容" },
    "lead-package": { input: "具体主题、目标人群和领取福利", output: "资料正文、目录和领取发布话术" },
    "topic-picker": { input: "你的定位；也可补充近期方向", output: "兼顾触达、信任和转化的 6 个选题" },
    "ip-positioning": { input: "账号现状、目标客户和业务优势", output: "定位主张、账号标签和内容主线" },
    breakthrough: { input: "当前卡点、已做动作和期望结果", output: "问题判断、优先动作和复盘指标" },
    "team-recruit": { input: "团队优势和明确的招募对象", output: "招募文案、海报标题和私信话术" },
    "live-script": { input: "一段直播观点或想讲清楚的问题", output: "从开场到收尾的完整直播脚本" },
    "general-content": { input: "一份完整观点或分享素材", output: "口播稿和公众号文章" },
    "wechat-images": { input: "结构完整的公众号文章", output: "适配文章节奏的多张配图" },
    "video-script-polish": { input: "准备发布的完整口播原稿", output: "问题诊断、修改建议和精修稿" },
    letter: { input: "人物关系、真实背景和想表达的情绪", output: "适合重要节点发布的一封信" },
    "xiaohongshu-check": { input: "准备发布的小红书完整文案", output: "风险定位、原因和替换表达" },
    "policy-diagnosis": { input: "家庭情况与每份保单的关键数据", output: "保障缺口、重复责任和待确认事项" },
    "wechat-article-polish": { input: "准备发布的完整公众号原稿", output: "标题建议、结构诊断和精修文章" },
  };
  return copy[appSlug] ?? { input: "完成页面中的必填信息", output: "一份可继续编辑和保存的作品" };
}

function buildAppPageClassName(appFamily: CreationAppFamily, appSlug?: string, entry?: string) {
  const classes = ["application-create-page", "creationAppPage"];
  if (appSlug === "general-content") classes.push("generalContentAppPage");
  if (appSlug === "policy-diagnosis") classes.push("policyDiagnosisAppPage");
  if (appSlug === "team-recruit") classes.push("teamRecruitAppPage");
  if (appFamily === "write-copy") classes.push("writeCopyAppPage");
  if (appSlug === "write-copy") classes.push("writeCopyBaseAppPage");
  if (appSlug === "lead-copy") classes.push("leadCopyAppPage");
  if (appSlug === "traffic-copy" || appSlug === "marketing-copy") classes.push("polishAppPage", "videoPolishAppPage", "multiChannelPolishAppPage");
  if (appSlug === "lead-package") classes.push("leadPackageAppPage");
  if (appSlug === "live-script") classes.push("liveScriptAppPage");
  if (appFamily === "topic-picker") classes.push("topicPickerAppPage");
  if (appFamily === "polish-video" || appFamily === "polish-wechat-article") classes.push("polishAppPage");
  if (appFamily === "polish-video") classes.push("videoPolishAppPage");
  if (appFamily === "polish-wechat-article") classes.push("wechatPolishAppPage");
  if (appFamily === "wechat-images") classes.push("wechatImagesAppPage");
  if (appFamily === "xiaohongshu-check") classes.push("xiaohongshuCheckAppPage");
  if (entry === "recruit-script") classes.push("recruitScriptAppPage");
  if (entry === "recruit-followup") classes.push("recruitFollowupAppPage");
  return classes.join(" ");
}

function getCreationFieldClassName(
  fieldId: string,
  flags: { isImageCard: boolean; isLiveScript: boolean; isXiaohongshuCheck: boolean },
) {
  const classes = ["field-card", "creationField"];
  if (flags.isImageCard) classes.push("imageCardField");
  if (flags.isXiaohongshuCheck) classes.push("xiaohongshuCheckField");
  if (flags.isLiveScript) {
    classes.push("liveScriptField", `liveScriptField-${fieldId}`);
    if (fieldId === "live_point") classes.push("liveScriptFieldWide");
  }
  return classes.join(" ");
}

function renderField({
  field,
  value,
  onChange,
  isImageCard,
  voiceActive,
  voiceSupported,
  onVoiceInput,
  openFilePicker,
  uploadName,
  uploadError,
  uploadSuccess,
  uploading,
  onFileChange,
  styleOptionLimit,
  styleRecommendation,
  onShowAllStyles,
}: {
  field: CreationApp["fields"][number];
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  isImageCard: boolean;
  voiceActive: boolean;
  voiceSupported: boolean;
  onVoiceInput: () => void;
  openFilePicker: (fieldId: string) => void;
  uploadName: string;
  uploadError: string;
  uploadSuccess: string;
  uploading: boolean;
  onFileChange: (fileList: FileList | null) => void;
  styleOptionLimit?: number;
  styleRecommendation?: WechatStyleRecommendation;
  onShowAllStyles?: () => void;
}) {
  if (field.type === "textarea") {
    if ((isImageCard || field.id === "article") && field.id === "source") {
      return (
        <div className="imageCardSplitField">
          <div className="imageCardSplitColumn">
            <div className="imageCardSplitHeader">文本输入</div>
            <textarea
              className="creationTextarea el-textarea__inner"
              onChange={(event) => onChange(event.target.value)}
              placeholder={field.placeholder}
              rows={4}
              value={typeof value === "string" ? value : ""}
            />
          </div>
          <div className="imageCardSplitColumn imageCardUploadColumn">
            <div className="imageCardSplitHeader">文件上传</div>
            <div className="imageCardUploadPanel">
              <button className="imageCardUploadButton" onClick={() => openFilePicker(field.id)} type="button">{uploading ? "解析中..." : "选择文件"}</button>
              <input
                accept=".txt,.md,.docx,.pdf"
                className="imageCardHiddenInput"
                id={`image-upload-${field.id}`}
                onChange={(event) => onFileChange(event.target.files)}
                type="file"
              />
              {uploadName ? <span className="imageCardUploadName">{uploadName}</span> : null}
              {uploadError ? <span className="imageCardUploadError">{uploadError}</span> : null}
            </div>
          </div>
        </div>
      );
    }

    return (
      <textarea
        className="creationTextarea el-textarea__inner"
        maxLength={field.maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        rows={field.id === "signature" ? 4 : field.id === "contact_text" ? 3 : field.id === "article" ? 6 : field.id === "draft" ? 4 : 8}
        value={typeof value === "string" ? value : ""}
      />
    );
  }

  if (field.type === "text_or_file") {
    return (
      <div className="text-or-file-container">
        <div className="input-section">
          <div className="section-header">
            <span className="section-title">文本输入</span>
            <span className="title-or">或</span>
            <button className="voice-input-btn" disabled={!voiceSupported} onClick={onVoiceInput} type="button">
              {voiceActive ? "录音中..." : "语音输入"}
            </button>
            <span className="voice-multi-hint">可多次添加</span>
          </div>
          <textarea
            className="creationTextarea el-textarea__inner"
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
            rows={4}
            value={typeof value === "string" ? value : ""}
          />
        </div>
          <div className="upload-section">
            <div className="section-header">
              <span className="section-title">文件上传</span>
            </div>
            <div className="unified-upload-wrapper">
              <button className="creationUploadButton" onClick={() => openFilePicker(field.id)} type="button">{uploading ? "解析中..." : "选择文件"}</button>
              <input
                accept={field.accept ?? ".txt,.docx,.pdf,.md"}
                className="imageCardHiddenInput"
                id={`image-upload-${field.id}`}
                onChange={(event) => onFileChange(event.target.files)}
              type="file"
            />
            {uploadName ? (
              <div className="custom-file-list">
                <div className="custom-file-item">
                  <span className="file-name">{uploadName}</span>
                </div>
              </div>
            ) : null}
            {uploadError ? <span className="imageCardUploadError">{uploadError}</span> : null}
            </div>
          {!field.helper ? <div className="field-tip">{field.uploadHint ?? "可上传 TXT、DOCX、PDF 或 Markdown 文件，单个文件不超过 10MB。"}</div> : null}
        </div>
      </div>
    );
  }

  if (field.type === "text") {
    return (
      <input
        className="creationInput el-input__inner"
        maxLength={field.maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        type="text"
        value={typeof value === "string" ? value : ""}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select className="creationSelect el-select__wrapper" onChange={(event) => onChange(event.target.value)} value={typeof value === "string" ? value : ""}>
        <option value="">请选择</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }

  if (field.type === "radio") {
    if ((isImageCard || field.id === "style") && field.id === "style") {
      const styleOptions = field.options ?? [];
      const selectedStyle = styleOptions.find((option) => option.value === value);
      const initialStyleOptions = typeof styleOptionLimit === "number" ? styleOptions.slice(0, styleOptionLimit) : styleOptions;
      const visibleStyleOptions = styleOptionLimit && selectedStyle && !initialStyleOptions.some((option) => option.value === selectedStyle.value)
        ? [...initialStyleOptions.slice(0, -1), selectedStyle]
        : initialStyleOptions;
      return (
        <div className="imageStylePicker">
          {styleRecommendation ? (
            <div className="wechatStyleRecommendation">
              <span>智能推荐</span>
              <strong>{styleRecommendation.label}</strong>
              <p>{styleRecommendation.reason}</p>
            </div>
          ) : null}
          <div className="imageStyleGrid">
            {visibleStyleOptions.map((option) => {
              const active = value === option.value;
              const recommended = styleRecommendation?.value === option.value;
              return (
                <button
                  className={active ? "imageStyleCard active" : "imageStyleCard"}
                  key={option.value}
                  onClick={() => onChange(option.value)}
                  type="button"
                >
                  {/* Style previews come from the admin-configurable asset library. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {option.previewUrl ? <img alt={option.label} className="imageStylePreview" src={option.previewUrl} /> : <div className="imageStylePreview imageStylePreviewPlaceholder" />}
                  <span className="imageStyleLabel">{option.label}</span>
                  {recommended ? <span className="wechatStyleRecommended">推荐</span> : null}
                  {active ? <span className="imageStyleSelected">✓</span> : null}
                </button>
              );
            })}
          </div>
          {styleOptionLimit && styleOptions.length > visibleStyleOptions.length && onShowAllStyles ? (
            <button className="wechatStylesMoreButton" onClick={onShowAllStyles} type="button">
              查看全部 {styleOptions.length} 种风格
            </button>
          ) : null}
        </div>
      );
    }

    return (
      <div className="radio-select-group choiceGrid">
        {(field.options ?? []).map((option) => (
          <button
            className={value === option.value ? "radio-select-option is-checked choiceButton active" : "radio-select-option choiceButton"}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="batch-checkbox-group choiceGrid multi">
        {(field.options ?? []).map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              className={active ? "batch-checkbox-item checked choiceButton active" : "batch-checkbox-item choiceButton"}
              key={option.value}
              onClick={() =>
                onChange(active ? selected.filter((item) => item !== option.value) : [...selected, option.value])
              }
              type="button"
            >
              <span className="batch-name">{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={isImageCard ? "imageCardFileField" : "fileFieldPlaceholder"}>
      <button className="imageCardUploadButton" onClick={() => openFilePicker(field.id)} type="button">{uploading ? "上传中..." : "选择文件"}</button>
      <input
        accept={field.accept}
        className="imageCardHiddenInput"
        id={`image-upload-${field.id}`}
        onChange={(event) => onFileChange(event.target.files)}
        type="file"
      />
      {uploadName ? <span className="imageCardUploadName">{uploadName}</span> : null}
      {uploadError ? <span className="imageCardUploadError">{uploadError}</span> : null}
      {uploadSuccess ? <span className="imageCardUploadSuccess">{uploadSuccess}</span> : null}
    </div>
  );
}

function VoiceInputPanel({
  elapsed,
  paused,
  onCancel,
  onFinish,
  onPause,
  onResume,
}: {
  elapsed: number;
  paused: boolean;
  onCancel: () => void;
  onFinish: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  return (
    <div className={paused ? "voiceCapturePanel paused" : "voiceCapturePanel"} role="status" aria-live="polite">
      <div className="voiceCaptureStatus">
        <span className="voiceCaptureDot" aria-hidden="true" />
        <strong>{paused ? "语音输入已暂停" : `语音输入中 ${formatVoiceElapsed(elapsed)}`}</strong>
      </div>
      <div className="voiceWaveform" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="voiceCaptureActions">
        <button className="voiceCaptureButton secondary" onClick={paused ? onResume : onPause} type="button">
          <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
          {paused ? "继续" : "暂停"}
        </button>
        <button className="voiceCaptureButton finish" onClick={onFinish} type="button">
          <span aria-hidden="true">✓</span>
          完成
        </button>
        <button className="voiceCaptureButton cancel" onClick={onCancel} type="button">
          <span aria-hidden="true">×</span>
          取消
        </button>
      </div>
    </div>
  );
}

function formatVoiceElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function appendTextValue(current: FieldValue | undefined, nextChunk: string) {
  const currentText = typeof current === "string" ? current.trim() : "";
  const chunk = nextChunk.trim();
  if (!currentText) return chunk;
  if (!chunk) return currentText;
  return `${currentText}\n${chunk}`;
}

function isEmpty(value: FieldValue | undefined) {
  if (Array.isArray(value)) return value.length === 0;
  return !value || !value.trim();
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function buildWriteCopySourceSeed(exampleTitle?: string, fromWorkspace?: boolean) {
  if (!fromWorkspace) return "";
  if (!exampleTitle) return "";
  return `${exampleTitle}\n\n请围绕这个观点，保留接地气、像真人说话的表达方式，生成适合不同平台直接发布的内容。`;
}

function describeWriteCopyTarget(value: string) {
  if (value === "video_script") return "适合短视频口播、出镜表达";
  if (value === "xiaohongshu") return "适合图文笔记、标题封面";
  if (value === "wechat_article") return "适合长文论证、公众号排版";
  if (value === "moments") return "适合短表达、朋友圈发布";
  return "按该平台的内容方式生成";
}
