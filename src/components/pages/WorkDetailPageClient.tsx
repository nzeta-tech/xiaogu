"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";
import { parseCreationOutput, type CreationOutputBatch, type CreationOutputItem } from "@/lib/creation/output";

type WorkDetail = {
  id: string;
  title: string;
  content: string;
  content_json?: { batches?: CreationOutputBatch[] } | null;
  platform: string;
  status: string;
  compliance_risk: string;
  created_at: string;
  updated_at: string;
  conversation_id: string | null;
  note?: string;
  versions?: Array<{ id: string; version_no: number; created_from: string; created_at: string }>;
  app_run?: {
    id: string;
    status: string;
    tone?: string | null;
    target_channels?: string[];
    model?: string | null;
    quota_cost?: number | null;
    input_payload?: Record<string, unknown> | null;
    result_json?: Record<string, unknown> | null;
    created_at: string;
    completed_at?: string | null;
  } | null;
};

type WechatTheme = "default" | "warm" | "forest";
type XhsFormat = "plain" | "image";
type XhsTemplate = "journal" | "side-card" | "aurora" | "classic-red" | "memo" | "night-card" | "minimal" | "simple" | "star-card";
type XhsFontSize = "sm" | "md" | "lg" | "xl";
type CopyState = Record<string, boolean>;
type GeneratedImage = { id: string; url: string };
type ImageGenerationMode = "image" | "demo" | "fallback" | "rate_limited" | "";
type PreviewField = { label: string; value: string; mode?: "plain" | "markdown" };
type PreviewImage = { label: string; url: string };
type WorkStreamState = {
  connected: boolean;
  content: string;
  images: GeneratedImage[];
  imageMode: ImageGenerationMode;
  retryable: boolean;
  error: string;
};

export function WorkDetailPageClient({ workId }: { workId: string }) {
  const searchParams = useSearchParams();
  const [work, setWork] = useState<WorkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("run-info");
  const [activeBatchId, setActiveBatchId] = useState("");
  const [activeItemIds, setActiveItemIds] = useState<Record<string, string>>({});
  const [fontScale, setFontScale] = useState(100);
  const [wechatThemes, setWechatThemes] = useState<Record<string, WechatTheme>>({});
  const [xhsFormats, setXhsFormats] = useState<Record<string, XhsFormat>>({});
  const [xhsDrafts, setXhsDrafts] = useState<Record<string, string>>({});
  const [xhsTemplates, setXhsTemplates] = useState<Record<string, XhsTemplate>>({});
  const [xhsFontSizes, setXhsFontSizes] = useState<Record<string, XhsFontSize>>({});
  const [copied, setCopied] = useState<CopyState>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [imageNotice, setImageNotice] = useState("");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [retryingImages, setRetryingImages] = useState(false);
  const [previewField, setPreviewField] = useState<PreviewField | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [streamState, setStreamState] = useState<WorkStreamState>({
    connected: false,
    content: "",
    images: [],
    imageMode: "",
    retryable: false,
    error: "",
  });
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const copyTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const imageTimerRef = useRef<number | null>(null);
  const streamReaderAbortRef = useRef<AbortController | null>(null);
  const closePreviews = useEffectEvent(() => {
    setPreviewField(null);
    setPreviewImage(null);
  });

  useEffect(() => {
    const controller = new AbortController();
    async function loadWork() {
      try {
        setLoading(true);
        const response = await fetch(apiPath(`/api/works/${workId}`), { signal: controller.signal });
        const payload = (await response.json()) as { work?: WorkDetail };
        setWork(payload.work ?? null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        throw error;
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadWork();
    return () => controller.abort();
  }, [workId]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (imageTimerRef.current) window.clearTimeout(imageTimerRef.current);
      streamReaderAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!previewField && !previewImage) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreviews();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePreviews, previewField, previewImage]);

  useEffect(() => {
    if (!work) return;
    if (work.app_run?.status && work.app_run.status !== "running") return;
    if (work.content.trim() && work.app_run?.status !== "running") return;

    const timer = window.setInterval(async () => {
      const response = await fetch(apiPath(`/api/works/${workId}`));
      const payload = (await response.json()) as { work?: WorkDetail };
      if (payload.work) {
        setWork(payload.work);
        if (payload.work.app_run?.status && payload.work.app_run.status !== "running") {
          window.clearInterval(timer);
        }
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [workId, work?.app_run?.status, work?.content]);

  useEffect(() => {
    streamReaderAbortRef.current?.abort();
    setStreamState({
      connected: false,
      content: "",
      images: [],
      imageMode: "",
      retryable: false,
      error: "",
    });

    if (!work?.app_run || work.app_run.status !== "running") return;
    if (work.platform !== "write-copy" && work.platform !== "image-card") return;

    const controller = new AbortController();
    streamReaderAbortRef.current = controller;

    async function connectWorkStream() {
      try {
        const response = await fetch(apiPath(`/api/works/${workId}/stream`), {
          signal: controller.signal,
          headers: { accept: "text/event-stream" },
        });
        if (!response.ok || !response.body) return;

        setStreamState((current) => ({ ...current, connected: true, error: "" }));

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part
              .split("\n")
              .map((segment) => segment.trim())
              .find((segment) => segment.startsWith("data:"));
            if (!line) continue;

            const payload = JSON.parse(line.slice(5).trim()) as {
              type?: string;
              content?: string;
              result?: string;
              images?: GeneratedImage[];
              imageMode?: ImageGenerationMode | null;
              retryable?: boolean;
            };

            if (payload.type === "delta" && typeof payload.content === "string") {
              setStreamState((current) => ({
                ...current,
                content: current.content + payload.content,
              }));
            }

            if (payload.type === "images") {
              setStreamState((current) => ({
                ...current,
                images: Array.isArray(payload.images) ? payload.images.filter((item) => item?.url) : current.images,
                imageMode: payload.imageMode ?? current.imageMode,
                retryable: payload.retryable ?? current.retryable,
              }));
            }

            if (payload.type === "done") {
              setStreamState((current) => ({
                ...current,
                content: payload.result ?? current.content,
                images: Array.isArray(payload.images) ? payload.images.filter((item) => item?.url) : current.images,
                imageMode: payload.imageMode ?? current.imageMode,
                retryable: payload.retryable ?? current.retryable,
                connected: false,
              }));
              const refreshed = await fetch(apiPath(`/api/works/${workId}`), { signal: controller.signal });
              const refreshedPayload = (await refreshed.json()) as { work?: WorkDetail };
              if (refreshedPayload.work) setWork(refreshedPayload.work);
            }

            if (payload.type === "error") {
              setStreamState((current) => ({
                ...current,
                connected: false,
                error: payload.content ?? "内容生成失败",
              }));
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setStreamState((current) => ({
          ...current,
          connected: false,
          error: "生成流连接中断，已切回结果轮询。",
        }));
      }
    }

    void connectWorkStream();
    return () => controller.abort();
  }, [work, workId]);

  const streamedBatches = useMemo(() => {
    if (!streamState.content.trim()) return [];
    return parseCreationOutput(streamState.content).batches;
  }, [streamState.content]);

  const batches = useMemo(() => {
    if (!work) return [];
    if (work.platform === "write-copy" && streamedBatches.length > 0) return streamedBatches;
    if (work.platform === "write-copy") return parseCreationOutput(work.content).batches;
    if (work.platform === "lead-copy") return parseCreationOutput(work.content).batches;
    if (work.content_json?.batches?.length) return work.content_json.batches;
    return parseCreationOutput(work.content).batches;
  }, [streamedBatches, work]);

  const imageResults = useMemo(() => {
    if (streamState.images.length > 0) return streamState.images;
    const images = work?.app_run?.result_json?.images;
    if (!Array.isArray(images)) return [];
    return images
      .map((item, index) => {
        if (!item || typeof item !== "object") return null;
        const image = item as { id?: unknown; url?: unknown };
        if (typeof image.url !== "string" || !image.url.trim()) return null;
        return {
          id: typeof image.id === "string" ? image.id : `generated-${index + 1}`,
          url: image.url,
        };
      })
      .filter((item): item is GeneratedImage => Boolean(item));
  }, [streamState.images, work]);

  const inputEntries = useMemo(() => {
    const payload = work?.app_run?.input_payload;
    if (!payload) return [];
    return Object.entries(payload).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
    });
  }, [work]);

  const imageMode = streamState.imageMode || (
    typeof work?.app_run?.result_json?.imageMode === "string"
      ? work.app_run.result_json.imageMode as ImageGenerationMode
      : ""
  );
  const imageRetryable = streamState.retryable || Boolean(work?.app_run?.result_json?.retryable);
  const isImageWork = work?.platform === "image-card";
  const defaultWatermark = typeof work?.app_run?.input_payload?.signature === "string" ? work.app_run.input_payload.signature.trim() : "";
  const effectiveWatermark = watermarkEnabled ? (watermarkText.trim() || defaultWatermark) : "";
  const imageScale = isImageWork ? Math.max(90, Math.min(140, fontScale)) : fontScale;
  const isWriteCopyWork = work?.platform === "write-copy";
  const isVideoScriptPolishWork = work?.platform === "video-script-polish";
  const isWechatArticlePolishWork = work?.platform === "wechat-article-polish";
  const isPolishWork = isVideoScriptPolishWork || isWechatArticlePolishWork;

  const resolvedBatchId = activeBatchId || batches[0]?.id || "";
  const activeBatch = batches.find((batch) => batch.id === resolvedBatchId) ?? batches[0] ?? null;

  useEffect(() => {
    setActiveItemIds((current) => {
      const next = { ...current };
      for (const batch of batches) {
        if (!batch.items.length) continue;
        if (!next[batch.id] || !batch.items.some((item) => item.id === next[batch.id])) {
          next[batch.id] = batch.items[0].id;
        }
      }
      return next;
    });
  }, [batches]);

  function switchBatch(batchId: string) {
    setActiveBatchId(batchId);
    setActiveSection("generated-content");
    sectionRefs.current[batchId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function switchBatchItem(batchId: string, itemId: string) {
    setActiveItemIds((current) => ({
      ...current,
      [batchId]: itemId,
    }));
  }

  function jumpToSection(sectionId: string) {
    setActiveSection(sectionId);
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleCopy(key: string, text: string) {
    const success = await copyText(text);
    if (!success) return;
    setCopied((current) => ({ ...current, [key]: true }));
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopied((current) => ({ ...current, [key]: false }));
    }, 1400);
  }

  function handleExport(title: string, body: string) {
    exportWord(title, body);
  }

  async function handleImageDownload(url: string, filename: string) {
    const finalUrl = await buildWatermarkedAsset(url, effectiveWatermark);
    downloadAsset(finalUrl, filename);
    flashImageNotice("图片已开始下载");
  }

  async function handleImageCopy(url: string) {
    const finalUrl = await buildWatermarkedAsset(url, effectiveWatermark);
    const success = await copyImage(finalUrl);
    flashImageNotice(success ? "图片已复制" : "当前浏览器暂不支持复制图片");
  }

  async function handleImageOpen(url: string) {
    setPreviewImage({ label: "原图预览", url });
  }

  async function handleBatchDownload(images: GeneratedImage[]) {
    for (const [index, image] of images.entries()) {
      const finalUrl = await buildWatermarkedAsset(image.url, effectiveWatermark);
      downloadAsset(finalUrl, `图片结果-${index + 1}.png`);
    }
    flashImageNotice(`已开始下载 ${images.length} 张图片`);
  }

  function flashImageNotice(message: string) {
    setImageNotice(message);
    if (imageTimerRef.current) window.clearTimeout(imageTimerRef.current);
    imageTimerRef.current = window.setTimeout(() => setImageNotice(""), 1800);
  }

  async function retryImageGeneration() {
    const payload = work?.app_run?.input_payload;
    if (!work || !payload || retryingImages) return;

    setRetryingImages(true);
    flashImageNotice("正在重新排队生成图片...");
    try {
      const response = await fetch(apiPath(`/api/creation/apps/${work.platform}/prepare`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: payload }),
      });
      const next = (await response.json().catch(() => ({}))) as { work?: { id?: string } };
      if (response.ok && next.work?.id && next.work.id !== work.id) {
        window.location.href = appPath(`/works/${next.work.id}?from=creation-works`);
      }
    } finally {
      setRetryingImages(false);
    }
  }

  function updateWechatTheme(itemId: string, theme: WechatTheme) {
    setWechatThemes((current) => ({ ...current, [itemId]: theme }));
  }

  function updateXhsFormat(itemId: string, format: XhsFormat) {
    setXhsFormats((current) => ({ ...current, [itemId]: format }));
  }

  function updateXhsDraft(itemId: string, value: string) {
    setXhsDrafts((current) => ({ ...current, [itemId]: value }));
  }

  function updateXhsTemplate(itemId: string, value: XhsTemplate) {
    setXhsTemplates((current) => ({ ...current, [itemId]: value }));
  }

  function updateXhsFontSize(itemId: string, value: XhsFontSize) {
    setXhsFontSizes((current) => ({ ...current, [itemId]: value }));
  }

  async function saveItemContent(itemId: string, nextBody: string) {
    if (!work) return;
    const nextWork = mergeItemBody(work, itemId, nextBody);
    setWork(nextWork);
    setSavingItemId(itemId);
    setSaveMessage("正在保存...");

    const response = await fetch(apiPath(`/api/works/${work.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "draft",
        title: nextWork.title,
        content: nextWork.content,
        contentJson: nextWork.content_json,
      }),
    });

    const payload = (await response.json()) as { work?: WorkDetail; error?: string };
    if (payload.work) {
      setWork(payload.work);
      setSaveMessage("已自动保存到我的作品");
    } else {
      setSaveMessage(payload.error ?? "保存失败");
    }

    setSavingItemId(null);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSaveMessage(""), 1800);
  }

  if (loading) {
    return <div className="pageStack"><section className="panel emptyState">正在加载作品详情...</section></div>;
  }

  if (!work) {
    return <div className="pageStack"><section className="panel emptyState">没有找到这条作品。</section></div>;
  }

  if (isImageWork) {
    const imageMeta = buildImageWorkMeta(work);
    const imageInputEntries = buildImageInputEntries(work);
    const generatedCount = imageResults.length;
    const generationNotice = formatImageGenerationNotice(imageMode);
    const showImagePlaceholders = imageResults.length === 0 && work.app_run?.status === "running";
    const imageFieldMissingHint = !imageMeta.hasPayload
      ? "这条作品当前没有关联到完整的实例输入数据，所以部分输入字段暂时无法还原。修复后新生成的作品会显示完整字段。"
      : "";

    return (
      <div className="workDetailPage imageInstancePage">
        <div className="page-content imageInstanceShell">
          <section className="imageInstanceHero">
            <div className="imageInstanceHeroCopy">
              <div className="imageInstanceHeroTitleRow">
                <span className="imageInstanceHeroBadge">{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</span>
                <strong>{formatAppLabel(work.platform)}</strong>
              </div>
              <h1>{imageMeta.title}</h1>
              <p>按目标实例页的阅读节奏，先看实例信息，再看图片结果、签名和下载动作。图片生成完成后会自动回填到结果区。</p>
            </div>
            <div className="imageInstanceHeroMeta">
              <div>
                <span>图片风格</span>
                <strong>{imageMeta.style}</strong>
              </div>
              <div>
                <span>宽高比例</span>
                <strong>{imageMeta.ratio}</strong>
              </div>
              <div>
                <span>结果数量</span>
                <strong>{generatedCount} 张</strong>
              </div>
            </div>
          </section>

          <div className="imageInstanceLayout">
            <aside className="imageInstanceSidebar">
              <div className="imageInstanceSidebarCard">
                <div className="sidebarBackRow">
                  <a className="back-btn backLink imageInstanceBack" href={appPath("/drafts")}>返回作品列表</a>
                </div>
                <div className="imageSidebarSection">
                  <strong>内容导航</strong>
                  <button
                    className={activeSection === "run-info" ? "imageSidebarButton active" : "imageSidebarButton"}
                    onClick={() => jumpToSection("run-info")}
                    type="button"
                  >
                    基本信息
                  </button>
                  <button
                    className={activeSection === "instance-info" ? "imageSidebarButton active" : "imageSidebarButton"}
                    onClick={() => jumpToSection("instance-info")}
                    type="button"
                  >
                    实例信息
                  </button>
                  <button
                    className={activeSection === "generated-content" ? "imageSidebarButton active" : "imageSidebarButton"}
                    onClick={() => jumpToSection("generated-content")}
                    type="button"
                  >
                    生成的图片
                  </button>
                </div>

                <div className="imageSidebarSection">
                  <strong>内容缩放</strong>
                  <div className="imageZoomGroup imageZoomGroupCompact">
                    <button className={imageScale < 100 ? "imageZoomButton active" : "imageZoomButton"} onClick={() => setFontScale((current) => Math.max(90, current - 10))} type="button">A-</button>
                    <button className={imageScale === 100 ? "imageZoomButton active" : "imageZoomButton"} onClick={() => setFontScale(100)} type="button">{imageScale}%</button>
                    <button className={imageScale > 100 ? "imageZoomButton active" : "imageZoomButton"} onClick={() => setFontScale((current) => Math.min(140, current + 10))} type="button">A+</button>
                  </div>
                </div>
              </div>
            </aside>

            <main className="imageInstanceMain">
              <section
                className="imageInstanceCard imageInfoCard"
                ref={(node) => { sectionRefs.current["run-info"] = node; }}
              >
                <div className="imageSectionHeader">
                  <div>
                    <h2>实例信息</h2>
                    <p>对应目标页首屏中的标题、时间和输入信息区域。</p>
                  </div>
                  <div className="imageSectionMeta">
                    <span>创建时间</span>
                    <strong>{formatDate(work.created_at)}</strong>
                  </div>
                </div>
                <div className="imageInfoTable">
                  <div className="imageInfoTableRow imageInfoTableHeader">
                    <div className="imageInfoTableLabel">标题</div>
                    <div className="imageInfoTableValue imageInfoTableTitleCell">
                      <div className="imageTitleValue">
                        <em>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</em>
                        <strong>{imageMeta.title}</strong>
                      </div>
                    </div>
                    <div className="imageInfoTableLabel imageInfoTimeLabel">创建时间</div>
                    <div className="imageInfoTableValue imageInfoTimeValue">{formatDate(work.created_at)}</div>
                  </div>
                  <div className="imageInfoTableRow imageInfoTableBody" ref={(node) => { sectionRefs.current["instance-info"] = node; }}>
                    <div className="imageInfoTableLabel">输入内容</div>
                    <div className="imageInfoTableValue imageInfoSourceValue">
                      <div className="imageInputMetaScroll">
                        <div className="imageInputMetaCompact">
                          {imageInputEntries.map((entry) => (
                            <div className={`imageMetaBadgeRow ${entry.actionLabel ? "imageMetaBadgeRowAction" : ""}`} key={entry.key}>
                              <span>{entry.label}</span>
                              {entry.actionLabel ? (
                                <div className="imageInputAction">
                                  <strong>{entry.actionLabel}</strong>
                                  <button
                                    className="instanceActionButton"
                                    onClick={() => setPreviewField({ label: entry.label, value: entry.previewValue ?? "", mode: "plain" })}
                                    type="button"
                                  >
                                    查看
                                  </button>
                                </div>
                              ) : (
                                <strong>{entry.value}</strong>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="imageInstanceCard imageResultsCard"
                ref={(node) => { sectionRefs.current["generated-content"] = node; }}
              >
                <div className="imageResultsHeader">
                  <div>
                    <h2>生成的图片</h2>
                    <p>共 {generatedCount} 张</p>
                  </div>
                  <div className="instanceResultActions">
                    {imageRetryable ? (
                      <button
                        className="instanceActionButton"
                        disabled={retryingImages}
                        onClick={() => void retryImageGeneration()}
                        type="button"
                      >
                        {retryingImages ? "重试排队中..." : "重试生成"}
                      </button>
                    ) : null}
                    <button
                      className="instanceActionButton"
                      onClick={() => jumpToSection("instance-info")}
                      type="button"
                    >
                      查看输入
                    </button>
                    <button
                      className="instancePrimaryAction"
                      disabled={imageResults.length === 0}
                      onClick={() => void handleBatchDownload(imageResults)}
                      type="button"
                    >
                      打包下载
                    </button>
                  </div>
                </div>

                <div className="imageResultTools">
                  <div className="signaturePanel">
                    <div className="signaturePanelHeader">
                      <strong>添加签名水印</strong>
                      <button
                        aria-pressed={watermarkEnabled}
                        className={watermarkEnabled ? "signatureSwitch active" : "signatureSwitch"}
                        onClick={() => setWatermarkEnabled((current) => !current)}
                        type="button"
                      >
                        <span />
                      </button>
                    </div>
                    <div className="signaturePanelInputRow">
                      <input
                        className="creationInput el-input__inner signatureInput"
                        disabled={!watermarkEnabled}
                        maxLength={50}
                        onChange={(event) => setWatermarkText(event.target.value)}
                        placeholder="请输入签名水印内容"
                        type="text"
                        value={watermarkText}
                      />
                      <span>{(watermarkText.trim() || defaultWatermark).length} / 50</span>
                    </div>
                    <p>开启后，下载和复制的图片将带有签名水印</p>
                  </div>

                  <div className="imageResultSummaryCard">
                    <strong>结果说明</strong>
                    <div className="imageResultSummaryList">
                      <div>
                        <span>出图模式</span>
                        <strong>{formatImageModeLabel(imageMode)}</strong>
                      </div>
                      <div>
                        <span>人物形象</span>
                        <strong>{imageMeta.drawPortrait}</strong>
                      </div>
                      <div>
                        <span>签名状态</span>
                        <strong>{watermarkEnabled ? (effectiveWatermark || "已开启") : "未开启"}</strong>
                      </div>
                    </div>
                    <p>这一区保留目标页常见的结果摘要，方便在下载前快速确认出图配置。</p>
                  </div>
                </div>

                <div className="imageNotices">
                  {generationNotice ? (
                    <div className="imageModeNotice">{generationNotice}</div>
                  ) : null}
                  {imageFieldMissingHint ? (
                    <div className="imageModeNotice">{imageFieldMissingHint}</div>
                  ) : null}
                  {imageNotice ? <div className="imageActionNotice">{imageNotice}</div> : null}
                </div>

                <div className="generatedImagesGrid" style={{ fontSize: `${imageScale}%` }}>
                  {imageResults.length > 0 ? imageResults.map((image, index) => (
                    <article className="generatedImageCard" key={image.id}>
                      <div className="generatedImageHeader">
                        <div className="generatedImageMeta">
                          <strong>结果 {index + 1}</strong>
                          <span>{imageMeta.ratio} · {imageMeta.style}</span>
                        </div>
                      </div>
                      <div className="generatedImageMedia">
                        <img alt={`生成结果 ${index + 1}`} className="generatedImageAsset" src={image.url} />
                      </div>
                      <div className="generatedImageActions">
                        <button className="instanceActionButton" onClick={() => void handleImageDownload(image.url, `图片结果-${index + 1}.png`)} type="button">下载</button>
                        <button className="instanceActionButton" onClick={() => void handleImageCopy(image.url)} type="button">复制图片</button>
                      </div>
                    </article>
                  )) : (
                    <article className="generatedImageCard placeholder">
                      <div className="generatedImagePlaceholder">
                        <div className="generatedImageSkeleton" />
                        <strong>{showImagePlaceholders ? "图片生成中..." : "当前还没有图片结果"}</strong>
                        <p>{showImagePlaceholders ? "生成完成后会自动替换为真实图片。" : "这条作品暂时没有返回可展示的图片。"}</p>
                      </div>
                    </article>
                  )}
                </div>
              </section>
            </main>
          </div>
        </div>

        {previewField ? <PreviewFieldModal previewField={previewField} onClose={() => setPreviewField(null)} /> : null}
        {previewImage ? <PreviewImageModal previewImage={previewImage} onClose={() => setPreviewImage(null)} /> : null}
      </div>
    );
  }

  if (isWriteCopyWork) {
    const sourceText = typeof work.app_run?.input_payload?.source === "string" ? work.app_run.input_payload.source : "";
    return (
      <div className="workDetailPage instanceOriginPage writeCopyOriginPage">
        <div className="page-content instanceOriginShell">
          <section className="instanceOriginLayout">
            <aside className="instanceOriginSidebar">
              <div className="instanceOriginSidebarCard">
                <div className="sidebarBackRow">
                  <a className="back-btn backLink instanceTextBack" href={appPath("/drafts")}>返回作品列表</a>
                </div>

                <div className="instanceSidebarSection">
                  <strong>内容导航</strong>
                  <button
                    className={activeSection === "run-info" ? "instanceNavButton active" : "instanceNavButton"}
                    onClick={() => jumpToSection("run-info")}
                    type="button"
                  >
                    基本信息
                  </button>
                  <button
                    className={activeSection === "input-info" ? "instanceNavButton active" : "instanceNavButton"}
                    onClick={() => jumpToSection("input-info")}
                    type="button"
                  >
                    实例信息
                  </button>
                  <button
                    className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"}
                    onClick={() => jumpToSection("generated-content")}
                    type="button"
                  >
                    生成内容
                  </button>
                </div>

                <div className="instanceSidebarSection">
                  <strong>内容缩放</strong>
                  <div className="instanceZoomGroup">
                    <button className={fontScale < 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.max(90, current - 10))} type="button">A-</button>
                    <button className={fontScale === 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale(100)} type="button">{fontScale}%</button>
                    <button className={fontScale > 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.min(140, current + 10))} type="button">A+</button>
                  </div>
                </div>

                <div className="instanceSidebarSection">
                  <strong>生成内容</strong>
                  {batches.map((batch) => (
                    <button
                      className={activeBatch?.id === batch.id ? "instanceNavButton active" : "instanceNavButton"}
                      key={batch.id}
                      onClick={() => switchBatch(batch.id)}
                      type="button"
                    >
                      {formatBatchNavLabel(batch.label, batch.items.length, true)}
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <main className="instanceOriginMain">
              <section className="instanceOriginNotice">
                <span>本作品使用资深创作者风格创作，若想打造自己的个性化风格，</span>
                <a href={appPath("/thinking")}>请填写思维问卷 →</a>
              </section>

              <section
                className="instanceSectionCard instanceOriginInfoCard"
                ref={(node) => { sectionRefs.current["run-info"] = node; }}
              >
                <div className="instanceSectionHeader instanceOriginHeader">
                  <div>
                    <h1>{formatAppLabel(work.platform)}</h1>
                    <p>{streamState.connected ? "内容正在持续生成中，结果会按真实进度逐步回填。" : "已按实例页结构展示本次生成结果，可继续复制、导出和保存。"}</p>
                  </div>
                  <div className="instanceCloneHeroMeta instanceOriginMeta">
                    <span>{formatAppLabel(work.platform)}</span>
                    <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
                    <em>{formatDate(work.updated_at)}</em>
                  </div>
                </div>
                <div className="instanceTargetTable instanceOriginTable">
                  <div className="instanceTargetRow">
                    <div className="instanceTargetCell">
                      <span>标题</span>
                      <div className="instanceOriginTitleCell">
                        <em>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</em>
                        <strong>{formatWorkTitle(work)}</strong>
                      </div>
                    </div>
                    <div className="instanceTargetCell">
                      <span>创建时间</span>
                      <strong>{formatDate(work.created_at)}</strong>
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="instanceSectionCard instanceOriginInputCard"
                ref={(node) => { sectionRefs.current["input-info"] = node; }}
              >
                <div className="instanceSectionHeader">
                  <h2>实例信息</h2>
                </div>
                <div className="instanceSourceMetaList instanceOriginSourceTable">
                  <div className="instanceSourceMetaItem">
                    <span>表达倾向</span>
                    <strong>{formatToneLabel(work.app_run?.tone) || "-"}</strong>
                  </div>
                  <div className="instanceSourceMetaItem">
                    <span>创作素材</span>
                    <div className="instanceInputActionRow">
                      <strong>文本输入</strong>
                      <button className="instanceActionButton" onClick={() => setPreviewField({ label: "创作素材", value: sourceText, mode: "plain" })} type="button">查看</button>
                    </div>
                  </div>
                  <div className="instanceSourceMetaItem">
                    <span>生成内容</span>
                    <strong>{formatChannelLabels(work.app_run?.target_channels ?? []) || "-"}</strong>
                  </div>
                </div>
              </section>

              <section
                className="instanceSectionCard writeCopyResultSectionCard instanceOriginResultCard"
                ref={(node) => { sectionRefs.current["generated-content"] = node; }}
              >
                <div className="instanceSectionHeader instanceSectionHeaderSplit">
                  <div>
                    <h2>生成内容</h2>
                    <p>按目标实例页的阅读顺序展示口播稿、小红书、公众号和朋友圈结果。</p>
                  </div>
                  {streamState.connected
                    ? <span className="instanceSaveHint">内容生成中，正在持续回填结果...</span>
                    : saveMessage ? <span className="instanceSaveHint">{savingItemId ? "正在保存..." : saveMessage}</span> : null}
                </div>

                {streamState.error ? (
                  <div className="imageModeNotice">{streamState.error}</div>
                ) : null}

                {batches.length > 0 ? (
                  <div className="instanceBatchStack writeCopyBatchStack instanceOriginBatchStack" style={{ fontSize: `${fontScale}%` }}>
                    {batches.map((batch) => (
                      <section
                        className="instanceBatchGroup writeCopyBatchGroup instanceOriginBatchGroup"
                        key={batch.id}
                        ref={(node) => { sectionRefs.current[batch.id] = node; }}
                      >
                        <div className="instanceBatchHeading">{formatBatchHeading(batch.label, batch.items.length, true)}</div>
                        <div className="instanceBatchItemTabs writeCopyBatchItemTabs instanceOriginBatchTabs">
                          {batch.items.map((item) => (
                            <button
                              className={[
                                "instanceItemTab writeCopyItemTab",
                                (activeItemIds[batch.id] ?? batch.items[0]?.id) === item.id ? "active" : "",
                              ].filter(Boolean).join(" ")}
                              key={item.id}
                              onClick={() => switchBatchItem(batch.id, item.id)}
                              type="button"
                            >
                              {formatItemTabLabel(item.title, batch.label, batch.items.length, batch.items.findIndex((candidate) => candidate.id === item.id))}
                            </button>
                          ))}
                        </div>
                        {(() => {
                          const activeItem = batch.items.find((item) => item.id === (activeItemIds[batch.id] ?? batch.items[0]?.id)) ?? batch.items[0];
                          if (!activeItem) return null;
                          return (
                          <ResultBlock
                            copied={Boolean(copied[activeItem.id])}
                            isWriteCopy
                            item={activeItem}
                            key={activeItem.id}
                            onCopy={() => void handleCopy(activeItem.id, getEditableBody(activeItem, xhsDrafts))}
                            onExport={() => handleExport(activeItem.title, getEditableBody(activeItem, xhsDrafts))}
                            onSave={saveItemContent}
                            saving={savingItemId === activeItem.id}
                            theme={wechatThemes[activeItem.id] ?? "default"}
                            xhsDraft={xhsDrafts[activeItem.id] ?? activeItem.body}
                            xhsFormat={xhsFormats[activeItem.id] ?? "plain"}
                            xhsTemplate={xhsTemplates[activeItem.id] ?? "journal"}
                            xhsFontSize={xhsFontSizes[activeItem.id] ?? "md"}
                            onThemeChange={updateWechatTheme}
                            onXhsDraftChange={updateXhsDraft}
                            onXhsFormatChange={updateXhsFormat}
                            onXhsTemplateChange={updateXhsTemplate}
                            onXhsFontSizeChange={updateXhsFontSize}
                          />
                          );
                        })()}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="instancePlainResult" style={{ fontSize: `${fontScale}%` }}>
                    <MarkdownContent content={streamState.content || work.content} />
                  </div>
                )}
              </section>
            </main>
          </section>
        </div>

        {previewField ? <PreviewFieldModal previewField={previewField} onClose={() => setPreviewField(null)} /> : null}
      </div>
    );
  }

  return (
    <div className={isWriteCopyWork ? "workDetailPage instanceClonePage writeCopyWorkDetailPage" : isPolishWork ? "workDetailPage instanceClonePage polishWorkDetailPage" : "workDetailPage instanceClonePage"}>
      <div className="page-content instanceCloneShell">
        <section className={isWriteCopyWork ? "instanceCloneHero writeCopyInstanceHero" : isPolishWork ? "instanceCloneHero polishInstanceHero" : "instanceCloneHero"}>
          <div className="instanceCloneHeroHeader">
            <div className="instanceCloneTitleBlock">
              <h1>{formatWorkTitle(work)}</h1>
              <p>{isWriteCopyWork ? "本作品使用资深创作者风格创作，若想打造自己的个性化风格，请填写思维问卷。" : isVideoScriptPolishWork ? "这条作品保留了原稿的核心意思，同时把开头、结构和表达节奏重新提了一层，方便你直接复看、复制和继续改稿。" : isWechatArticlePolishWork ? "这条作品以现有文章为底稿，重点重做了标题、结构推进、语言质感和结尾互动，方便你直接进入长文阅读和继续调整。" : "本作品使用资深创作者风格创作，若想打造自己的个性化风格，请填写思维问卷。"}</p>
            </div>
            <div className="instanceCloneHeroMeta compact">
              <span>{formatAppLabel(work.platform)}</span>
              <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
              <em>{formatDate(work.updated_at)}</em>
            </div>
          </div>
          {isWriteCopyWork ? (
            <div className="writeCopyInstanceHeroSummary">
              <div>
                <span>表达倾向</span>
                <strong>{formatToneLabel(work.app_run?.tone) || "更像自己"}</strong>
              </div>
              <div>
                <span>生成内容</span>
                <strong>{formatChannelLabels(work.app_run?.target_channels ?? []) || "多平台内容"}</strong>
              </div>
              <div>
                <span>结果数量</span>
                <strong>{countWriteCopyOutputs(batches)} 条</strong>
              </div>
            </div>
          ) : null}
          {isPolishWork ? (
            <div className="polishInstanceHeroSummary">
              <div>
                <span>原稿类型</span>
                <strong>{isVideoScriptPolishWork ? "口播底稿" : "公众号成稿"}</strong>
              </div>
              <div>
                <span>重点优化</span>
                <strong>{formatPolishSummary(work.app_run?.input_payload, isVideoScriptPolishWork ? "goal" : "target")}</strong>
              </div>
              <div>
                <span>结果结构</span>
                <strong>{countWriteCopyOutputs(batches) > 0 ? `${countWriteCopyOutputs(batches)} 个结果块` : "精修结果正文"}</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className="instanceCloneLayout">
          <aside className="instanceCloneSidebar">
            <div className="instanceCloneSidebarCard instanceTargetSidebarCard">
              <div className="sidebarBackRow">
                <a className="back-btn backLink instanceTextBack" href={appPath("/drafts")}>返回作品列表</a>
              </div>
              <div className="instanceSidebarSection">
                <strong>内容导航</strong>
                <button
                  className={activeSection === "run-info" ? "instanceNavButton active" : "instanceNavButton"}
                  onClick={() => jumpToSection("run-info")}
                  type="button"
                >
                  基本信息
                </button>
                {inputEntries.length > 0 ? (
                  <button
                    className={activeSection === "input-info" ? "instanceNavButton active" : "instanceNavButton"}
                    onClick={() => jumpToSection("input-info")}
                    type="button"
                  >
                    输入内容
                  </button>
                ) : null}
                <button
                  className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"}
                  onClick={() => jumpToSection("generated-content")}
                  type="button"
                >
                  生成内容
                </button>
              </div>

              <div className="instanceSidebarSection">
                <strong>内容缩放</strong>
                <div className="instanceZoomGroup">
                  <button className={fontScale < 100 ? "instanceZoomButton active" : "instanceZoomButton"} disabled={isImageWork} onClick={() => setFontScale((current) => Math.max(90, current - 10))} type="button">A-</button>
                  <button className={fontScale === 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale(100)} type="button">{fontScale}%</button>
                  <button className={fontScale > 100 ? "instanceZoomButton active" : "instanceZoomButton"} disabled={isImageWork} onClick={() => setFontScale((current) => Math.min(140, current + 10))} type="button">A+</button>
                </div>
              </div>

              <div className="instanceSidebarSection batchNavSection">
                <strong>生成内容</strong>
                {isImageWork && imageResults.length > 0 ? (
                  <button
                    className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"}
                    onClick={() => jumpToSection("generated-content")}
                    type="button"
                  >
                    图片结果x{imageResults.length}
                  </button>
                ) : (
                  batches.map((batch) => (
                    <button
                      className={activeBatch?.id === batch.id ? "instanceNavButton active" : "instanceNavButton"}
                      key={batch.id}
                      onClick={() => switchBatch(batch.id)}
                      type="button"
                    >
                      {formatBatchNavLabel(batch.label, batch.items.length, isWriteCopyWork)}
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>

          <main className="instanceCloneMain">
            <section
              className="instanceSectionCard instanceInfoSectionCard"
              ref={(node) => { sectionRefs.current["run-info"] = node; }}
            >
              <div className="instanceTargetTable">
                <div className="instanceTargetRow">
                  <div className="instanceTargetCell">
                    <span>标题</span>
                    <strong>{formatWorkTitle(work)}</strong>
                  </div>
                  <div className="instanceTargetCell">
                    <span>状态</span>
                    <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
                  </div>
                </div>
                <div className="instanceTargetRow">
                  <div className="instanceTargetCell">
                    <span>创建时间</span>
                    <strong>{formatDate(work.created_at)}</strong>
                  </div>
                  <div className="instanceTargetCell">
                    <span>输入内容</span>
                    <strong>{inputEntries.length > 0 ? "已填写" : "-"}</strong>
                  </div>
                </div>
                {isImageWork ? (
                  <div className="instanceTargetRow instanceTargetRowStack">
                    <div className="instanceTargetCell instanceTargetCellFull">
                      <span>输入内容</span>
                      <div className="instanceSourceMetaList">
                        <div className="instanceSourceMetaItem">
                          <span>{formatInputLabel("style")}</span>
                          <strong>{formatInputValue("style", work.app_run?.input_payload?.style)}</strong>
                        </div>
                        <div className="instanceSourceMetaItem">
                          <span>{formatInputLabel("source")}</span>
                          <div className="instanceInputActionRow">
                            <strong>文本输入</strong>
                            <button
                              className="instanceActionButton"
                              onClick={() => setPreviewField({ label: "图片内容", value: String(work.app_run?.input_payload?.source ?? ""), mode: "plain" })}
                              type="button"
                            >
                              查看
                            </button>
                          </div>
                        </div>
                        <div className="instanceSourceMetaItem">
                          <span>{formatInputLabel("draw_portrait")}</span>
                          <strong>{formatInputValue("draw_portrait", work.app_run?.input_payload?.draw_portrait)}</strong>
                        </div>
                        <div className="instanceSourceMetaItem">
                          <span>{formatInputLabel("ratio")}</span>
                          <strong>{formatInputValue("ratio", work.app_run?.input_payload?.ratio)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {!isImageWork ? (
                  <div className="instanceInfoGrid">
                    <div><span>实例 ID</span><strong>{work.app_run?.id ?? work.id}</strong></div>
                    <div><span>{isPolishWork ? "优化方向" : "表达倾向"}</span><strong>{isVideoScriptPolishWork ? formatInputValue("goal", work.app_run?.input_payload?.goal) : isWechatArticlePolishWork ? formatInputValue("target", work.app_run?.input_payload?.target) : formatToneLabel(work.app_run?.tone) || "-"}</strong></div>
                    <div><span>{isPolishWork ? "结果类型" : "生成内容"}</span><strong>{isVideoScriptPolishWork ? "精修版主稿 / 改稿方向" : isWechatArticlePolishWork ? "精修版长文 / 标题结构方向" : formatChannelLabels(work.app_run?.target_channels ?? []) || "-"}</strong></div>
                    <div><span>应用名称</span><strong>{formatAppLabel(work.platform)}</strong></div>
                  </div>
                ) : null}
                {isImageWork ? (
                  <div className="instanceInfoFooterMeta">
                    <div><span>应用名称</span><strong>{formatAppLabel(work.platform)}</strong></div>
                    <div><span>出图模式</span><strong>{formatImageModeLabel(imageMode)}</strong></div>
                  </div>
                ) : null}
              </div>
            </section>

            {!isImageWork && inputEntries.length > 0 ? (
              <section
                className={isWriteCopyWork ? "instanceSectionCard writeCopyInputSectionCard" : isPolishWork ? "instanceSectionCard polishInputSectionCard" : "instanceSectionCard"}
                ref={(node) => { sectionRefs.current["input-info"] = node; }}
              >
                <div className="instanceSectionHeader">
                  <h2>{isWriteCopyWork ? "实例信息" : "输入内容"}</h2>
                  <p>{isWriteCopyWork ? "按实例页结构保留本次生成时提交的素材、表达倾向和生成目标。" : isVideoScriptPolishWork ? "这里保留本次精修时提交的原始口播稿和优化方向，方便对照看改稿力度是否合适。" : isWechatArticlePolishWork ? "这里保留本次精修时提交的原始文章和优化方向，方便对照看长文结构是否真正被提起来。" : "展示本次生成时提交的原始信息。"}</p>
                </div>
                <div className="instanceInputStack compact">
                  {inputEntries.map(([key, value]) => (
                    <div className={isWriteCopyWork ? "instanceInputCard writeCopyInputCard" : isPolishWork ? "instanceInputCard polishInputCard" : "instanceInputCard"} key={key}>
                      <span>{formatInputLabel(key)}</span>
                      {(["source", "draft", "article"].includes(key)) && typeof value === "string" ? (
                        <div className="instanceInputActionRow">
                          <strong>文本输入</strong>
                          <button className="instanceActionButton" onClick={() => setPreviewField({ label: formatInputLabel(key), value, mode: "plain" })} type="button">查看</button>
                        </div>
                      ) : (
                        <strong>{formatInputValue(key, value)}</strong>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section
              className={isWriteCopyWork ? "instanceSectionCard writeCopyResultSectionCard" : isPolishWork ? "instanceSectionCard polishResultSectionCard" : "instanceSectionCard"}
              ref={(node) => { sectionRefs.current["generated-content"] = node; }}
            >
              <div className="instanceSectionHeader instanceSectionHeaderSplit">
                <div>
                  <h2>{isImageWork ? "生成的图片" : isPolishWork ? "精修结果" : "生成内容"}</h2>
                  <p>{isImageWork ? "按目标实例页的图片结果流展示图片、下载和复制动作。" : isWriteCopyWork ? "按目标实例页的阅读顺序展示口播稿、小红书、公众号和朋友圈结果。" : isVideoScriptPolishWork ? "先看精修后的主稿，再看每一段是否更顺口、更好开口，保留复制和导出动作方便继续使用。" : isWechatArticlePolishWork ? "按长文阅读节奏展示精修结果，重点看标题、段落推进、语言质感和结尾互动是否更顺。" : "按目标实例页的内容流方式，顺序展示每一组生成结果。"}</p>
                </div>
                {isImageWork ? (
                  imageNotice ? <span className="instanceSaveHint">{imageNotice}</span> : null
                ) : (
                  streamState.connected && isWriteCopyWork
                    ? <span className="instanceSaveHint">内容生成中，正在持续回填结果...</span>
                    : saveMessage ? <span className="instanceSaveHint">{savingItemId ? "正在保存..." : saveMessage}</span> : null
                )}
              </div>

              {!isImageWork && streamState.error ? (
                <div className="imageModeNotice">{streamState.error}</div>
              ) : null}

              {isImageWork ? (
                <div className="instanceImageResultStack" style={{ fontSize: `${fontScale}%` }}>
                  {imageResults.length > 0 ? (
                    <>
                      <div className="instanceImageMetaRow">
                        <span className="instanceBadge">已生成 {imageResults.length} 张图片</span>
                        <div className="instanceImageMetaActions">
                          <strong>{formatImageModeLabel(imageMode)}</strong>
                          <button className="instancePrimaryAction" onClick={() => void handleBatchDownload(imageResults)} type="button">打包下载</button>
                        </div>
                      </div>
                      <div className="instanceWatermarkPanel">
                        <div className="instanceWatermarkHeader">
                          <strong>添加签名水印</strong>
                          <span>{effectiveWatermark.length} / 50</span>
                        </div>
                        <input
                          className="creationInput el-input__inner"
                          maxLength={50}
                          onChange={(event) => setWatermarkText(event.target.value)}
                          placeholder="开启后，下载和复制的图片将带有签名水印"
                          type="text"
                          value={watermarkText}
                        />
                        <p>开启后，下载和复制的图片将带有签名水印</p>
                      </div>
                      <div className="instanceImageGrid">
                        {imageResults.map((image, index) => (
                          <article className="instanceImageCard" key={image.id}>
                            <div className="instanceImageCardHeader">
                              <strong>结果 {index + 1}</strong>
                              <button className="instanceActionButton instanceImageOpen" onClick={() => void handleImageOpen(image.url)} type="button">查看</button>
                            </div>
                            <img alt={`生成结果 ${index + 1}`} className="instanceGeneratedImage" src={image.url} />
                            <div className="instanceImageActions">
                              <button className="instanceActionButton" onClick={() => void handleImageDownload(image.url, `图片结果-${index + 1}.png`)} type="button">下载</button>
                              <button className="instanceActionButton" onClick={() => void handleImageCopy(image.url)} type="button">复制图片</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="instancePlainResult">
                      <MarkdownContent content={work.content} />
                    </div>
                  )}
                </div>
              ) : batches.length > 0 ? (
                <div className={isWriteCopyWork ? "instanceBatchStack writeCopyBatchStack" : isPolishWork ? "instanceBatchStack polishBatchStack" : "instanceBatchStack"} style={{ fontSize: `${fontScale}%` }}>
                  {batches.map((batch) => (
                    <section
                      className={isWriteCopyWork ? "instanceBatchGroup writeCopyBatchGroup" : isPolishWork ? "instanceBatchGroup polishBatchGroup" : "instanceBatchGroup"}
                      key={batch.id}
                      ref={(node) => { sectionRefs.current[batch.id] = node; }}
                    >
                      <div className="instanceBatchHeaderRow">
                        <div className="instanceBatchHeading">{formatBatchHeading(batch.label, batch.items.length, isWriteCopyWork)}</div>
                        <span className="instanceBatchCount">{batch.items.length} 条</span>
                      </div>
                      <div className={isWriteCopyWork ? "instanceBatchItemTabs writeCopyBatchItemTabs subtle" : isPolishWork ? "instanceBatchItemTabs polishBatchItemTabs subtle" : "instanceBatchItemTabs subtle"}>
                        {batch.items.map((item) => (
                          <button
                            className={[
                              isWriteCopyWork ? "instanceItemTab writeCopyItemTab" : isPolishWork ? "instanceItemTab polishItemTab" : "instanceItemTab",
                              (activeItemIds[batch.id] ?? batch.items[0]?.id) === item.id ? "active" : "",
                            ].filter(Boolean).join(" ")}
                            key={item.id}
                            onClick={() => switchBatchItem(batch.id, item.id)}
                            type="button"
                          >
                            {formatItemTabLabel(item.title, batch.label, batch.items.length, batch.items.findIndex((candidate) => candidate.id === item.id))}
                          </button>
                        ))}
                      </div>
                      {(() => {
                        const activeItem = batch.items.find((item) => item.id === (activeItemIds[batch.id] ?? batch.items[0]?.id)) ?? batch.items[0];
                        if (!activeItem) return null;
                        return (
                          <ResultBlock
                            copied={Boolean(copied[activeItem.id])}
                            isWriteCopy={isWriteCopyWork}
                            item={activeItem}
                            key={activeItem.id}
                            onCopy={() => void handleCopy(activeItem.id, getEditableBody(activeItem, xhsDrafts))}
                            onExport={() => handleExport(activeItem.title, getEditableBody(activeItem, xhsDrafts))}
                            onSave={saveItemContent}
                            saving={savingItemId === activeItem.id}
                            theme={wechatThemes[activeItem.id] ?? "default"}
                            xhsDraft={xhsDrafts[activeItem.id] ?? activeItem.body}
                            xhsFormat={xhsFormats[activeItem.id] ?? "plain"}
                            xhsTemplate={xhsTemplates[activeItem.id] ?? "journal"}
                            xhsFontSize={xhsFontSizes[activeItem.id] ?? "md"}
                            onThemeChange={updateWechatTheme}
                            onXhsDraftChange={updateXhsDraft}
                            onXhsFormatChange={updateXhsFormat}
                            onXhsTemplateChange={updateXhsTemplate}
                            onXhsFontSizeChange={updateXhsFontSize}
                          />
                        );
                      })()}
                    </section>
                  ))}
                </div>
              ) : (
                <div className={isPolishWork ? "instancePlainResult polishPlainResult" : "instancePlainResult"} style={{ fontSize: `${fontScale}%` }}>
                  <MarkdownContent content={work.content} />
                </div>
              )}
            </section>
          </main>
        </section>
      </div>

      {previewField ? <PreviewFieldModal previewField={previewField} onClose={() => setPreviewField(null)} /> : null}
      {previewImage ? <PreviewImageModal previewImage={previewImage} onClose={() => setPreviewImage(null)} /> : null}
    </div>
  );
}

function PreviewFieldModal({
  previewField,
  onClose,
}: {
  previewField: PreviewField;
  onClose: () => void;
}) {
  return (
    <div className="instancePreviewOverlay" onClick={onClose} role="presentation">
      <div className="instancePreviewDialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={previewField.label}>
        <div className="instancePreviewHeader">
          <div>
            <strong>{previewField.label}</strong>
            <p>按目标页交互，弹层查看原始输入内容。</p>
          </div>
          <button aria-label="关闭预览" className="instancePreviewClose" onClick={onClose} type="button">×</button>
        </div>
        <div className="instancePreviewModalBody">
          {previewField.value ? (
            previewField.mode === "plain"
              ? <div className="instancePreviewPlain">{previewField.value}</div>
              : <MarkdownContent content={previewField.value} />
          ) : (
            <div className="instancePreviewPlain">暂无内容</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewImageModal({
  previewImage,
  onClose,
}: {
  previewImage: PreviewImage;
  onClose: () => void;
}) {
  return (
    <div className="instancePreviewOverlay" onClick={onClose} role="presentation">
      <div className="instancePreviewDialog instanceImagePreviewDialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={previewImage.label}>
        <div className="instancePreviewHeader">
          <div>
            <strong>{previewImage.label}</strong>
            <p>站内预览原始图片，不依赖浏览器新开 data 链接。</p>
          </div>
          <button aria-label="关闭预览" className="instancePreviewClose" onClick={onClose} type="button">×</button>
        </div>
        <div className="instancePreviewModalBody instanceImagePreviewBody">
          <img alt={previewImage.label} className="instanceImagePreviewAsset" src={previewImage.url} />
        </div>
      </div>
    </div>
  );
}

function ResultBlock({
  item,
  isWriteCopy,
  theme,
  xhsFormat,
  xhsDraft,
  xhsTemplate,
  xhsFontSize,
  copied,
  saving,
  onCopy,
  onExport,
  onThemeChange,
  onXhsFormatChange,
  onXhsDraftChange,
  onXhsTemplateChange,
  onXhsFontSizeChange,
  onSave,
}: {
  item: CreationOutputItem;
  isWriteCopy: boolean;
  theme: WechatTheme;
  xhsFormat: XhsFormat;
  xhsDraft: string;
  xhsTemplate: XhsTemplate;
  xhsFontSize: XhsFontSize;
  copied: boolean;
  saving: boolean;
  onCopy: () => void;
  onExport: () => void;
  onThemeChange: (itemId: string, theme: WechatTheme) => void;
  onXhsFormatChange: (itemId: string, format: XhsFormat) => void;
  onXhsDraftChange: (itemId: string, value: string) => void;
  onXhsTemplateChange: (itemId: string, value: XhsTemplate) => void;
  onXhsFontSizeChange: (itemId: string, value: XhsFontSize) => void;
  onSave: (itemId: string, value: string) => Promise<void>;
}) {
  const editableBody = item.viewMode === "xiaohongshu" ? xhsDraft : item.body;
  const copyLabel = item.viewMode === "wechat" ? "复制公众号格式" : copied ? "已复制" : "复制";
  const xhsStats = item.viewMode === "xiaohongshu" ? analyzeXhsDraft(xhsDraft) : null;

  if (item.viewMode === "wechat") {
    return (
      <article className={isWriteCopy ? "instanceResultBlock active wechat writeCopyResultBlock" : "instanceResultBlock active wechat"} id={`instance-item-${item.id}`}>
        <div className="instanceResultToolbar">
          <div className="instanceResultToolbarTitle">
            <strong>{item.title}</strong>
            <span>公众号预览</span>
          </div>
          <div className="instanceResultActions">
            <button className="instanceActionButton" onClick={onCopy} type="button">{copyLabel}</button>
            <button className="instanceActionButton" onClick={onExport} type="button">导出Word</button>
          </div>
        </div>
        <div className={isWriteCopy ? "instanceWechatShell readOnly" : "instanceWechatShell"}>
          {!isWriteCopy ? (
            <div className="instanceWechatControls">
              <div className="instanceOriginModeRow">
                <span className="instanceBadge">支持公众号格式</span>
                <strong>公众号格式</strong>
              </div>
              <div className="instanceControlRow">
                <button className={theme === "default" ? "instanceControlChip active" : "instanceControlChip"} onClick={() => onThemeChange(item.id, "default")} type="button">默认主题</button>
                <button className={theme === "warm" ? "instanceControlChip active" : "instanceControlChip"} onClick={() => onThemeChange(item.id, "warm")} type="button">暖白</button>
                <button className={theme === "forest" ? "instanceControlChip active" : "instanceControlChip"} onClick={() => onThemeChange(item.id, "forest")} type="button">深色墨绿</button>
              </div>
            </div>
          ) : null}
          {isWriteCopy ? (
            <div className="instanceReadModeHint">
              <span className="instanceBadge">长文阅读</span>
              <strong>当前只展示一篇完整文章，避免把同一篇内容拆成多个结果块。</strong>
            </div>
          ) : null}
          <div className={`instanceWechatPreview ${isWriteCopy ? "readOnly" : ""} theme-${theme}`}>
            <MarkdownContent content={editableBody} />
          </div>
        </div>
      </article>
    );
  }

  if (item.viewMode === "xiaohongshu") {
    return (
      <article className={isWriteCopy ? "instanceResultBlock active xhs writeCopyResultBlock" : "instanceResultBlock active xhs"} id={`instance-item-${item.id}`}>
        <div className="instanceResultToolbar">
          <div className="instanceResultToolbarTitle">
            <strong>{item.title}</strong>
            <span>小红书预览</span>
          </div>
          <div className="instanceResultActions">
            <button className="instanceActionButton" onClick={onCopy} type="button">{copied ? "已复制" : "复制"}</button>
            <button className="instanceActionButton" onClick={onExport} type="button">导出Word</button>
          </div>
        </div>
        <div className={isWriteCopy ? "instanceXhsShell readOnly" : "instanceXhsShell"}>
          <div className={`instanceXhsPreview ${isWriteCopy ? "readOnly" : ""} template-${xhsTemplate} font-${xhsFontSize} ${xhsFormat === "image" ? "is-image" : ""}`}>
            <MarkdownContent content={xhsDraft} />
          </div>
          <div className={isWriteCopy ? "instanceXhsEditor compact" : "instanceXhsEditor"}>
            <div className="instanceXhsEditorHeader simple">
              <div className="instanceResultToolbarTitle">
                <strong>{isWriteCopy ? "继续修改这篇笔记" : "内容编辑"}</strong>
                <span>{xhsStats?.characterCount ?? editableBody.length} 字符</span>
              </div>
              <div className="instanceControlRow">
                <button className="instanceControlChip" onClick={() => onXhsDraftChange(item.id, item.body)} type="button">重置</button>
              </div>
            </div>
            <textarea
              className="instanceXhsTextarea"
              onChange={(event) => onXhsDraftChange(item.id, event.target.value)}
              value={xhsDraft}
            />
            <div className="instanceEditorFooter">
              <span>{saving ? "保存中..." : isWriteCopy ? "预览在上方，确认后可直接保存到作品。" : "修改后可实时预览，并保存到作品中"}</span>
              <button className="instancePrimaryAction" onClick={() => void onSave(item.id, xhsDraft)} type="button">保存修改</button>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={isWriteCopy ? "instanceResultBlock active writeCopyResultBlock" : "instanceResultBlock active"} id={`instance-item-${item.id}`}>
      <div className="instanceResultToolbar">
        <div className="instanceResultToolbarTitle">
          <strong>{item.title}</strong>
          <span>文本预览</span>
        </div>
        <div className="instanceResultActions">
          <button className="instanceActionButton" onClick={onCopy} type="button">{copied ? "已复制" : "复制"}</button>
          <button className="instanceActionButton" onClick={onExport} type="button">导出Word</button>
        </div>
      </div>
      <div className="instancePlainResult">
        <MarkdownContent content={editableBody} />
      </div>
    </article>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return <div className="markdownMessage">{renderMarkdown(content)}</div>;
}

function renderMarkdown(content: string) {
  return content.split("\n").map((rawLine, index) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) return <div className="markdownSpacer" key={`blank-${index}`} />;

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const Tag = `h${Math.min(level + 1, 4)}` as "h2" | "h3" | "h4";
      return (
        <Tag className="markdownHeading" key={`heading-${index}`}>
          {renderInlineMarkdown(headingMatch[2])}
        </Tag>
      );
    }

    const bracketHeadingMatch = trimmed.match(/^【(.+?)】\s*(.*)$/);
    if (bracketHeadingMatch) {
      return (
        <p className="markdownParagraph" key={`bracket-${index}`}>
          <strong>【{bracketHeadingMatch[1]}】</strong>
          {bracketHeadingMatch[2] ? <> {renderInlineMarkdown(bracketHeadingMatch[2])}</> : null}
        </p>
      );
    }

    const orderedMatch = trimmed.match(/^(\d+)[.、]\s+(.+)$/);
    if (orderedMatch) {
      return (
        <p className="markdownListItem" key={`ordered-${index}`}>
          <span>{orderedMatch[1]}.</span>
          <span>{renderInlineMarkdown(orderedMatch[2])}</span>
        </p>
      );
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      return (
        <p className="markdownListItem" key={`unordered-${index}`}>
          <span>•</span>
          <span>{renderInlineMarkdown(unorderedMatch[1])}</span>
        </p>
      );
    }

    return (
      <p className="markdownParagraph" key={`paragraph-${index}`}>
        {renderInlineMarkdown(line)}
      </p>
    );
  });
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

async function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy copy.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

async function copyImage(url: string) {
  if (typeof window === "undefined" || !navigator.clipboard || typeof ClipboardItem === "undefined") {
    return false;
  }

  try {
    const response = await fetch(resolveImageSource(url), { cache: "no-store" });
    if (!response.ok) return false;
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    return true;
  } catch {
    return false;
  }
}

async function buildWatermarkedAsset(url: string, watermark: string) {
  if (!watermark.trim() || typeof window === "undefined") return url;

  try {
    const blob = await fetchImageBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    const image = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(objectUrl);
      return url;
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const fontSize = Math.max(24, Math.round(canvas.width * 0.035));
    const paddingX = Math.max(28, Math.round(canvas.width * 0.028));
    const paddingY = Math.max(24, Math.round(canvas.height * 0.03));
    context.font = `700 ${fontSize}px Arial, sans-serif`;
    context.textAlign = "right";
    context.textBaseline = "bottom";
    const measured = context.measureText(watermark.trim());
    const textWidth = measured.width;
    const backgroundWidth = textWidth + fontSize * 1.4;
    const backgroundHeight = fontSize * 1.9;
    const backgroundX = canvas.width - paddingX - backgroundWidth;
    const backgroundY = canvas.height - paddingY - backgroundHeight;
    context.fillStyle = "rgba(15, 23, 42, 0.54)";
    roundRect(context, backgroundX, backgroundY, backgroundWidth, backgroundHeight, Math.max(12, fontSize * 0.45));
    context.fill();
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.fillText(watermark.trim(), canvas.width - paddingX - fontSize * 0.35, canvas.height - paddingY - fontSize * 0.28);
    const result = canvas.toDataURL("image/png");
    URL.revokeObjectURL(objectUrl);
    return result;
  } catch {
    return url;
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function fetchImageBlob(url: string) {
  const response = await fetch(resolveImageSource(url), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("image_fetch_failed");
  }
  return response.blob();
}

function resolveImageSource(url: string) {
  if (typeof window === "undefined") return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const proxy = new URL(apiPath("/api/assets/image-proxy"), window.location.origin);
  proxy.searchParams.set("url", url);
  return proxy.toString();
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function exportWord(title: string, body: string) {
  const blob = new Blob([`${title}\n\n${body}`], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(title)}.doc`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadAsset(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.click();
}

function sanitizeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "作品";
}

function mergeItemBody(work: WorkDetail, itemId: string, nextBody: string): WorkDetail {
  const parsed = work.content_json?.batches?.length
    ? { batches: work.content_json.batches }
    : parseCreationOutput(work.content);

  const nextBatches = parsed.batches.map((batch) => ({
    ...batch,
    items: batch.items.map((item) => (
      item.id === itemId
        ? {
            ...item,
            body: nextBody,
            summary: inferSummary(nextBody),
          }
        : item
    )),
  }));

  return {
    ...work,
    content: composeContent(nextBatches),
    content_json: { batches: nextBatches },
    updated_at: new Date().toISOString(),
  };
}

function composeContent(batches: CreationOutputBatch[]) {
  return batches
    .map((batch) => {
      const body = batch.items.map((item) => item.body.trim()).filter(Boolean).join("\n\n");
      return `【${restoreBatchTitle(batch.label)}】\n${body}`;
    })
    .join("\n\n")
    .trim();
}

function restoreBatchTitle(label: string) {
  if (label === "口播稿") return "短视频口播";
  if (label === "小红书") return "小红书笔记";
  if (label === "公众号") return "公众号文章";
  if (label === "朋友圈") return "朋友圈文案";
  return label;
}

function inferSummary(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 96);
}

function getEditableBody(item: CreationOutputItem, drafts: Record<string, string>) {
  return item.viewMode === "xiaohongshu" ? drafts[item.id] ?? item.body : item.body;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatInputLabel(key: string) {
  if (key === "tone") return "表达倾向";
  if (key === "source") return "创作素材";
  if (key === "draft") return "现有口播稿";
  if (key === "goal") return "重点优化";
  if (key === "article") return "现有文章";
  if (key === "target") return "希望重点优化";
  if (key === "targets") return "创作内容";
  if (key === "style") return "图片风格";
  if (key === "draw_portrait") return "是否画我的形象";
  if (key === "ratio") return "宽高比";
  if (key === "signature") return "签名";
  if (key === "reference_image") return "参考图";
  if (key === "angle") return "引流角度";
  if (key === "lead_magnet") return "承接资料";
  if (key === "keyword") return "互动关键词";
  if (key === "cta") return "承接动作";
  return key;
}

function formatInputValue(key: string, value: unknown) {
  if (key === "tone") return formatToneLabel(typeof value === "string" ? value : null) || "-";
  if (key === "goal" && Array.isArray(value)) return formatPolishGoalLabels(value.map(String));
  if (key === "target" && Array.isArray(value)) return formatArticleTargetLabels(value.map(String));
  if (key === "targets" && Array.isArray(value)) return formatChannelLabels(value.map(String));
  if (key === "targets" && typeof value === "string") return formatChannelLabels([value]);
  if (key === "draw_portrait" && typeof value === "string") return value === "yes" ? "是，我已上传形象照" : "否，不要画人物形象";
  if (key === "ratio" && typeof value === "string") return formatRatioLabel(value);
  if (key === "style" && typeof value === "string") return formatImageStyleLabel(value);
  if (key === "reference_image" && typeof value === "string") return value ? "已上传参考图" : "-";
  if (key === "angle" && typeof value === "string") return formatLeadAngleLabel(value);
  if (key === "cta" && typeof value === "string") return formatLeadCtaLabel(value);
  if (Array.isArray(value)) return value.map(String).join(" / ");
  return String(value ?? "-");
}

function formatToneLabel(value?: string | null) {
  if (value === "sharp_insight") return "犀利洞察";
  if (value === "gentle_empathy") return "温和共鸣";
  if (value === "analogy_thinking") return "类比思维";
  if (value === "raw_restore") return "原汁原味（还原整理）";
  if (value === "traffic") return "偏犀利";
  if (value === "trust") return "偏稳重";
  if (value === "raw") return "尽量保留原意";
  if (value === "self") return "更像自己";
  return value ?? "";
}

function formatChannelLabels(values: string[]) {
  return values
    .map((value) => {
      if (value === "video_script") return "口播稿";
      if (value === "video_batch") return "口播稿x3";
      if (value === "redbook_batch") return "小红书x2";
      if (value === "wechat_batch") return "公众号x2";
      if (value === "comment_hook") return "评论区引导";
      if (value === "dm_script") return "私信承接";
      if (value === "xiaohongshu") return "小红书";
      if (value === "wechat_article") return "公众号";
      if (value === "moments") return "朋友圈";
      return value;
    })
    .join(" / ");
}

function formatAppLabel(value?: string | null) {
  if (value === "write-copy") return "写文案";
  if (value === "image-card") return "做图";
  if (value === "lead-copy") return "写引流文案";
  if (value === "video-script-polish") return "口播文案精修";
  if (value === "wechat-article-polish") return "公众号文章精修";
  return value ?? "";
}

function formatPolishGoalLabels(values: string[]) {
  return values
    .map((value) => {
      if (value === "hook") return "开头更抓人";
      if (value === "logic") return "逻辑更顺";
      if (value === "tone") return "情绪更稳";
      if (value === "self") return "更像自己";
      return value;
    })
    .join(" / ");
}

function formatArticleTargetLabels(values: string[]) {
  return values
    .map((value) => {
      if (value === "title") return "标题";
      if (value === "structure") return "结构";
      if (value === "tone") return "语言质感";
      if (value === "cta") return "结尾互动";
      return value;
    })
    .join(" / ");
}

function formatPolishSummary(payload: Record<string, unknown> | null | undefined, key: "goal" | "target") {
  const value = payload?.[key];
  const formatted = formatInputValue(key, value);
  return formatted && formatted !== "-" ? formatted : "待确认";
}

function formatLeadAngleLabel(value?: string | null) {
  if (value === "myth") return "误区纠偏";
  if (value === "benefit") return "资料福利";
  if (value === "case") return "案例拆解";
  if (value === "self-test") return "问题自测";
  return value ?? "-";
}

function formatLeadCtaLabel(value?: string | null) {
  if (value === "comment") return "评论关键词";
  if (value === "dm") return "私信关键词";
  if (value === "wechat") return "引导添加企微";
  return value ?? "-";
}

function formatImageModeLabel(value?: string | null) {
  if (value === "image") return "真实出图";
  if (value === "demo") return "演示出图";
  if (value === "fallback") return "占位预览";
  if (value === "rate_limited") return "排队重试中";
  return value || "-";
}

function formatWorkTitle(work: WorkDetail) {
  const title = work.title?.trim() ?? "";
  if (!title) return `${formatAppLabel(work.platform)}作品`;

  if (work.platform === "image-card") {
    return buildImageWorkMeta(work).title;
  }

  return title
    .replace(/\bsharp_insight\b/gi, formatToneLabel("sharp_insight"))
    .replace(/\bgentle_empathy\b/gi, formatToneLabel("gentle_empathy"))
    .replace(/\banalogy_thinking\b/gi, formatToneLabel("analogy_thinking"))
    .replace(/\braw_restore\b/gi, formatToneLabel("raw_restore"))
    .replace(/\btraffic\b/gi, formatToneLabel("traffic"))
    .replace(/\btrust\b/gi, formatToneLabel("trust"))
    .replace(/\braw\b/gi, formatToneLabel("raw"))
    .replace(/\bself\b/gi, formatToneLabel("self"))
    .replace(`${formatAppLabel(work.platform)}｜`, `${formatAppLabel(work.platform)}｜`);
}

function formatStatusLabel(value?: string | null) {
  if (value === "draft") return "草稿";
  if (value === "published") return "已发布";
  if (value === "archived") return "已归档";
  if (value === "succeeded") return "已完成";
  return value ?? "";
}

function readDraft(appSlug: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`creation-draft:${appSlug}`);
    return raw ? JSON.parse(raw) as Record<string, string | string[]> : null;
  } catch {
    return null;
  }
}

function countWriteCopyOutputs(batches: CreationOutputBatch[]) {
  return batches.reduce((sum, batch) => sum + batch.items.length, 0);
}

function formatBatchNavLabel(label: string, count: number, isWriteCopy: boolean) {
  return isWriteCopy ? `${label}${count > 0 ? `x${count}` : ""}` : `${label}x${count}`;
}

function formatBatchHeading(label: string, count: number, isWriteCopy: boolean) {
  return isWriteCopy ? `${label}${count > 0 ? `x${count}` : ""}` : `${label}x${count}`;
}

function formatItemTabLabel(title: string, batchLabel: string, count: number, itemIndex: number) {
  if (count <= 1) return batchLabel;
  const compact = title
    .replace(/^\*+|\*+$/g, "")
    .replace(/^标题[:：]\s*/, "")
    .replace(/^文章\d+\s*[|｜]\s*/g, "")
    .replace(/^笔记\d+\s*[|｜]\s*/g, "")
    .replace(/^\d+[.、]\s*/g, "")
    .replace(/^第\d+[条篇版个则]\s*/, "")
    .trim();

  const labelMap: Record<string, string> = {
    "口播稿": "第%s条",
    "小红书": "笔记%s",
    "公众号": "文章%s",
    "朋友圈": "文案%s",
  };

  const fallbackLabel = labelMap[batchLabel]?.replace("%s", String(itemIndex + 1)) ?? `${batchLabel}${itemIndex + 1}`;

  if (!compact) {
    return fallbackLabel;
  }

  const genericPatterns = [
    /^口播稿$/,
    /^小红书$/, 
    /^公众号$/,
    /^朋友圈$/,
    /^笔记$/,
    /^文章$/,
    /^文案$/,
    /^版本$/,
    /^内容$/,
    /^方案$/,
  ];

  if (genericPatterns.some((pattern) => pattern.test(compact))) {
    return fallbackLabel;
  }

  const onlyIndexLike = compact.match(/^(?:笔记|文章|第)?\s*(\d+)\s*(?:条|篇|版|个|则)?$/);
  if (onlyIndexLike) {
    return fallbackLabel;
  }

  const preferIndexOnlyBatches = new Set(["口播稿", "朋友圈"]);
  if (preferIndexOnlyBatches.has(batchLabel)) {
    return fallbackLabel;
  }

  return compact.slice(0, 18) || fallbackLabel;
}

function countTextBlocks(content: string) {
  return content
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function analyzeXhsDraft(content: string) {
  const normalized = content.trim();
  if (!normalized) {
    return { blockCount: 0, characterCount: 0 };
  }

  const blocks = normalized
    .split(/\n\s*---\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    blockCount: blocks.length || countTextBlocks(content),
    characterCount: normalized.replace(/\s+/g, "").length,
  };
}

const xhsTemplateOptions: Array<{ label: string; value: XhsTemplate }> = [
  { label: "手账笔记", value: "journal" },
  { label: "侧边卡片", value: "side-card" },
  { label: "极光星云", value: "aurora" },
  { label: "经典红本", value: "classic-red" },
  { label: "清新便签", value: "memo" },
  { label: "夜幕卡片", value: "night-card" },
  { label: "简约卡片", value: "minimal" },
  { label: "知简风格", value: "simple" },
  { label: "星标卡片", value: "star-card" },
];

const xhsFontSizeOptions: Array<{ label: string; value: XhsFontSize }> = [
  { label: "小", value: "sm" },
  { label: "中", value: "md" },
  { label: "大", value: "lg" },
  { label: "特大", value: "xl" },
];

function buildImageWorkMeta(work: WorkDetail) {
  const payload = work.app_run?.input_payload ?? {};
  const source = typeof payload.source === "string" && payload.source.trim()
    ? payload.source.trim()
    : inferImageSourceFromPayload(work);
  const fallbackTitle = stripImageWorkTitle(work.title);
  const styleFromTitle = inferImageStyleFromTitle(work.title);
  const title = source ? source.replace(/\s+/g, " ").slice(0, 38) : stripImageWorkTitle(work.title);
  return {
    title: title || "图片生成结果",
    source,
    style: formatInputValue("style", payload.style) !== "-" ? formatInputValue("style", payload.style) : styleFromTitle,
    drawPortrait: formatInputValue("draw_portrait", payload.draw_portrait) !== "-" ? formatInputValue("draw_portrait", payload.draw_portrait) : "否，不要画人物形象",
    ratio: formatInputValue("ratio", payload.ratio) !== "-" ? formatInputValue("ratio", payload.ratio) : inferImageRatioFromContent(work.content),
    hasPayload: Boolean(work.app_run?.input_payload && Object.keys(work.app_run.input_payload).length > 0),
    fallbackTitle,
  };
}

function buildImageInputEntries(work: WorkDetail) {
  const payload = work.app_run?.input_payload ?? {};
  const orderedKeys = ["draw_portrait", "ratio", "style", "source", "signature", "reference_image"];
  const seen = new Set<string>();
  const entries: Array<{ key: string; label: string; value?: string; actionLabel?: string; previewValue?: string }> = [];

  for (const key of orderedKeys) {
    const raw = payload[key];
    if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) continue;
    seen.add(key);
    if (key === "source") {
      const source = typeof raw === "string" ? raw.trim() : "";
      entries.push({
        key,
        label: formatInputLabel(key),
        actionLabel: "文本输入",
        previewValue: source,
      });
      continue;
    }
    entries.push({
      key,
      label: formatInputLabel(key),
      value: formatInputValue(key, raw),
    });
  }

  for (const [key, raw] of Object.entries(payload)) {
    if (seen.has(key)) continue;
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string" && !raw.trim()) continue;
    if (Array.isArray(raw) && raw.length === 0) continue;
    if (key === "source") {
      const source = typeof raw === "string" ? raw.trim() : "";
      entries.push({
        key,
        label: formatInputLabel(key),
        actionLabel: "文本输入",
        previewValue: source,
      });
      continue;
    }
    entries.push({
      key,
      label: formatInputLabel(key),
      value: formatInputValue(key, raw),
    });
  }

  if (entries.length === 0) {
    entries.push(
      { key: "draw_portrait", label: "是否画我的形象", value: work.platform === "image-card" ? buildImageWorkMeta(work).drawPortrait : "-" },
      { key: "ratio", label: "宽高比", value: buildImageWorkMeta(work).ratio },
      { key: "style", label: "图片风格", value: buildImageWorkMeta(work).style },
    );
    if (buildImageWorkMeta(work).source) {
      entries.push({
        key: "source",
        label: "图片内容",
        actionLabel: "文本输入",
        previewValue: buildImageWorkMeta(work).source,
      });
    }
  }

  return entries;
}

function stripImageWorkTitle(title?: string | null) {
  const cleaned = String(title ?? "")
    .replace(/^做图[｜|]/, "")
    .replace(/\billustration\b/gi, "手绘插画")
    .trim();
  return cleaned || "图片生成结果";
}

function formatImageStyleLabel(value?: string | null) {
  if (!value) return "-";
  if (value === "illustration") return "手绘插画";
  if (value === "flat") return "扁平海报";
  if (value === "realistic") return "写实质感";
  if (value === "cartoon") return "卡通绘本";
  return value;
}

function formatRatioLabel(value?: string | null) {
  if (!value) return "-";
  if (value === "3:4") return "3:4 竖版";
  if (value === "4:3") return "4:3 横版";
  if (value === "1:1") return "1:1 方版";
  if (value === "9:16") return "9:16 竖屏";
  if (value === "16:9") return "16:9 横屏";
  return value;
}

function formatImageGenerationNotice(mode: ImageGenerationMode) {
  if (mode === "fallback") return "当前环境还没有接通真实图片模型，页面展示的是本地占位预览，下载与复制逻辑已按目标页接通。";
  if (mode === "rate_limited") return "图片服务当前繁忙，这次先展示占位预览。后端已经接通真实图片能力，等并发窗口释放后可再次生成。";
  if (mode === "demo") return "当前为演示出图模式，页面交互和下载链路已生效，但图片内容不是线上真实生成结果。";
  return "";
}

function inferImageStyleFromTitle(title?: string | null) {
  const value = String(title ?? "").toLowerCase();
  if (value.includes("illustration")) return "手绘插画";
  if (value.includes("flat")) return "扁平海报";
  if (value.includes("realistic")) return "写实质感";
  if (value.includes("cartoon")) return "卡通绘本";
  return "-";
}

function inferImageSourceFromPayload(work: WorkDetail) {
  const content = String(work.content ?? "").trim();
  if (!content) return "";
  if (content.includes("图片提示词底稿：")) {
    return content.split("图片提示词底稿：").pop()?.trim() ?? "";
  }
  return "";
}

function inferImageRatioFromContent(content?: string | null) {
  const value = String(content ?? "");
  if (value.includes("3:4")) return "3:4 竖版";
  if (value.includes("4:3")) return "4:3 横版";
  if (value.includes("1:1")) return "1:1 方版";
  if (value.includes("9:16")) return "9:16 竖屏";
  if (value.includes("16:9")) return "16:9 横屏";
  return "-";
}
