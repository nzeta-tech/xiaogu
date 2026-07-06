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
import { apiPath, appPath } from "@/lib/client/url";
import { CreationExamplePageClient } from "@/components/pages/CreationExamplePageClient";

type FieldValue = string | string[];

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
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
  const isWechatImages = appFamily === "wechat-images";
  const isVideoScriptPolish = appFamily === "polish-video";
  const isWechatArticlePolish = appFamily === "polish-wechat-article";
  const isVoiceNoteEntry = app.slug === "write-copy" && workspaceEntry === "voice-note-copy";
  const isRecruitScriptEntry = app.slug === "team-recruit" && workspaceEntry === "recruit-script";
  const isRecruitFollowupEntry = app.slug === "team-recruit" && workspaceEntry === "recruit-followup";
  const isIpPositioningEntry = app.slug === "ip-positioning" && workspaceEntry === "ip-positioning";
  const isPersonalityCardEntry = app.slug === "ip-positioning" && workspaceEntry === "personality-card";
  const isBreakthroughEntry = app.slug === "breakthrough" && workspaceEntry === "breakthrough";
  const hasRealExample = shouldShowRealExample(app.slug, workspaceEntry);
  const isCompactWechatFlow = isWechatImages || isWechatArticlePolish;
  const isCompactWriteCopyFlow = isWriteCopy;
  const exampleSlug = searchParams.get("example");
  const activeExample = (exampleSlug ? getCreationExampleBySlug(exampleSlug) : null) ?? getCreationExampleForApp(app.slug, pageApp.exampleTitle);
  const visibleFields = pageApp.fields.filter((field) => !((isLeadCopy || isWriteCopy) && field.id === "targets"));
  const leadCopyTargetOptions = isLeadCopy ? (pageApp.fields.find((field) => field.id === "targets")?.options ?? []) : [];
  const writeCopyTargetOptions = isWriteCopy ? (pageApp.fields.find((field) => field.id === "targets")?.options ?? []) : [];
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    createInitialValues(pageApp, activeExample, searchParams.get("from") === "workspace"),
  );
  const [loading, setLoading] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [error, setError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [voiceFieldId, setVoiceFieldId] = useState<string | null>(null);
  const [uploadNames, setUploadNames] = useState<Record<string, string>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceSupported = useMemo(() => Boolean(getSpeechRecognitionConstructor()), []);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  async function handleSubmit() {
    const missingField = pageApp.fields.find((field) => field.required && isEmpty(values[field.id]));
    if (missingField) {
      setError(`${missingField.label}还没有填写。`);
      return;
    }

    setLoading(true);
    setError("");
    const draftKey = `creation-draft:${workspaceEntry || app.slug}`;
    window.sessionStorage.setItem(draftKey, JSON.stringify(values));

    const response = await fetch(apiPath(`/api/creation/apps/${app.slug}/prepare`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    });

    const payload = (await response.json().catch(() => ({ error: "创建作品失败，请稍后再试。" }))) as {
      error?: string;
      work?: { id?: string };
    };

    if (!response.ok || !payload.work?.id) {
      setError(payload.error ?? "创建作品失败，请稍后再试。");
      setLoading(false);
      return;
    }

    router.push(appPath(`/works/${payload.work.id}?from=creation-works&entry=${workspaceEntry || app.slug}`));
  }

  function updateField(fieldId: string, nextValue: FieldValue) {
    setValues((current) => ({ ...current, [fieldId]: nextValue }));
  }

  function openFilePicker(fieldId: string) {
    document.getElementById(`image-upload-${fieldId}`)?.click();
  }

  async function handleFileChange(fieldId: string, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    setUploadNames((current) => ({ ...current, [fieldId]: file.name }));
    setUploadErrors((current) => ({ ...current, [fieldId]: "" }));

    if (fieldId === "reference_image") {
      const encoded = await readFileAsDataUrl(file).catch(() => "");
      updateField(fieldId, encoded || file.name);
      return;
    }

    setUploadingFields((current) => ({ ...current, [fieldId]: true }));
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(apiPath("/api/creation/import-text"), {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({ error: "文件解析失败，请换一个文件重试。" }))) as {
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

    recognitionRef.current?.stop();
    setVoiceFieldId(fieldId);
    setError("");

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "zh-CN";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .flatMap((result) => Array.from(result))
        .map((item) => item.transcript)
        .join("")
        .trim();
      if (!transcript) return;
      setValues((current) => ({
        ...current,
        [fieldId]: appendTextValue(current[fieldId], transcript),
      }));
    };
    recognition.onerror = () => {
      setError("语音输入失败，请再试一次。");
      setVoiceFieldId(null);
    };
    recognition.onend = () => {
      setVoiceFieldId(null);
    };
    recognition.start();
    recognitionRef.current = recognition;
  }

  return (
    <div className={buildAppPageClassName(appFamily)}>
        <div className="page-content">
        <div className="page-back-bar pageBackBar">
          <a className="back-btn backLink" href={appPath("/workspace")}>{isCompactWechatFlow || isCompactWriteCopyFlow ? "返回" : "返回广场"}</a>
        </div>

        <section className={isImageCard ? "app-info-card imageCardHero" : isWriteCopy ? "app-info-card writeCopyHeroCard" : isWechatImages ? "app-info-card wechatImagesHeroCard" : isWechatArticlePolish ? "app-info-card wechatArticlePolishHeroCard" : "app-info-card"}>
          <div className="app-header">
            <span className="app-icon creationToolEmoji">{app.emoji}</span>
            <div className="app-text">
              <h1 className="app-name">{pageApp.name}</h1>
              <p className="app-description">{pageApp.description}</p>
            </div>
            {isImageCard || isWechatArticlePolish ? (
              <button className="imageCardGuideButton" onClick={() => setGuideOpen(true)} type="button">
                <span className="imageCardGuideFire" aria-hidden="true">🔥</span>
                <span>必看攻略</span>
              </button>
            ) : null}
          </div>
          {isLeadCopy ? (
            <div className="app-meta leadCopyMeta">
              <span>{app.points} 积分/次</span>
              {pageApp.badge ? <strong>{pageApp.badge}</strong> : null}
            </div>
          ) : !isCompactWechatFlow && !isCompactWriteCopyFlow ? (
            <div className="app-meta">
              <span>{pageApp.points} 积分/次</span>
              {pageApp.badge ? <strong>{pageApp.badge}</strong> : null}
              {pageApp.requiresThinking ? <em>建议先创建思维</em> : null}
            </div>
          ) : null}
          {!isImageCard && !isLeadCopy && hasRealExample && activeExample && !isCompactWechatFlow && !isCompactWriteCopyFlow ? (
            <div className="creationAppExampleActions">
              <button className="creationAppCaseButton" onClick={() => setShowExample(true)} type="button">
                查看案例
              </button>
              <span className="creationAppCaseHint">{activeExample.title}</span>
            </div>
          ) : null}
          {exampleSlug ? <div className="resultSavedHint">已载入案例思路，你可以按同款结构继续创作。</div> : null}
          {isWriteCopy && !isCompactWriteCopyFlow ? (
            <div className="writeCopyHeroBody">
              <div className="writeCopyHeroIntro">
                <strong>{isVoiceNoteEntry ? "把录音稿拆成多个独立内容和金句，直接拿去继续创作" : "一次搞定：口播稿、公众号文章、小红书笔记、朋友圈"}</strong>
                <p>{isVoiceNoteEntry ? "这张页更接近源站的录音稿拆解整理，不是默认的多平台批量分发。重点是先把学习、分享或培训录音整理成多个可复用内容片段。" : "可输入观点录音、文章、口播稿、聊天记录等素材。系统会先提炼你的核心表达，再拆成更适合不同发布场景的版本。"}</p>
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
          {isRecruitScriptEntry ? (
            <div className="polishHeroBody">
              <div className="polishHeroIntro">
                <strong>上传候选人简历后，先拿到一套完整的增员面谈准备包</strong>
                <p>这个页面更偏“面谈前准备”，不是通用招募文案页。重点是候选人画像、完整面试流程、欢迎话术、应急话术和后续注意事项。</p>
              </div>
              <div className="polishHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>候选人简历、履历摘要、经历亮点、转型动机</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>画像分析、面谈流程、欢迎语、应急话术、跟进建议</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先贴简历，再补团队亮点和本次最想重点聊的方向</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isRecruitFollowupEntry ? (
            <div className="polishHeroBody">
              <div className="polishHeroIntro">
                <strong>把面谈录音文稿整理成后续跟进动作，而不是重写一篇普通招募文案</strong>
                <p>这个页面更像源站里的“增员跟踪”页，重点是生成《给ta的一封信》《候选人信息跟踪表》《跟踪计划表》和一篇招募向公众号文章。</p>
              </div>
              <div className="polishHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>候选人面谈录音稿、面谈纪要、顾虑点、当前跟进阶段</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>跟踪计划、候选人画像、一封信、公众号承接内容</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先贴完整面谈文稿，再补候选人当前最卡住的点</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isIpPositioningEntry ? (
            <div className="polishHeroBody">
              <div className="polishHeroIntro">
                <strong>一键生成专属 IP 定位方案，重点是调用你的思维画像，而不是重新写一堆需求说明</strong>
                <p>源站这里更像思维驱动型定位页。包含定位分析、包装升级、个人传记文章，完成思维后可以直接开始创作。</p>
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
                  <strong>先完成思维画像，再补当前阶段最真实的业务现状</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isBreakthroughEntry ? (
            <div className="polishHeroBody">
              <div className="polishHeroIntro">
                <strong>有业务瓶颈、有卡点，就先把问题诊断清楚，再拉出破局动作清单</strong>
                <p>这页不是普通内容创作页，更像增长陪跑页面。源站强调先下载攻略文档、填好后上传，再围绕卡点给出破局路径。</p>
              </div>
              <div className="polishHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>当前瓶颈、业务背景、最近动作、卡住环节、期望结果</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>问题诊断、短期动作、节奏安排、复盘指标</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先写真实卡点，再补你已经试过但没跑通的动作</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isPersonalityCardEntry ? (
            <div className="polishHeroBody">
              <div className="polishHeroIntro">
                <strong>个性名片不是定位长文，而是一张让人一眼记住你的展示卡</strong>
                <p>源站这张卡更偏个人介绍和形象展示。只需上传个人介绍和照片，再选风格，就能生成更适合传播和展示的个性名片。</p>
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
          {isVideoScriptPolish ? (
            <div className="polishHeroBody">
              <div className="polishHeroIntro">
                <strong>把已有口播稿精修成更容易开口、更有节奏、也更像你自己的版本</strong>
                <p>这类应用不是从零生成，而是保留原意后做深度改稿。重点会放在开头抓人、结构顺畅、情绪稳定和个人表达感上。</p>
              </div>
              <div className="polishHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>已有口播稿、直播逐字稿、短视频底稿</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>精修版主稿 + 改稿方向总结</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先贴原稿，再勾选最想优化的点</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isWechatArticlePolish && !isCompactWechatFlow ? (
            <div className="polishHeroBody wechatArticlePolishHeroBody">
              <div className="polishHeroIntro">
                <strong>把已有公众号文章精修成更有阅读节奏、更有质感、也更利于转发的版本</strong>
                <p>这里的重点不是完全重写，而是保留原文核心后，重做标题、段落推进、语言质感和结尾互动设计。</p>
              </div>
              <div className="polishHeroChecklist">
                <div>
                  <span>适合输入</span>
                  <strong>已有成稿、长文初稿、历史爆文复改</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>精修版长文 + 标题结构方向</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先贴全文，再勾选标题/结构/语言/互动</strong>
                </div>
              </div>
            </div>
          ) : null}
          {isWechatImages && !isCompactWechatFlow ? (
            <div className="wechatImagesHeroBody">
              <div className="wechatImagesHeroSummary">
                <div>
                  <span>适合输入</span>
                  <strong>完整公众号文章、重点段落、专题连载内容</strong>
                </div>
                <div>
                  <span>生成结果</span>
                  <strong>更贴合阅读段落推进的公众号配图方案</strong>
                </div>
                <div>
                  <span>推荐方式</span>
                  <strong>先贴正文，再选风格，再看案例里的排版节奏</strong>
                </div>
              </div>
              <div className="wechatImagesHeroNotes">
                <p>适合输入完整公众号文章、重点段落、专题连载内容</p>
                <p>生成结果更贴合阅读段落推进的公众号配图方案</p>
                <p>推荐方式先贴正文，再选风格，再看案例里的排版节奏</p>
              </div>
            </div>
          ) : null}
        </section>

        {isWriteCopy && !isCompactWriteCopyFlow ? (
          <section className="writeCopyBriefingCard">
            <div className="writeCopyBriefingHeader">
              <div>
                <strong>怎么写，效果更像目标站</strong>
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

        {isVideoScriptPolish ? (
          <section className="polishBriefingCard">
            <div className="polishBriefingHeader">
              <div>
                <strong>精修口播稿时，怎样更像目标站的结果</strong>
                <p>不要只写一个主题词，最好直接贴你现在会讲的原稿。越接近真实表达，精修后越自然，也越像“在原稿上升级”。</p>
              </div>
              <span className="polishBriefingBadge">建议先看案例</span>
            </div>
            <div className="polishBriefingGrid">
              <article>
                <span>1. 保留原稿</span>
                <strong>直接粘贴你现在准备讲的版本，而不是重写需求说明</strong>
              </article>
              <article>
                <span>2. 重点明确</span>
                <strong>优先勾选你最想优化的两到三个点，不要全选后失焦</strong>
              </article>
              <article>
                <span>3. 看开头节奏</span>
                <strong>结果页里先看开头是否更容易开口，再看整体结构</strong>
              </article>
            </div>
          </section>
        ) : null}
        {isWechatArticlePolish && !isCompactWechatFlow ? (
          <section className="polishBriefingCard">
            <div className="polishBriefingHeader">
              <div>
                <strong>精修文章时，怎样更像目标站的结果</strong>
                <p>这类应用最关键的是长文节奏，而不是单句润色。先保留原文，再把标题、结构推进和结尾互动重新抬起来。</p>
              </div>
              <span className="polishBriefingBadge">建议先看案例</span>
            </div>
            <div className="polishBriefingGrid">
              <article>
                <span>1. 全文优先</span>
                <strong>尽量贴完整文章，而不是只贴其中一段</strong>
              </article>
              <article>
                <span>2. 优化点聚焦</span>
                <strong>如果标题和结构最弱，就优先勾这两项</strong>
              </article>
              <article>
                <span>3. 先看阅读感</span>
                <strong>结果页里重点看是否更愿意继续读，而不是只看词藻</strong>
              </article>
            </div>
          </section>
        ) : null}
        {isWechatImages && !isCompactWechatFlow ? (
          <section className="wechatImagesBriefingCard">
            <div className="wechatImagesBriefingHeader">
              <div>
                <strong>公众号配图页不是通用做图页</strong>
                <p>它更强调“文章在读”的节奏感，所以输入最好是完整正文，结果也更偏段落间插图，而不是单张海报。</p>
              </div>
              <span className="wechatImagesBriefingBadge">建议先看案例</span>
            </div>
            <div className="wechatImagesBriefingLead">
              <p>适合输入完整公众号文章、重点段落、专题连载内容</p>
              <p>生成结果更贴合阅读段落推进的公众号配图方案</p>
              <p>推荐方式先贴正文，再选风格，再看案例里的排版节奏</p>
            </div>
            <div className="wechatImagesBriefingGrid">
              <article>
                <span>1. 文章优先</span>
                <strong>尽量粘贴完整可读正文，系统才能判断段落节奏</strong>
              </article>
              <article>
                <span>2. 风格收敛</span>
                <strong>配图页更适合稳定、轻阅读感，不追求强海报感</strong>
              </article>
              <article>
                <span>3. 看阅读插图</span>
                <strong>重点检查配图是否真的服务文章，而不是只好看</strong>
              </article>
            </div>
          </section>
        ) : null}

        <form className={isImageCard ? "create-form creationForm targetCreateForm imageCardCreateForm" : "create-form creationForm targetCreateForm"} onSubmit={(event) => event.preventDefault()}>
          {/* eslint-disable-next-line react-hooks/refs */}
          {visibleFields.map((field, index) => (
            <label className={isImageCard ? "field-card creationField imageCardField" : "field-card creationField"} key={field.id}>
              <span className="field-card-header fieldCardHeader">
                <span className="step-indicator stepIndicator" aria-hidden="true">
                  <span className="step-number">{index + 1}</span>
                </span>
                <strong className="field-title">
                  {field.label}
                  {field.required ? <em className="required-mark">*</em> : null}
                  {supportsVoice(field.id) ? (
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
                  isImageCard,
                  voiceActive: voiceFieldId === field.id,
                  voiceSupported,
                  onVoiceInput: () => startVoiceInput(field.id),
                  openFilePicker,
                  uploadName: uploadNames[field.id] ?? "",
                  uploadError: uploadErrors[field.id] ?? "",
                  uploading: Boolean(uploadingFields[field.id]),
                  onFileChange: (fileList) => handleFileChange(field.id, fileList),
                })}
                {field.helper ? <span className="field-help">{field.helper}</span> : null}
                {(isImageCard || isWechatImages) && field.id === "source" ? <span className="imageCardMinorTip">可上传文本文件(txt/docx/pdf)，暂不支持图片</span> : null}
                {(isImageCard || isWechatImages) && field.id === "reference_image" ? <span className="imageCardMinorTip">AI会看心情，在图片上发挥...</span> : null}
              </span>
            </label>
          ))}

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
                  选择生成内容
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
            <div className="resultSavedHint submit-alert">这个应用需要先创建你的思维，完成后生成内容会更像你。</div>
          ) : null}
          {isWriteCopy ? (
            <div className="resultSavedHint submit-alert">尚未提交思维问卷，将使用资深创作者风格创作，若想打造自己的个性化风格，请填写思维问卷 →</div>
          ) : null}

          <section className="submit-section submitSection">
            <button className="primaryButton submit-button submitButton" disabled={loading} onClick={() => void handleSubmit()} type="button">
              {loading ? "创作中..." : isWriteCopy ? `开始创作（${app.points}积分）` : isImageCard || isWechatImages || isWechatArticlePolish ? `开始创作（${app.points}积分）` : isVideoScriptPolish ? `开始精修（${app.points}积分）` : `立即创作（${app.points}积分）`}
            </button>
            {isImageCard ? <div className="imageCardRemakeHint">已填入【同款作品】的选项与文案，可直接开始创作体验；也可修改成自己的内容再创作。</div> : null}
            {isWechatImages ? <div className="wechatImagesSubmitHint">生成后会进入作品详情页，重点查看图片是否贴合文章段落节奏与阅读场景。</div> : null}
            {isWriteCopy && !isCompactWriteCopyFlow ? <div className="writeCopySubmitHint">生成后会直接进入作品详情页，支持复制、导出、改写和继续保存。</div> : null}
            {isVideoScriptPolish ? <div className="polishSubmitHint">生成后会进入作品详情页，优先查看精修后的主稿、开头节奏和整体顺滑度。</div> : null}
            {isWechatArticlePolish ? <div className="polishSubmitHint">生成后会进入作品详情页，优先查看标题、段落推进和结尾互动是否更顺。</div> : null}
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

      {guideOpen ? (
        <div className="creationExampleModalOverlay" onClick={() => setGuideOpen(false)} role="presentation">
          <div className="creationExampleModalShell imageGuideModal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="必看攻略">
            <div className="imageGuideModalContent">
              <div className="imageGuideModalHeader">
                <h2>必看攻略</h2>
                <button className="creationExampleClose" onClick={() => setGuideOpen(false)} type="button">×</button>
              </div>
              <div className="imageGuideModalBody">
                <p>1. 先选风格，再决定图片比例，这样更容易稳定出图。</p>
                <p>2. 图片内容建议直接粘贴可读性强的正文、要点或标题，不要只给太短的关键词。</p>
                <p>3. 如果要让图片更像你的内容，优先补充署名、参考图和人物形象设置。</p>
                <p>4. 点击开始创作后，本地会先创建作品，再进入作品详情页承接后续生成。</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function createInitialValues(app: CreationApp, activeExample: { title?: string } | null, fromWorkspace: boolean) {
  const base = Object.fromEntries(app.fields.map((field) => [field.id, field.type === "multiselect" ? [] : ""])) as Record<string, FieldValue>;
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
      style: "realistic",
    };
  }
  if (app.slug === "wechat-article-polish") {
    return {
      ...base,
      target: ["wechat_article"],
    };
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

function getEntryAdjustedApp(app: CreationApp, entry: string): CreationApp {
  if (app.slug === "write-copy" && entry === "voice-note-copy") {
    return {
      ...app,
      name: "录音稿拆解整理",
      description: "把学习、分享的录音稿拆成多个独立内容+金句，直接复制，即可创作内容",
      exampleTitle: undefined,
      fields: [
        {
          id: "source",
          label: "录音稿内容",
          type: "text_or_file",
          required: true,
          placeholder: "请粘贴完整录音稿、学习分享逐字稿或聊天复盘内容",
          helper: "也可上传 txt、docx、pdf、md 文件",
        },
        {
          id: "tone",
          label: "拆解倾向",
          type: "radio",
          required: true,
          options: [
            { label: "偏像自己", value: "self" },
            { label: "偏还原整理", value: "raw" },
            { label: "偏提炼金句", value: "traffic" },
            { label: "偏稳定逻辑", value: "trust" },
          ],
        },
        {
          id: "targets",
          label: "选择生成内容",
          type: "multiselect",
          required: true,
          options: [
            { label: "独立内容片段", value: "video_script" },
            { label: "金句摘录", value: "moments" },
            { label: "可继续扩写的长内容", value: "wechat_article" },
          ],
        },
      ],
    };
  }

  if (app.slug === "team-recruit" && entry === "recruit-script") {
    return {
      ...app,
      name: "增员面谈逐字稿",
      description: "只需上传候选人简历，就能生成一套完整的面试内容，包括：1、候选人画像，2、完整面试流程和话题，3、个性化欢迎、4、应急话术、5、注意事项、6、跟进内容",
      exampleTitle: undefined,
      fields: [
        {
          id: "resume",
          label: "候选人简历",
          type: "text_or_file",
          required: true,
          placeholder: "请粘贴候选人简历、背景经历、转型动机，或直接上传简历文件",
          helper: "尽量补充工作经历、优势、顾虑和你最想重点聊的方向",
        },
        {
          id: "team_offer",
          label: "团队亮点",
          type: "textarea",
          required: true,
          placeholder: "例如培训体系、陪跑支持、客户资源、主打赛道、团队氛围",
        },
        {
          id: "focus",
          label: "本次面谈重点",
          type: "textarea",
          placeholder: "例如重点判断稳定性、沟通转化能力、是否适合长期培养",
        },
      ],
    };
  }

  if (app.slug === "team-recruit" && entry === "recruit-followup") {
    return {
      ...app,
      name: "增员跟踪",
      description: "招募利器！上传和候选人的面谈录音文稿，得到《给ta的一封信》、《候选人信息跟踪表》、《跟踪计划表》、《一篇招募向公众号文章》",
      exampleTitle: undefined,
      fields: [
        {
          id: "followup_notes",
          label: "面谈录音文稿",
          type: "text_or_file",
          required: true,
          placeholder: "请粘贴和候选人的面谈录音稿、会议纪要或沟通复盘",
          helper: "越完整越好，方便系统提取顾虑点、兴趣点和下一步承接动作",
        },
        {
          id: "candidate_stage",
          label: "候选人当前阶段",
          type: "radio",
          required: true,
          options: [
            { label: "刚聊完首次面谈", value: "first_meeting" },
            { label: "有兴趣但在犹豫", value: "hesitating" },
            { label: "准备进入下一步", value: "ready_next_step" },
          ],
        },
        {
          id: "focus",
          label: "当前最想推进的问题",
          type: "textarea",
          placeholder: "例如增强信任、消除顾虑、推进二次面谈、安排试岗",
        },
      ],
    };
  }

  if (app.slug === "ip-positioning" && entry === "personality-card") {
    return {
      ...app,
      name: "个性名片",
      description: "个性名片生成，人群之中记住你！只需上传个人介绍+照片，选风格即可~",
      requiresThinking: false,
      exampleTitle: undefined,
      fields: [
        {
          id: "current_state",
          label: "个人介绍",
          type: "textarea",
          required: true,
          placeholder: "请介绍你是谁、服务谁、擅长什么、最希望别人记住你的哪一点",
        },
        {
          id: "target_client",
          label: "想吸引的人群",
          type: "text",
          required: true,
          placeholder: "例如宝妈家庭、高净值客户、企业主、自由职业者",
        },
      ],
    };
  }

  return app;
}

function shouldShowRealExample(appSlug: string, entry: string) {
  if (entry === "voice-note-copy") return false;
  if (entry === "recruit-script" || entry === "recruit-followup") return false;
  if (entry === "personality-card") return false;
  if (appSlug === "lead-copy") return false;
  if (appSlug === "live-script") return false;
  if (appSlug === "xiaohongshu-check") return false;
  if (appSlug === "policy-diagnosis") return false;
  if (appSlug === "ip-positioning") return false;
  if (appSlug === "breakthrough") return false;
  if (appSlug === "team-recruit") return false;
  return true;
}

function supportsVoice(fieldId: string) {
  return fieldId === "source" || fieldId === "article" || fieldId === "signature" || fieldId === "theme" || fieldId === "offer" || fieldId === "audience" || fieldId === "resume" || fieldId === "followup_notes";
}

function buildAppPageClassName(appFamily: CreationAppFamily) {
  const classes = ["application-create-page", "creationAppPage"];
  if (appFamily === "write-copy") classes.push("writeCopyAppPage");
  if (appFamily === "polish-video" || appFamily === "polish-wechat-article") classes.push("polishAppPage");
  if (appFamily === "polish-video") classes.push("videoPolishAppPage");
  if (appFamily === "polish-wechat-article") classes.push("wechatPolishAppPage");
  if (appFamily === "wechat-images") classes.push("wechatImagesAppPage");
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
  uploading,
  onFileChange,
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
  uploading: boolean;
  onFileChange: (fileList: FileList | null) => void;
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
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        rows={field.id === "signature" ? 4 : field.id === "article" ? 6 : 8}
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
                accept=".txt,.docx,.pdf,.md"
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
          <div className="field-tip">上传资料（文件暂只支持.txt, .docx, .pdf, .md，大小不超过10MB）</div>
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
      return (
        <div className="imageStyleGrid">
          {(field.options ?? []).map((option) => {
            const active = value === option.value;
            return (
              <button
                className={active ? "imageStyleCard active" : "imageStyleCard"}
                key={option.value}
                onClick={() => onChange(option.value)}
                type="button"
              >
                {option.previewUrl ? <img alt={option.label} className="imageStylePreview" src={option.previewUrl} /> : <div className="imageStylePreview imageStylePreviewPlaceholder" />}
                <span className="imageStyleLabel">{option.label}</span>
                {active ? <span className="imageStyleSelected">✓</span> : null}
              </button>
            );
          })}
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
      {isImageCard ? (
        <>
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
        </>
      ) : (
        <>
          <span>支持上传文档、图片或参考资料。</span>
          <input disabled type="file" />
        </>
      )}
    </div>
  );
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
  if (!exampleTitle) return "我最近发现，很多客户买保险时，第一反应还是先问价格。\n\n但真正应该先想清楚的，是你买这份保障到底要解决什么风险。";
  return `${exampleTitle}\n\n请围绕这个观点，保留接地气、像真人说话的表达方式，生成适合不同平台直接发布的内容。`;
}

function describeWriteCopyTarget(value: string) {
  if (value === "video_script") return "适合短视频口播、出镜表达";
  if (value === "xiaohongshu") return "适合图文笔记、标题封面";
  if (value === "wechat_article") return "适合长文论证、公众号排版";
  if (value === "moments") return "适合短表达、朋友圈发布";
  return "按该平台的内容方式生成";
}
