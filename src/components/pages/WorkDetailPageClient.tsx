"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";
import { usePageMeta } from "@/lib/client/page-meta";
import { parseCreationOutput, type CreationOutputBatch, type CreationOutputItem, type CreationOutputViewMode } from "@/lib/creation/output";

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

type WechatTheme = "default" | "warm" | "forest" | "editorial";
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
  const [activeSection, setActiveSection] = useState("generated-content");
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
  const [selectedImageId, setSelectedImageId] = useState("");
  const [showResultDetails, setShowResultDetails] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState("");
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
  const [streamRetryKey, setStreamRetryKey] = useState(0);
  const workReturnHref = searchParams.get("from") === "dashboard" ? appPath("/dashboard") : appPath("/drafts");
  const workReturnLabel = searchParams.get("from") === "dashboard" ? "返回今日工作台" : "返回创作历史";
  usePageMeta({
    title: work ? `${formatWorkTitle(work)} · 作品` : "作品详情",
    description: work ? `${formatAppLabel(work.platform)} / 审阅、优化与复用` : "正在加载作品",
    status: work?.app_run?.status === "running" ? "生成中" : work?.app_run?.status === "succeeded" ? "已完成" : "",
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
  }, [previewField, previewImage]);

  useEffect(() => {
    if (!work) return;
    if (work.app_run?.status && work.app_run.status !== "running") return;
    if (work.content.trim() && work.app_run?.status !== "running") return;

    const prefersStreaming = supportsWorkStreaming(work.platform);
    if (prefersStreaming && streamState.connected) return;

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
  }, [workId, work?.app_run?.status, work?.content, work?.platform, streamState.connected, streamState.error]);

  useEffect(() => {
    streamReaderAbortRef.current?.abort();
    const resetFrame = window.requestAnimationFrame(() => {
      setStreamState({
        connected: false,
        content: "",
        images: [],
        imageMode: "",
        retryable: false,
        error: "",
      });
    });

    if (!work?.app_run || work.app_run.status !== "running") return () => window.cancelAnimationFrame(resetFrame);
    if (!supportsWorkStreaming(work.platform)) return () => window.cancelAnimationFrame(resetFrame);

    const controller = new AbortController();
    streamReaderAbortRef.current = controller;

    async function connectWorkStream() {
      try {
        const response = await fetch(apiPath(`/api/works/${workId}/stream`), {
          signal: controller.signal,
          headers: { accept: "text/event-stream" },
        });
        if (!response.ok || !response.body) {
          if (response.status === 409 && !controller.signal.aborted) {
            window.setTimeout(() => {
              if (controller.signal.aborted) return;
              setStreamRetryKey((current) => current + 1);
            }, 1000);
          }
          setStreamState((current) => ({
            ...current,
            connected: false,
            error: "生成流暂时不可用，已切回自动刷新。",
          }));
          return;
        }

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
    return () => {
      window.cancelAnimationFrame(resetFrame);
      controller.abort();
    };
  }, [streamRetryKey, workId, work?.app_run?.id, work?.app_run?.status, work?.platform]);

  const streamedBatches = useMemo(() => {
    if (!streamState.content.trim()) return [];
    return parseCreationOutput(streamState.content).batches;
  }, [streamState.content]);

  const storedBatches = useMemo(() => {
    if (!work) return [];
    return readCreationOutputBatches(work.content_json);
  }, [work]);

  const resultJsonBatches = useMemo(() => {
    if (!work?.app_run?.result_json) return [];
    const contentJson = work.app_run.result_json.contentJson ?? work.app_run.result_json.content_json;
    return readCreationOutputBatches(contentJson);
  }, [work]);

  const expectedCopyBatches = useMemo(() => {
    if (work?.platform !== "write-copy" && work?.platform !== "lead-copy") return [];
    return buildExpectedWriteCopyBatches(work.app_run?.target_channels ?? []);
  }, [work]);

  const batches = useMemo(() => {
    if (!work) return [];
    const parsedBatches = parseCreationOutput(work.content).batches;

    if (work.platform === "write-copy") {
      const baseBatches = chooseBatchSource([
        storedBatches,
        resultJsonBatches,
        parsedBatches,
        expectedCopyBatches,
      ]);
      if (streamedBatches.length > 0) {
        return mergeStreamedBatches(baseBatches, streamedBatches);
      }
      return baseBatches;
    }

    if (work.platform === "lead-copy") {
      const storedLeadBatches = storedBatches.filter(isLeadCopyBatch);
      const resultLeadBatches = resultJsonBatches.filter(isLeadCopyBatch);
      const parsedLeadBatches = parsedBatches.filter(isLeadCopyBatch);
      const streamedLeadBatches = streamedBatches.filter(isLeadCopyBatch);
      const baseBatches = chooseBatchSource([
        storedLeadBatches,
        resultLeadBatches,
        parsedLeadBatches,
        expectedCopyBatches,
      ]);
      return streamedLeadBatches.length > 0
        ? mergeStreamedBatches(baseBatches, streamedLeadBatches)
        : baseBatches;
    }

    if (work.platform === "general-content") {
      const baseBatches = chooseBatchSource([parsedBatches, storedBatches, resultJsonBatches]);
      if (streamedBatches.length > 0) {
        return mergeStreamedBatches(baseBatches, streamedBatches);
      }
      return baseBatches;
    }

    if (work.platform === "video-script-polish") {
      if (streamedBatches.length > 0) return streamedBatches;
      return chooseBatchSource([storedBatches, resultJsonBatches, parsedBatches]);
    }

    if (work.platform === "wechat-article-polish") {
      return chooseBatchSource([storedBatches, resultJsonBatches, parsedBatches]);
    }

    return chooseBatchSource([storedBatches, resultJsonBatches, parsedBatches]);
  }, [expectedCopyBatches, resultJsonBatches, storedBatches, streamedBatches, work]);

  const isMalformedLeadCopyResult = work?.platform === "lead-copy"
    && work.app_run?.status === "succeeded"
    && !storedBatches.some((batch) => isLeadCopyBatch(batch) && hasRenderableBatch(batch))
    && !resultJsonBatches.some((batch) => isLeadCopyBatch(batch) && hasRenderableBatch(batch))
    && !parseCreationOutput(work.content).batches.some((batch) => isLeadCopyBatch(batch) && hasRenderableBatch(batch));

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
    return Object.entries(payload).filter(([key, value]) => {
      if (key === "app_entry") return false;
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
  const isPolicyRenewalCardWork = work?.platform === "policy-renewal-card";
  const isImageWork = work?.platform === "image-card" || work?.platform === "wechat-images" || isPolicyRenewalCardWork;
  const defaultWatermark = typeof work?.app_run?.input_payload?.signature === "string" ? work.app_run.input_payload.signature.trim() : "";
  const effectiveWatermark = watermarkEnabled ? (watermarkText.trim() || defaultWatermark) : "";
  const imageScale = isImageWork ? Math.max(90, Math.min(140, fontScale)) : fontScale;
  const isWriteCopyWork = work?.platform === "write-copy";
  const isTrafficCopyWork = work?.platform === "traffic-copy";
  const isMarketingCopyWork = work?.platform === "marketing-copy";
  const isSimpleCopyWork = isTrafficCopyWork || isMarketingCopyWork;
  const isLeadCopyWork = work?.platform === "lead-copy";
  const isStructuredCopyWork = isWriteCopyWork || isLeadCopyWork;
  const isGeneralContentWork = work?.platform === "general-content";
  const isLetterWork = work?.platform === "letter";
  const isTopicPickerWork = work?.platform === "topic-picker";
  const isXiaohongshuCheckWork = work?.platform === "xiaohongshu-check";
  const isVideoScriptPolishWork = work?.platform === "video-script-polish";
  const isWechatArticlePolishWork = work?.platform === "wechat-article-polish";
  const isPolishWork = isVideoScriptPolishWork || isWechatArticlePolishWork;
  const resolvedTone = work?.app_run?.tone || (
    typeof work?.app_run?.input_payload?.tone === "string"
      ? work.app_run.input_payload.tone
      : ""
  );
  const polishSourceText = typeof work?.app_run?.input_payload?.draft === "string"
    ? work.app_run.input_payload.draft
    : typeof work?.app_run?.input_payload?.article === "string"
      ? work.app_run.input_payload.article
      : "";
  const topicPickerSections = useMemo(() => parseTopicPickerSections(streamState.content || work?.content || ""), [streamState.content, work?.content]);
  const topicPickerNavItems = topicPickerSections.length > 0 ? topicPickerSections : buildTopicPickerFallbackSections(work?.content || "");

  const preferredBatch = choosePreferredBatch(batches, work?.platform);
  const requestedBatch = batches.find((batch) => batch.id === activeBatchId);
  const activeBatch = requestedBatch && (hasRenderableBatch(requestedBatch) || !batches.some(hasRenderableBatch))
    ? requestedBatch
    : preferredBatch;
  const resolvedBatchId = activeBatch?.id ?? "";
  const hasRenderableBatches = batches.some(hasRenderableBatch);
  const plainResultContent = streamState.content || work?.content || (
    work?.app_run?.status === "running" ? "内容生成中，结果会在这里持续回填。" : "本次生成暂未返回正文。"
  );
  const getActiveItemId = (batch: CreationOutputBatch) => (
    batch.items.some((item) => item.id === activeItemIds[batch.id])
      ? activeItemIds[batch.id]
      : batch.items[0]?.id ?? ""
  );

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

  function editPolicyRenewalCard() {
    const payload = work?.app_run?.input_payload;
    if (!payload) return;
    const draftKey = "creation-draft:policy-renewal-card";
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {
      window.sessionStorage.setItem(draftKey, JSON.stringify({ ...payload, reference_image: "" }));
    }
    window.location.href = appPath("/apps/policy-renewal-card?from=workspace&entry=policy-renewal-card");
  }

  function handleExport(title: string, body: string, options?: { viewMode?: CreationOutputViewMode; theme?: WechatTheme }) {
    exportWord(title, body, options);
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
    const recommendedImageIndex = generatedCount > 0 ? 0 : -1;
    const selectedImageIndex = Math.max(0, imageResults.findIndex((image) => image.id === selectedImageId));
    const selectedImage = imageResults[selectedImageIndex] ?? imageResults[0] ?? null;
    const generationNotice = formatImageGenerationNotice(imageMode);
    const showImagePlaceholders = imageResults.length === 0 && work.app_run?.status === "running";
    const imageFieldMissingHint = !imageMeta.hasPayload
      ? "这条作品当前没有关联到完整的实例输入数据，所以部分输入字段暂时无法还原。修复后新生成的作品会显示完整字段。"
      : "";
    const heroSummary = streamState.connected
      ? "图片还在持续生成中，新的结果会自动回填到下方结果区。"
      : generatedCount > 0
        ? `本次共生成 ${generatedCount} 张图片，建议先看推荐图，再决定下载或继续微调。`
        : "结果区会优先承载选图、下载和继续生成动作，输入信息保留在下方供核对。";

    function moveSelectedImage(offset: number) {
      if (imageResults.length < 2) return;
      const nextIndex = (selectedImageIndex + offset + imageResults.length) % imageResults.length;
      setSelectedImageId(imageResults[nextIndex].id);
    }

    return (
      <div className={`workDetailPage imageInstancePage ${showResultDetails ? "" : "resultDetailsCollapsed"}`}>
        <div className="page-content imageInstanceShell">
          <ResultWorkspaceBar detailsOpen={showResultDetails} onToggleDetails={() => setShowResultDetails((current) => !current)} returnHref={workReturnHref} returnLabel={workReturnLabel} work={work} title={imageMeta.title} />
          <section className="imageInstanceHero">
            <div className="imageInstanceHeroCopy">
              <div className="imageInstanceHeroTitleRow">
                <span className="imageInstanceHeroBadge">{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</span>
                <strong>{formatAppLabel(work.platform)}</strong>
              </div>
              <h1>{imageMeta.title}</h1>
              <p>{heroSummary}</p>
              <div className="imageHeroQuickActions">
                <button
                  className="instancePrimaryAction"
                  disabled={imageResults.length === 0}
                  onClick={() => void handleBatchDownload(imageResults)}
                  type="button"
                >
                  下载全部
                </button>
                <button
                  className="instanceActionButton"
                  onClick={() => jumpToSection("generated-content")}
                  type="button"
                >
                  直接看结果
                </button>
                <button
                  className="instanceActionButton"
                  onClick={() => jumpToSection("instance-info")}
                  type="button"
                >
                  查看输入
                </button>
              </div>
            </div>
            <div className="imageInstanceHeroMeta">
              <div>
                <span>结果状态</span>
                <strong>{streamState.connected ? "生成中" : generatedCount > 0 ? `已出 ${generatedCount} 张` : "等待结果"}</strong>
              </div>
              <div>
                <span>推荐动作</span>
                <strong>{generatedCount > 0 ? "先选图，再下载" : imageRetryable ? "可重试生成" : "等待完成"}</strong>
              </div>
              <div>
                <span>{work.platform === "wechat-images" ? "配图配置" : "出图配置"}</span>
                <strong>{imageMeta.style} · {imageMeta.ratio}</strong>
              </div>
            </div>
          </section>

          <div className="imageInstanceLayout">
            <aside className="imageInstanceSidebar">
              <div className="imageInstanceSidebarCard">
                <div className="sidebarBackRow">
                  <a className="back-btn backLink imageInstanceBack" href={workReturnHref}>← {workReturnLabel}</a>
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
                className="imageInstanceCard imageResultsCard"
                ref={(node) => { sectionRefs.current["generated-content"] = node; }}
              >
                <div className="imageResultsHeader">
                  <div>
                    <h2>生成的图片</h2>
                    <p>{streamState.connected ? "结果会持续回填，优先把选图和下载动作放在首屏。" : `共 ${generatedCount} 张，建议先看推荐图，再决定是否全部下载。`}</p>
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

                <div className="imageResultSummaryStrip">
                  <div className="imageSummaryPill">
                    <span>推荐图</span>
                    <strong>{generatedCount > 0 ? `结果 ${recommendedImageIndex + 1}` : "待生成"}</strong>
                  </div>
                  <div className="imageSummaryPill">
                    <span>{work.platform === "wechat-images" ? "配图类型" : "人物形象"}</span>
                    <strong>{imageMeta.drawPortrait}</strong>
                  </div>
                  <div className="imageSummaryPill">
                    <span>出图模式</span>
                    <strong>{formatImageModeLabel(imageMode)}</strong>
                  </div>
                </div>

                <div className="imageResultTools compact">
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
                    <strong>下载前确认</strong>
                    <div className="imageResultSummaryList">
                      <div>
                        <span>出图模式</span>
                        <strong>{formatImageModeLabel(imageMode)}</strong>
                      </div>
                      <div>
                        <span>{work.platform === "wechat-images" ? "配图类型" : "人物形象"}</span>
                        <strong>{imageMeta.drawPortrait}</strong>
                      </div>
                      <div>
                        <span>签名状态</span>
                        <strong>{watermarkEnabled ? (effectiveWatermark || "已开启") : "未开启"}</strong>
                      </div>
                    </div>
                    <p>这里保留最关键的确认项，避免下载前还要回头翻输入信息。</p>
                  </div>
                </div>

                <div className="imageStudioWorkspace">
                  <div className="imageStudioCanvasColumn">
                    <div
                      aria-label="图片结果预览"
                      className="imageStudioCanvas"
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft") moveSelectedImage(-1);
                        if (event.key === "ArrowRight") moveSelectedImage(1);
                      }}
                      tabIndex={0}
                    >
                      {selectedImage ? (
                        <img alt={`当前图片结果 ${selectedImageIndex + 1}`} src={selectedImage.url} />
                      ) : (
                        <div className="imageStudioEmpty">
                          <strong>{showImagePlaceholders ? "图片生成中..." : "当前还没有图片结果"}</strong>
                          <span>{showImagePlaceholders ? "生成完成后会自动显示在这里" : "可以返回应用调整参数后再次生成"}</span>
                        </div>
                      )}
                      {selectedImage ? <span className="imageStudioCounter">{selectedImageIndex + 1} / {generatedCount}</span> : null}
                    </div>

                    {imageResults.length > 1 ? (
                      <div className="imageStudioThumbnails" aria-label="切换图片结果">
                        {imageResults.map((image, index) => (
                          <button
                            aria-label={`查看图片结果 ${index + 1}`}
                            aria-pressed={selectedImage?.id === image.id}
                            className={selectedImage?.id === image.id ? "active" : ""}
                            key={image.id}
                            onClick={() => setSelectedImageId(image.id)}
                            type="button"
                          >
                            <img alt="" src={image.url} />
                            <span>{index + 1}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <aside className="imageStudioInspector">
                    <div className="imageStudioInspectorHeader">
                      <div>
                        <span>当前选择</span>
                        <strong>{selectedImage ? `图片 ${selectedImageIndex + 1}` : "等待生成"}</strong>
                      </div>
                      <em>{imageMeta.ratio}</em>
                    </div>

                    <dl className="imageStudioMeta">
                      <div><dt>视觉风格</dt><dd>{imageMeta.style}</dd></div>
                      <div><dt>{work.platform === "wechat-images" ? "配图类型" : "人物形象"}</dt><dd>{imageMeta.drawPortrait}</dd></div>
                      <div><dt>生成模式</dt><dd>{formatImageModeLabel(imageMode)}</dd></div>
                    </dl>

                    <div className="imageStudioWatermark">
                      <div>
                        <span>签名水印</span>
                        <button
                          aria-label={watermarkEnabled ? "关闭签名水印" : "开启签名水印"}
                          aria-pressed={watermarkEnabled}
                          className={watermarkEnabled ? "signatureSwitch active" : "signatureSwitch"}
                          onClick={() => setWatermarkEnabled((current) => !current)}
                          type="button"
                        ><span /></button>
                      </div>
                      <input
                        disabled={!watermarkEnabled}
                        maxLength={50}
                        onChange={(event) => setWatermarkText(event.target.value)}
                        placeholder="输入水印文字"
                        value={watermarkText}
                      />
                    </div>

                    <div className="imageStudioPrimaryActions">
                      <button
                        className="instancePrimaryAction"
                        disabled={!selectedImage}
                        onClick={() => selectedImage && void handleImageDownload(selectedImage.url, `图片结果-${selectedImageIndex + 1}.png`)}
                        type="button"
                      >下载所选</button>
                      <button
                        className="instanceActionButton"
                        disabled={!selectedImage}
                        onClick={() => selectedImage && void handleImageCopy(selectedImage.url)}
                        type="button"
                      >复制图片</button>
                    </div>

                    {isPolicyRenewalCardWork ? (
                      <div className="renewalMessageCard">
                        <span>配套微信文案</span>
                        <p>{work.content}</p>
                        <div>
                          <button onClick={() => void handleCopy("renewal-message", work.content)} type="button">
                            {copied["renewal-message"] ? "已复制" : "复制文案"}
                          </button>
                          <button onClick={editPolicyRenewalCard} type="button">修改信息</button>
                        </div>
                      </div>
                    ) : null}

                    <div className="imageStudioSecondaryActions">
                      <button disabled={!selectedImage} onClick={() => selectedImage && void handleImageOpen(selectedImage.url)} type="button">查看原图</button>
                      <button disabled={imageResults.length === 0} onClick={() => void handleBatchDownload(imageResults)} type="button">下载全部</button>
                      {imageRetryable ? <button disabled={retryingImages} onClick={() => void retryImageGeneration()} type="button">{retryingImages ? "排队中..." : "重试生成"}</button> : null}
                    </div>
                  </aside>
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
                    <article className={index === recommendedImageIndex ? "generatedImageCard recommended" : "generatedImageCard"} key={image.id}>
                      <div className="generatedImageHeader">
                        <div className="generatedImageMeta">
                          <strong>结果 {index + 1}</strong>
                          <span>{imageMeta.ratio} · {imageMeta.style}</span>
                        </div>
                        {index === recommendedImageIndex ? <span className="generatedImageBadge">推荐先看</span> : null}
                      </div>
                      <div className="generatedImageMedia">
                        <img alt={`生成结果 ${index + 1}`} className="generatedImageAsset" src={image.url} />
                      </div>
                      <div className="generatedImageInsight">
                        <strong>{index === recommendedImageIndex ? "这张更适合先判断整体方向" : "可作为备选方案进行比较"}</strong>
                        <span>{index === recommendedImageIndex ? "适合先看构图、主体和整体气质，再决定是否继续微调。" : "建议和推荐图对比主体突出度、留白和风格稳定性。"}</span>
                      </div>
                      <div className="generatedImageActions">
                        <button className="instancePrimaryAction" onClick={() => void handleImageDownload(image.url, `图片结果-${index + 1}.png`)} type="button">下载这张</button>
                        <button className="instanceActionButton" onClick={() => void handleImageOpen(image.url)} type="button">查看大图</button>
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

              <section
                className="imageInstanceCard imageInfoCard"
                ref={(node) => { sectionRefs.current["run-info"] = node; }}
              >
                <div className="imageSectionHeader">
                  <div>
                    <h2>输入与任务信息</h2>
                    <p>这里保留生成背景，方便在看完结果后再回头核对标题、时间和输入内容。</p>
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
      <div className={`workDetailPage instanceOriginPage writeCopyOriginPage ${showResultDetails ? "" : "resultDetailsCollapsed"}`}>
        <div className="page-content instanceOriginShell">
          <ResultWorkspaceBar detailsOpen={showResultDetails} onToggleDetails={() => setShowResultDetails((current) => !current)} returnHref={workReturnHref} returnLabel={workReturnLabel} work={work} />
          <section className="instanceOriginLayout">
            <aside className="instanceOriginSidebar">
              <div className="instanceOriginSidebarCard">
                <div className="sidebarBackRow">
                  <a className="back-btn backLink instanceTextBack" href={workReturnHref}>← {workReturnLabel}</a>
                </div>

                <div className="instanceSidebarSection">
                  <strong>内容导航</strong>
                  {showResultDetails ? <>
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
                  </> : null}
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
                <span>想让后续内容更贴近你的表达方式？</span>
                <a href={appPath("/profile")}>完善数字分身人设 →</a>
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
                  <div className="instanceStudioHeroMeta instanceOriginMeta">
                    <span>{formatAppLabel(work.platform)}</span>
                    <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
                    <em>{formatDate(work.updated_at)}</em>
                  </div>
                </div>
                <div className="instanceSummaryTable instanceOriginTable">
                  <div className="instanceSummaryRow">
                    <div className="instanceSummaryCell">
                      <span>标题</span>
                      <div className="instanceOriginTitleCell">
                        <em>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</em>
                        <strong>{formatWorkTitle(work)}</strong>
                      </div>
                    </div>
                    <div className="instanceSummaryCell">
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
                    <p>按渠道分组展示口播稿、小红书、公众号和朋友圈结果。</p>
                  </div>
                  {streamState.connected
                    ? <span className="instanceSaveHint">内容生成中，正在持续回填结果...</span>
                    : saveMessage ? <span className="instanceSaveHint">{savingItemId ? "正在保存..." : saveMessage}</span> : null}
                </div>

                {streamState.error ? (
                  <div className="imageModeNotice">{streamState.error}</div>
                ) : null}

                {hasRenderableBatches ? (
                  <div className="instanceBatchStack writeCopyBatchStack instanceOriginBatchStack" style={{ fontSize: `${fontScale}%` }}>
                    {batches.filter((batch) => batch.id === resolvedBatchId).map((batch) => (
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
                                getActiveItemId(batch) === item.id ? "active" : "",
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
                          const activeItem = batch.items.find((item) => item.id === getActiveItemId(batch)) ?? batch.items[0];
                          if (!activeItem) {
                            return (
                              <div className="instancePlainResult">
                                <div className="instancePreviewPlain">这一组内容还在生成中，结果会在这里持续回填。</div>
                              </div>
                            );
                          }
                          return (
                          <ResultBlock
                            copied={Boolean(copied[activeItem.id])}
                            isWriteCopy
                            item={activeItem}
                            key={activeItem.id}
                            onCopy={() => void handleCopy(activeItem.id, getEditableBody(activeItem, xhsDrafts))}
                            onExport={() => handleExport(activeItem.title, getEditableBody(activeItem, xhsDrafts), {
                              viewMode: activeItem.viewMode,
                              theme: wechatThemes[activeItem.id] ?? "default",
                            })}
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
                    <MarkdownContent content={plainResultContent} />
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

  if (isGeneralContentWork) {
    const sourceText = typeof work.app_run?.input_payload?.source === "string" ? work.app_run.input_payload.source : "";
    const targetLabels = formatChannelLabels(work.app_run?.target_channels ?? []) || "口播稿、公众号";
    const generalContentReport = streamState.content || work.content || "内容生成中，结果会在这里持续回填。";
    return (
      <div className={`workDetailPage instanceOriginPage generalContentWorkDetailPage ${showResultDetails ? "" : "resultDetailsCollapsed"}`}>
        <div className="page-content instanceOriginShell generalContentResultShell">
          <ResultWorkspaceBar detailsOpen={showResultDetails} onToggleDetails={() => setShowResultDetails((current) => !current)} returnHref={workReturnHref} returnLabel={workReturnLabel} work={work} />
          <section className="instanceOriginLayout generalContentResultLayout">
            <aside className="instanceOriginSidebar">
              <div className="instanceOriginSidebarCard generalContentResultSidebarCard">
                <div className="sidebarBackRow">
                  <a className="back-btn backLink instanceTextBack" href={workReturnHref}>← {workReturnLabel}</a>
                </div>

                <div className="instanceSidebarSection">
                  <strong>内容导航</strong>
                  {showResultDetails ? <>
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
                  </> : null}
                  <button
                    className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"}
                    onClick={() => jumpToSection("generated-content")}
                    type="button"
                  >
                    生成结果
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
                  <strong>目录</strong>
                  <button
                    className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"}
                    onClick={() => jumpToSection("generated-content")}
                    type="button"
                  >
                    生成结果
                  </button>
                </div>
              </div>
            </aside>

            <main className="instanceOriginMain generalContentResultMain">
              <section
                className="instanceSectionCard instanceOriginInfoCard generalContentResultInfoCard"
                ref={(node) => { sectionRefs.current["run-info"] = node; }}
              >
                <div className="instanceSectionHeader instanceOriginHeader">
                  <div>
                    <h1>{formatAppLabel(work.platform)}</h1>
                    <p>{streamState.connected ? "内容正在生成中，泛选题报告会持续回填。" : "已按泛内容创作案例页结构展示本次生成结果，可继续复制和导出。"}</p>
                  </div>
                  <div className="instanceStudioHeroMeta instanceOriginMeta">
                    <span>{formatAppLabel(work.platform)}</span>
                    <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
                    <em>{formatDate(work.updated_at)}</em>
                  </div>
                </div>
                <div className="instanceSummaryTable instanceOriginTable">
                  <div className="instanceSummaryRow">
                    <div className="instanceSummaryCell">
                      <span>标题</span>
                      <div className="instanceOriginTitleCell">
                        <em>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</em>
                        <strong>{formatWorkTitle(work)}</strong>
                      </div>
                    </div>
                    <div className="instanceSummaryCell">
                      <span>创建时间</span>
                      <strong>{formatDate(work.created_at)}</strong>
                    </div>
                  </div>
                </div>
              </section>

              <section
                className="instanceSectionCard instanceOriginInputCard generalContentInputCard"
                ref={(node) => { sectionRefs.current["input-info"] = node; }}
              >
                <div className="instanceSectionHeader">
                  <h2>实例信息</h2>
                </div>
                <div className="instanceSourceMetaList instanceOriginSourceTable">
                  <div className="instanceSourceMetaItem">
                    <span>创作内容</span>
                    <div className="instanceInputActionRow">
                      <strong>文本输入</strong>
                      <button className="instanceActionButton" onClick={() => setPreviewField({ label: "创作内容", value: sourceText, mode: "plain" })} type="button">查看</button>
                    </div>
                  </div>
                  <div className="instanceSourceMetaItem">
                    <span>生成类型</span>
                    <strong>{targetLabels}</strong>
                  </div>
                </div>
              </section>

              <section
                className="instanceSectionCard writeCopyResultSectionCard generalContentResultCard"
                ref={(node) => { sectionRefs.current["generated-content"] = node; }}
              >
                <div className="instanceSectionHeader instanceSectionHeaderSplit">
                  <div>
                    <h2>生成结果</h2>
                    <p>依次展示议题提炼依据、选题标题、渠道文案和创作说明。</p>
                  </div>
                  <div className="creationExampleBlockActions generalContentReportActions">
                    <button onClick={() => void handleCopy("general-content-report", generalContentReport)} type="button">
                      {copied["general-content-report"] ? "已复制" : "复制"}
                    </button>
                    <button onClick={() => handleExport(formatWorkTitle(work), generalContentReport)} type="button">导出Word</button>
                  </div>
                  {streamState.connected
                    ? <span className="instanceSaveHint">内容生成中，正在持续回填结果...</span>
                    : saveMessage ? <span className="instanceSaveHint">{savingItemId ? "正在保存..." : saveMessage}</span> : null}
                </div>

                {streamState.error ? (
                  <div className="imageModeNotice">{streamState.error}</div>
                ) : null}

                <div className="instancePlainResult generalContentReportBody" style={{ fontSize: `${fontScale}%` }}>
                  <MarkdownContent content={generalContentReport} />
                </div>
              </section>
            </main>
          </section>
        </div>

        {previewField ? <PreviewFieldModal previewField={previewField} onClose={() => setPreviewField(null)} /> : null}
      </div>
    );
  }

  if (isLetterWork) {
    const letterContent = streamState.content || work.content;

    return (
      <div className={`workDetailPage instanceStudioPage letterWorkDetailPage ${showResultDetails ? "" : "resultDetailsCollapsed"}`}>
        <div className="page-content letterResultShell">
          <ResultWorkspaceBar detailsOpen={showResultDetails} onToggleDetails={() => setShowResultDetails((current) => !current)} returnHref={workReturnHref} returnLabel={workReturnLabel} work={work} />
          <section className="letterResultHero">
            <div className="letterResultHeroHeader">
              <div className="letterResultTitleBlock">
                <h1>{formatWorkTitle(work)}</h1>
                <p>围绕一个主题与背景，生成一篇更适合公众号发布的走心长信。</p>
              </div>
              <div className="instanceStudioHeroMeta compact letterResultHeroMeta">
                <span>{formatAppLabel(work.platform)}</span>
                <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
                <em>{formatDate(work.updated_at)}</em>
              </div>
            </div>
            <div className="letterResultHeroActions">
              <a className="creationExampleStudioAction" href={appPath(`/apps/${work.platform}?from=workspace&entry=letter`)}>再次创作</a>
            </div>
          </section>

          <section className="letterResultCanvas">
            <aside className="letterResultSidebarCard">
              <div className="sidebarBackRow">
                <a className="back-btn backLink instanceTextBack" href={workReturnHref}>← {workReturnLabel}</a>
              </div>
              <div className="instanceSidebarSection">
                <strong>内容导航</strong>
                <div className="letterSidebarMeta">内容缩放</div>
                <div className="instanceZoomGroup">
                  <button className={fontScale < 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.max(90, current - 10))} type="button">A-</button>
                  <button className={fontScale === 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale(100)} type="button">{fontScale}%</button>
                  <button className={fontScale > 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.min(140, current + 10))} type="button">A+</button>
                </div>
              </div>
              <div className="instanceSidebarSection">
                <strong>目录</strong>
                {showResultDetails ? <button
                  className={activeSection === "input-info" ? "instanceNavButton active" : "instanceNavButton"}
                  onClick={() => jumpToSection("input-info")}
                  type="button"
                >
                  主题
                </button> : null}
                <button
                  className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"}
                  onClick={() => jumpToSection("generated-content")}
                  type="button"
                >
                  生成结果
                </button>
              </div>
            </aside>

            <main className="letterResultMain" style={{ fontSize: `${fontScale}%` }}>
              <section
                className="creationExampleContentCard letterResultCard"
                id="generated-content"
                ref={(node) => { sectionRefs.current["generated-content"] = node; }}
              >
                {inputEntries.length > 0 ? (
                  <article
                    className="creationExampleBlock creationExampleBlockAccent letterInputSummaryBlock"
                    id="input-info"
                    ref={(node) => { sectionRefs.current["input-info"] = node; }}
                  >
                    <div className="creationExampleBlockHeader">
                      <div className="creationExampleBlockTitle">
                        <span className="creationExampleDocIcon" aria-hidden="true">📄</span>
                        <h2>主题</h2>
                      </div>
                    </div>
                    <div className="creationExampleBlockBody">
                      <MarkdownContent content={stringifySingleInputValue(work.app_run?.input_payload?.theme)} />
                    </div>
                  </article>
                ) : null}

                <article className="creationExampleBlock creationExampleBlockAccent letterResultLeadBlock">
                  <div className="creationExampleBlockHeader">
                      <div className="creationExampleBlockTitle">
                        <span className="creationExampleDocIcon" aria-hidden="true">🪄</span>
                      <h2>生成结果</h2>
                      </div>
                    <div className="creationExampleBlockActions">
                      <button onClick={() => void handleCopy("letter-all", letterContent)} type="button">{copied["letter-all"] ? "已复制" : "复制"}</button>
                      <button onClick={() => handleExport("走心一封信", letterContent, { viewMode: "wechat" })} type="button">导出Word</button>
                    </div>
                  </div>
                  <div className="creationExampleBlockBody letterResultBody">
                    <MarkdownContent content={letterContent || "内容生成中，结果会在这里持续回填。"} />
                  </div>
                </article>
              </section>
            </main>
          </section>
        </div>

        {previewField ? <PreviewFieldModal previewField={previewField} onClose={() => setPreviewField(null)} /> : null}
      </div>
    );
  }

  if (isTopicPickerWork) {
    const topicContent = streamState.content || work.content;
    const topicSections = topicPickerNavItems;
    const selectedTopicSection = topicSections.find((section) => section.id === selectedTopicId)
      ?? topicSections.find((section) => section.id === "topic-picker-list")
      ?? topicSections[0];
    const topicHandoffPrompt = selectedTopicSection ? `${selectedTopicSection.title}\n\n${selectedTopicSection.body}` : topicContent;

    return (
      <div className={`workDetailPage instanceStudioPage topicPickerWorkDetailPage ${showResultDetails ? "" : "resultDetailsCollapsed"}`}>
        <div className="page-content topicPickerResultShell">
          <ResultWorkspaceBar detailsOpen={showResultDetails} onToggleDetails={() => setShowResultDetails((current) => !current)} returnHref={workReturnHref} returnLabel={workReturnLabel} work={work} primaryHref={appPath(`/apps/write-copy?from=topic-picker&prompt=${encodeURIComponent(topicHandoffPrompt)}`)} primaryLabel="继续写文案" />
          <section className="topicPickerResultHero">
            <div className="topicPickerResultHeroHeader">
              <div className="topicPickerResultTitleBlock">
                <h1>{formatWorkTitle(work)}</h1>
                <p>根据你的主题、人设和平台，一次生成 6 个可继续创作的选题。</p>
              </div>
              <div className="instanceStudioHeroMeta compact topicPickerResultHeroMeta">
                <span>{formatAppLabel(work.platform)}</span>
                <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
                <em>{formatDate(work.updated_at)}</em>
              </div>
            </div>
            <div className="topicPickerResultHeroActions">
              <a className="creationExampleStudioAction" href={appPath(`/apps/${work.platform}?entry=topic-picker`)}>再次创作</a>
            </div>
          </section>

          <section className="topicPickerResultCanvas">
            <aside className="topicPickerResultSidebarCard">
              <div className="sidebarBackRow">
                <a className="back-btn backLink instanceTextBack" href={workReturnHref}>← {workReturnLabel}</a>
              </div>
              <div className="instanceSidebarSection">
                <strong>内容导航</strong>
                <div className="topicPickerSidebarMeta">内容缩放</div>
                <div className="instanceZoomGroup">
                  <button className={fontScale < 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.max(90, current - 10))} type="button">A-</button>
                  <button className={fontScale === 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale(100)} type="button">{fontScale}%</button>
                  <button className={fontScale > 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.min(140, current + 10))} type="button">A+</button>
                </div>
              </div>
              <div className="instanceSidebarSection">
                <strong>目录</strong>
                <button
                  className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"}
                  onClick={() => jumpToSection("generated-content")}
                  type="button"
                >
                  生成结果
                </button>
                {topicSections.map((section) => (
                  <button
                    className={activeSection === section.id ? "instanceNavButton active" : "instanceNavButton"}
                    key={section.id}
                    onClick={() => jumpToSection(section.id)}
                    type="button"
                  >
                    {section.title.replace(/^【|】$/g, "")}
                  </button>
                ))}
              </div>
            </aside>

            <main className="topicPickerResultMain" style={{ fontSize: `${fontScale}%` }}>
              <section
                className="creationExampleContentCard topicPickerResultCard"
                id="generated-content"
                ref={(node) => { sectionRefs.current["generated-content"] = node; }}
              >
                <article className="creationExampleBlock creationExampleBlockAccent topicPickerResultLeadBlock">
                  <div className="creationExampleBlockHeader">
                    <div className="creationExampleBlockTitle">
                      <span className="creationExampleDocIcon" aria-hidden="true">📋</span>
                      <h2>生成结果</h2>
                    </div>
                    <div className="creationExampleBlockActions">
                      <button onClick={() => void handleCopy("topic-picker-all", topicContent)} type="button">{copied["topic-picker-all"] ? "已复制" : "复制"}</button>
                      <button onClick={() => handleExport("找选题生成结果", topicContent)} type="button">导出Word</button>
                    </div>
                  </div>
                  {streamState.connected ? <p className="topicPickerStreamingHint">内容生成中，选题结果会持续回填...</p> : null}
                </article>

                {inputEntries.length > 0 ? (
                  <section className="topicPickerInputSummary" id="input-info" ref={(node) => { sectionRefs.current["input-info"] = node; }}>
                    {inputEntries.map(([key, value]) => (
                      <div key={key}>
                        <span>{formatInputLabel(key)}</span>
                        <strong>{formatInputValue(key, value)}</strong>
                      </div>
                    ))}
                  </section>
                ) : null}

                {topicSections.length > 0 ? topicSections.map((section) => (
                  <section
                    className={`${section.id === "topic-picker-list" ? "topicPickerReportSection topicPickerListSection" : "topicPickerReportSection"} ${selectedTopicSection?.id === section.id ? "selected" : ""}`}
                    id={section.id}
                    key={section.id}
                    ref={(node) => { sectionRefs.current[section.id] = node; }}
                  >
                    <div className="topicPickerSectionHeading">
                      <div className="creationExampleBlockTitle">
                        <span className="creationExampleDocIcon" aria-hidden="true">{section.id === "topic-picker-list" ? "✨" : "📄"}</span>
                        <h2>{section.title}</h2>
                      </div>
                      <button
                        aria-pressed={selectedTopicSection?.id === section.id}
                        onClick={() => setSelectedTopicId(section.id)}
                        type="button"
                      >{selectedTopicSection?.id === section.id ? "已选用" : "选用此方向"}</button>
                    </div>
                    <div className="creationExampleBlockBody">
                      <MarkdownContent content={section.body} />
                    </div>
                  </section>
                )) : (
                  <section className="topicPickerReportSection">
                    <div className="creationExampleBlockBody">
                      <MarkdownContent content={topicContent || "选题内容还在生成中，稍后会自动回填。"} />
                    </div>
                  </section>
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

  if (isXiaohongshuCheckWork) {
    const reportContent = streamState.content || work.content;
    const report = parseXiaohongshuCheckReport(reportContent);
    const sourceContent = typeof work.app_run?.input_payload?.content === "string"
      ? work.app_run.input_payload.content
      : "";
    const statusLabel = work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status);

    return (
      <div className={`workDetailPage instanceStudioPage xiaohongshuCheckResultPage ${showResultDetails ? "" : "resultDetailsCollapsed"}`}>
        <div className="page-content xiaohongshuCheckResultShell">
          <ResultWorkspaceBar detailsOpen={showResultDetails} onToggleDetails={() => setShowResultDetails((current) => !current)} returnHref={workReturnHref} returnLabel={workReturnLabel} work={work} primaryLabel="重新检测" />
          <section
            className="xiaohongshuCheckHero"
            id="basic-info"
            ref={(node) => { sectionRefs.current["basic-info"] = node; }}
          >
            <div>
              <span className="xiaohongshuCheckEyebrow">内容合规检测</span>
              <h1>{formatWorkTitle(work)}</h1>
              <p>识别小红书内容中的潜在违规表达，并给出可直接发布的稳妥改写。</p>
            </div>
            <div className="xiaohongshuCheckHeroMeta">
              <span>{formatAppLabel(work.platform)}</span>
              <strong>{statusLabel}</strong>
              <em>{formatDate(work.updated_at)}</em>
            </div>
          </section>

          <section className="xiaohongshuCheckCanvas">
            <aside className="xiaohongshuCheckSidebar">
              <div className="sidebarBackRow">
                <a className="back-btn backLink instanceTextBack" href={workReturnHref}>← {workReturnLabel}</a>
              </div>
              <div className="instanceSidebarSection">
                <strong>内容导航</strong>
                {showResultDetails ? <>
                  <button className={activeSection === "basic-info" ? "instanceNavButton active" : "instanceNavButton"} onClick={() => jumpToSection("basic-info")} type="button">基本信息</button>
                  <button className={activeSection === "instance-info" ? "instanceNavButton active" : "instanceNavButton"} onClick={() => jumpToSection("instance-info")} type="button">实例信息</button>
                </> : null}
                <button className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"} onClick={() => jumpToSection("generated-content")} type="button">生成结果</button>
              </div>
              <div className="instanceSidebarSection">
                <strong>内容缩放</strong>
                <div className="instanceZoomGroup">
                  <button className={fontScale < 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.max(90, current - 10))} type="button">A-</button>
                  <button className={fontScale === 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale(100)} type="button">{fontScale}%</button>
                  <button className={fontScale > 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.min(140, current + 10))} type="button">A+</button>
                </div>
              </div>
            </aside>

            <main className="xiaohongshuCheckMain" style={{ fontSize: `${fontScale}%` }}>
              <section
                className="xiaohongshuCheckInfoCard"
                id="instance-info"
                ref={(node) => { sectionRefs.current["instance-info"] = node; }}
              >
                <div className="xiaohongshuCheckInfoRow">
                  <div><span>应用名称</span><strong>小红书违规检测</strong></div>
                  <div><span>状态</span><strong className="xiaohongshuCheckStatus">{statusLabel}</strong></div>
                </div>
                <div className="xiaohongshuCheckInfoRow">
                  <div><span>实例 ID</span><strong>{work.app_run?.id ?? work.id}</strong></div>
                  <div><span>创建时间</span><strong>{formatDate(work.created_at)}</strong></div>
                </div>
                <div className="xiaohongshuCheckSourceRow">
                  <div>
                    <span>小红书内容</span>
                    <strong>{sourceContent ? "文本输入" : "暂无内容"}</strong>
                  </div>
                  <button
                    className="xiaohongshuCheckViewButton"
                    disabled={!sourceContent}
                    onClick={() => setPreviewField({ label: "小红书内容", value: sourceContent, mode: "plain" })}
                    type="button"
                  >
                    查看内容
                  </button>
                </div>
              </section>

              <section
                className="xiaohongshuCheckReportCard"
                id="generated-content"
                ref={(node) => { sectionRefs.current["generated-content"] = node; }}
              >
                <div className="xiaohongshuCheckReportHeader">
                  <div>
                    <span>生成内容</span>
                    <h2>生成结果</h2>
                  </div>
                  <div className="creationExampleBlockActions">
                    {report?.revisedBody ? <button onClick={() => void handleCopy("xiaohongshu-check-revised", report.revisedBody)} type="button">{copied["xiaohongshu-check-revised"] ? "安全稿已复制" : "复制安全稿"}</button> : null}
                    <button disabled={!reportContent.trim()} onClick={() => void handleCopy("xiaohongshu-check-report", reportContent)} type="button">{copied["xiaohongshu-check-report"] ? "已复制" : "复制"}</button>
                    <button disabled={!reportContent.trim()} onClick={() => handleExport("小红书违规检测报告", reportContent)} type="button">导出Word</button>
                  </div>
                </div>

                {streamState.connected ? <div className="xiaohongshuCheckStreamingHint">检测报告生成中，内容正在持续回填...</div> : null}
                {streamState.error ? <div className="imageModeNotice">{streamState.error}</div> : null}

                {report ? (
                  <div className="xiaohongshuCheckReportBody">
                    {report.disclaimer ? <div className="xiaohongshuCheckDisclaimer">{report.disclaimer}</div> : null}
                    <div className="xiaohongshuCheckSummaryGrid">
                      <div>
                        <span>风险等级</span>
                        <strong className={getXiaohongshuRiskClass(report.riskLevel)}>{report.riskLevel}</strong>
                      </div>
                      <div><span>文章性质</span><strong>{report.articleNature}</strong></div>
                    </div>
                    <section className="xiaohongshuCheckOverview">
                      <h3>风险概览</h3>
                      <p>{report.riskOverview}</p>
                    </section>
                    <section className="xiaohongshuCheckRevisedBody">
                      <div className="xiaohongshuCheckSectionTitle"><span>01</span><h3>修改后正文</h3></div>
                      <MarkdownContent content={report.revisedBody} />
                    </section>
                    <section className="xiaohongshuCheckAmendments">
                      <div className="xiaohongshuCheckSectionTitle"><span>02</span><h3>改动说明</h3></div>
                      <div className="xiaohongshuCheckAmendmentStack">
                        {report.amendments.map((amendment, index) => (
                          <article key={`${amendment.original}-${index}`}>
                            <span className="xiaohongshuCheckAmendmentIndex">改动 {String(index + 1).padStart(2, "0")}</span>
                            <div className="xiaohongshuCheckComparison">
                              <div><span>原文</span><p>{amendment.original}</p></div>
                              <div><span>改为</span><p>{amendment.revision}</p></div>
                            </div>
                            <div className="xiaohongshuCheckReason"><strong>原因</strong><p>{amendment.reason}</p></div>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="xiaohongshuCheckRawReport">
                    <MarkdownContent content={reportContent || "检测报告生成中，结果会在这里持续回填。"} />
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

  if (isVideoScriptPolishWork) {
    const videoPolishResultContent = streamState.content || work.content;
    const reportSections = parseVideoPolishReportSections(videoPolishResultContent);
    const finalPolishSection = reportSections.find((section) => section.kind === "final");
    const polishNavItems = [
      ...(showResultDetails && polishSourceText ? [{ id: "input-info", label: "原始口播稿" }] : []),
      ...reportSections.map((section) => ({ id: section.id, label: section.title })),
    ];

    return (
      <div className={`workDetailPage instanceStudioPage polishWorkDetailPage videoPolishResultPage ${showResultDetails ? "" : "resultDetailsCollapsed"}`}>
        <div className="page-content instanceStudioShell videoPolishResultShell">
          <ResultWorkspaceBar detailsOpen={showResultDetails} onToggleDetails={() => setShowResultDetails((current) => !current)} returnHref={workReturnHref} returnLabel={workReturnLabel} work={work} primaryLabel="再次精修" />
          <section className="instanceStudioHero polishInstanceHero videoPolishResultHero">
            <div className="instanceStudioHeroHeader videoPolishResultHeroHeader">
              <div className="instanceStudioTitleBlock videoPolishResultTitleBlock">
                <h1>{formatWorkTitle(work)}</h1>
                <p>口播文案粘进来，拿详细的修改意见。</p>
              </div>
              <div className="instanceStudioHeroMeta compact videoPolishResultHeroMeta">
                <span>{formatAppLabel(work.platform)}</span>
                <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
                <em>{formatDate(work.updated_at)}</em>
              </div>
            </div>
            <div className="videoPolishResultHeroActions">
              <a className="creationExampleStudioAction" href={appPath(`/apps/${work.platform}`)}>再次创作</a>
            </div>
          </section>

          <section className="videoPolishResultCanvas">
            <aside className="videoPolishResultSidebarCard">
              <div className="sidebarBackRow">
                <a className="back-btn backLink instanceTextBack" href={workReturnHref}>← {workReturnLabel}</a>
              </div>
              <div className="instanceSidebarSection">
                <strong>内容导航</strong>
                <div className="videoPolishSidebarMeta">内容缩放</div>
                <div className="instanceZoomGroup">
                  <button className={fontScale < 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.max(90, current - 10))} type="button">A-</button>
                  <button className={fontScale === 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale(100)} type="button">{fontScale}%</button>
                  <button className={fontScale > 100 ? "instanceZoomButton active" : "instanceZoomButton"} onClick={() => setFontScale((current) => Math.min(140, current + 10))} type="button">A+</button>
                </div>
              </div>
              <div className="instanceSidebarSection">
                <strong>目录</strong>
                <button
                  className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"}
                  onClick={() => jumpToSection("generated-content")}
                  type="button"
                >
                  生成结果
                </button>
                {polishNavItems.map((navItem) => (
                  <button
                    className={activeSection === navItem.id ? "instanceNavButton active" : "instanceNavButton"}
                    key={navItem.id}
                    onClick={() => jumpToSection(navItem.id)}
                    type="button"
                  >
                    {navItem.label}
                  </button>
                ))}
              </div>
            </aside>

            <main className="videoPolishResultMain" style={{ fontSize: `${fontScale}%` }}>
              <section
                className="creationExampleContentCard videoPolishResultCard"
                id="generated-content"
                ref={(node) => { sectionRefs.current["generated-content"] = node; }}
              >
                <article className="creationExampleBlock creationExampleBlockAccent">
                  <div className="creationExampleBlockHeader">
                    <div className="creationExampleBlockTitle">
                      <span className="creationExampleDocIcon" aria-hidden="true">📋</span>
                      <h2>生成结果</h2>
                    </div>
                    <div className="creationExampleBlockActions">
                      {finalPolishSection ? <button onClick={() => void handleCopy("polish-final", finalPolishSection.body)} type="button">{copied["polish-final"] ? "成稿已复制" : "复制精修成稿"}</button> : null}
                      <button onClick={() => void handleCopy("polish-all", videoPolishResultContent)} type="button">{copied["polish-all"] ? "已复制" : "复制"}</button>
                      <button onClick={() => handleExport("生成结果", videoPolishResultContent)} type="button">导出Word</button>
                    </div>
                  </div>

                  <div className="videoPolishEmbeddedSection videoPolishReportLead">
                    <div className="creationExampleBlockTitle">
                      <span className="creationExampleDocIcon" aria-hidden="true">📋</span>
                      <h2>专业口播文案批改报告</h2>
                    </div>
                  </div>

                  {finalPolishSection ? (
                    <VideoPolishReportSection
                      key={finalPolishSection.id}
                      section={finalPolishSection}
                      registerSection={(node) => { sectionRefs.current[finalPolishSection.id] = node; }}
                    />
                  ) : null}

                  {polishSourceText ? (
                    <div className="videoPolishEmbeddedSection" id="input-info" ref={(node) => { sectionRefs.current["input-info"] = node; }}>
                      <div className="creationExampleBlockHeader">
                        <div className="creationExampleBlockTitle">
                          <span className="creationExampleDocIcon" aria-hidden="true">📄</span>
                          <h2>原始口播稿</h2>
                        </div>
                      </div>
                      <div className="creationExampleBlockBody">
                        <MarkdownContent content={polishSourceText} />
                      </div>
                    </div>
                  ) : null}

                  {reportSections.length > 0 ? reportSections.filter((section) => section.id !== finalPolishSection?.id).map((section) => (
                    <VideoPolishReportSection
                      key={section.id}
                      section={section}
                      registerSection={(node) => { sectionRefs.current[section.id] = node; }}
                    />
                  )) : (
                    <div className="videoPolishEmbeddedSection">
                      <div className="creationExampleBlockHeader">
                        <div className="creationExampleBlockTitle">
                          <span className="creationExampleDocIcon" aria-hidden="true">🪄</span>
                          <h2>精修结果</h2>
                        </div>
                      </div>
                      <div className="creationExampleBlockBody">
                        <MarkdownContent content={videoPolishResultContent} />
                      </div>
                    </div>
                  )}
                </article>
              </section>
            </main>
          </section>
        </div>

        {previewField ? <PreviewFieldModal previewField={previewField} onClose={() => setPreviewField(null)} /> : null}
        {previewImage ? <PreviewImageModal previewImage={previewImage} onClose={() => setPreviewImage(null)} /> : null}
      </div>
    );
  }

  return (
    <div className={`${isStructuredCopyWork ? "workDetailPage instanceStudioPage writeCopyWorkDetailPage" : isSimpleCopyWork ? "workDetailPage instanceStudioPage simpleCopyWorkDetailPage" : isPolishWork ? "workDetailPage instanceStudioPage polishWorkDetailPage" : "workDetailPage instanceStudioPage"} ${showResultDetails ? "" : "resultDetailsCollapsed"}`}>
      <div className="page-content instanceStudioShell">
        <ResultWorkspaceBar detailsOpen={showResultDetails} onToggleDetails={() => setShowResultDetails((current) => !current)} returnHref={workReturnHref} returnLabel={workReturnLabel} work={work} primaryLabel={isPolishWork ? "再次精修" : "再次创作"} />
        <section className={isStructuredCopyWork ? "instanceStudioHero writeCopyInstanceHero" : isPolishWork ? "instanceStudioHero polishInstanceHero" : "instanceStudioHero"}>
          <div className="instanceStudioHeroHeader">
            <div className="instanceStudioTitleBlock">
              <h1>{formatWorkTitle(work)}</h1>
              <p>{isWriteCopyWork ? "本作品使用资深创作者风格创作，若想打造自己的个性化风格，请填写人设问卷。" : isTrafficCopyWork ? "围绕素材生成流量内容，重点保留冲突钩子、逻辑推进和普通人代入场景。" : isMarketingCopyWork ? "围绕素材，从产品、方案、案例和观念四个方向生成营销内容。" : isLeadCopyWork ? "围绕同一份素材生成口播稿、小红书笔记和公众号文章，并按渠道保留各自的引流节奏。" : isVideoScriptPolishWork ? "这条作品保留了原稿的核心意思，同时把开头、结构和表达节奏重新提了一层，方便你直接复看、复制和继续改稿。" : isWechatArticlePolishWork ? "这条作品以现有文章为底稿，重点重做了标题、结构推进、语言质感和结尾互动，方便你直接进入长文阅读和继续调整。" : "本作品使用资深创作者风格创作，若想打造自己的个性化风格，请填写人设问卷。"}</p>
            </div>
            <div className="instanceStudioHeroMeta compact">
              <span>{formatAppLabel(work.platform)}</span>
              <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
              <em>{formatDate(work.updated_at)}</em>
            </div>
          </div>
          {isStructuredCopyWork ? (
            <div className="writeCopyInstanceHeroSummary">
              <div>
                <span>表达倾向</span>
                <strong>{formatToneLabel(resolvedTone) || (isWriteCopyWork ? "更像自己" : "-")}</strong>
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

        <section className="instanceStudioLayout">
          <aside className="instanceStudioSidebar">
            <div className="instanceStudioSidebarCard instanceSummarySidebarCard">
              <div className="sidebarBackRow">
                <a className="back-btn backLink instanceTextBack" href={workReturnHref}>← {workReturnLabel}</a>
              </div>
              <div className="instanceSidebarSection">
                <strong>内容导航</strong>
                {showResultDetails ? <>
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
                </> : null}
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
                ) : isSimpleCopyWork ? (
                  <button
                    className={activeSection === "generated-content" ? "instanceNavButton active" : "instanceNavButton"}
                    onClick={() => jumpToSection("generated-content")}
                    type="button"
                  >
                    正文
                  </button>
                ) : (
                  batches.map((batch) => (
                    <button
                      className={activeBatch?.id === batch.id ? "instanceNavButton active" : "instanceNavButton"}
                      key={batch.id}
                      onClick={() => switchBatch(batch.id)}
                      type="button"
                    >
                      {formatBatchNavLabel(batch.label, batch.items.length, isStructuredCopyWork)}
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>

          <main className="instanceStudioMain">
            <section
              className="instanceSectionCard instanceInfoSectionCard"
              ref={(node) => { sectionRefs.current["run-info"] = node; }}
            >
              <div className="instanceSummaryTable">
                <div className="instanceSummaryRow">
                  <div className="instanceSummaryCell">
                    <span>标题</span>
                    <strong>{formatWorkTitle(work)}</strong>
                  </div>
                  <div className="instanceSummaryCell">
                    <span>状态</span>
                    <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
                  </div>
                </div>
                <div className="instanceSummaryRow">
                  <div className="instanceSummaryCell">
                    <span>创建时间</span>
                    <strong>{formatDate(work.created_at)}</strong>
                  </div>
                  <div className="instanceSummaryCell">
                    <span>输入内容</span>
                    <strong>{inputEntries.length > 0 ? "已填写" : "-"}</strong>
                  </div>
                </div>
                {isImageWork ? (
                  <div className="instanceSummaryRow instanceSummaryRowStack">
                    <div className="instanceSummaryCell instanceSummaryCellFull">
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
                    <div><span>{isPolishWork ? "优化方向" : "表达倾向"}</span><strong>{isVideoScriptPolishWork ? formatInputValue("goal", work.app_run?.input_payload?.goal) : isWechatArticlePolishWork ? formatInputValue("target", work.app_run?.input_payload?.target) : formatToneLabel(resolvedTone) || "-"}</strong></div>
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
                className={isStructuredCopyWork ? "instanceSectionCard instanceInputSectionCard writeCopyInputSectionCard" : isPolishWork ? "instanceSectionCard instanceInputSectionCard polishInputSectionCard" : "instanceSectionCard instanceInputSectionCard"}
                ref={(node) => { sectionRefs.current["input-info"] = node; }}
              >
                <div className="instanceSectionHeader">
                  <h2>{isStructuredCopyWork ? "实例信息" : "输入内容"}</h2>
                  <p>{isStructuredCopyWork ? "保留本次提交的创作素材、表达倾向和生成目标，刷新后仍可查看。" : isVideoScriptPolishWork ? "这里保留本次精修时提交的原始口播稿和优化方向，方便对照看改稿力度是否合适。" : isWechatArticlePolishWork ? "这里保留本次精修时提交的原始文章和优化方向，方便对照看长文结构是否真正被提起来。" : "展示本次生成时提交的原始信息。"}</p>
                </div>
                <div className="instanceInputStack compact">
                  {inputEntries.map(([key, value]) => (
                    <div className={isStructuredCopyWork ? "instanceInputCard writeCopyInputCard" : isPolishWork ? "instanceInputCard polishInputCard" : "instanceInputCard"} key={key}>
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
              className={isStructuredCopyWork ? "instanceSectionCard writeCopyResultSectionCard" : isSimpleCopyWork ? "instanceSectionCard simpleCopyResultSectionCard" : isPolishWork ? "instanceSectionCard polishResultSectionCard" : "instanceSectionCard"}
              ref={(node) => { sectionRefs.current["generated-content"] = node; }}
            >
              <div className="instanceSectionHeader instanceSectionHeaderSplit">
                <div>
                  <h2>{isImageWork ? "生成的图片" : isPolishWork ? "精修结果" : "生成内容"}</h2>
                  <p>{isImageWork ? "集中展示生成图片、下载和复制动作。" : isWriteCopyWork ? "按渠道分组展示口播稿、小红书、公众号和朋友圈结果。" : isSimpleCopyWork ? "完整正文集中展示，可直接复制或导出继续使用。" : isLeadCopyWork ? "按口播稿、小红书和公众号三个渠道展示 3 / 2 / 2 组引流成稿。" : isVideoScriptPolishWork ? "先看精修后的主稿，再看每一段是否更顺口、更好开口，保留复制和导出动作方便继续使用。" : isWechatArticlePolishWork ? "按长文阅读节奏展示精修结果，重点看标题、段落推进、语言质感和结尾互动是否更顺。" : "按内容结构顺序展示每一组生成结果。"}</p>
                </div>
                {isImageWork ? (
                  imageNotice ? <span className="instanceSaveHint">{imageNotice}</span> : null
                ) : (
                  streamState.connected && (isStructuredCopyWork || isSimpleCopyWork)
                    ? <span className="instanceSaveHint">内容生成中，正在持续回填结果...</span>
                    : saveMessage ? <span className="instanceSaveHint">{savingItemId ? "正在保存..." : saveMessage}</span> : null
                )}
              </div>

              {!isImageWork && streamState.error ? (
                <div className="imageModeNotice">{streamState.error}</div>
              ) : null}

              {isMalformedLeadCopyResult ? (
                <div className="imageModeNotice">这条作品没有生成可识别的口播稿、小红书和公众号结构，请返回“{formatAppLabel(work?.platform)}”重新创作。</div>
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
              ) : isSimpleCopyWork ? (
                <article className="instanceResultBlock active simpleCopyResultBlock" aria-live="polite">
                  <div className="instanceResultToolbar">
                    <div className="instanceResultToolbarTitle">
                      <strong>正文</strong>
                      <span>文本预览</span>
                    </div>
                    <div className="instanceResultActions">
                      <button
                        className="instanceActionButton"
                        disabled={!(streamState.content || work.content).trim()}
                        onClick={() => void handleCopy("simple-copy", streamState.content || work.content)}
                        type="button"
                      >
                        {copied["simple-copy"] ? "已复制" : "复制"}
                      </button>
                      <button
                        className="instanceActionButton"
                        disabled={!(streamState.content || work.content).trim()}
                        onClick={() => handleExport(formatWorkTitle(work), streamState.content || work.content)}
                        type="button"
                      >
                        导出Word
                      </button>
                    </div>
                  </div>
                  <div className="instancePlainResult simpleCopyResultBody" style={{ fontSize: `${fontScale}%` }}>
                    {streamState.content || work.content || (work.app_run?.status === "running" ? "内容生成中..." : "本次生成暂未返回正文。")}
                  </div>
                </article>
              ) : hasRenderableBatches ? (
                <div className={isStructuredCopyWork ? "instanceBatchStack writeCopyBatchStack" : isPolishWork ? "instanceBatchStack polishBatchStack" : "instanceBatchStack"} style={{ fontSize: `${fontScale}%` }}>
                  {(isStructuredCopyWork || isPolishWork ? batches.filter((batch) => batch.id === resolvedBatchId) : batches).map((batch) => (
                    <section
                      className={isStructuredCopyWork ? "instanceBatchGroup writeCopyBatchGroup" : isPolishWork ? "instanceBatchGroup polishBatchGroup" : "instanceBatchGroup"}
                      key={batch.id}
                      ref={(node) => { sectionRefs.current[batch.id] = node; }}
                    >
                      <div className="instanceBatchHeaderRow">
                        <div className="instanceBatchHeading">{formatBatchHeading(batch.label, batch.items.length, isStructuredCopyWork)}</div>
                        <span className="instanceBatchCount">{batch.items.length} 条</span>
                      </div>
                      <div className={isStructuredCopyWork ? "instanceBatchItemTabs writeCopyBatchItemTabs subtle" : isPolishWork ? "instanceBatchItemTabs polishBatchItemTabs subtle" : "instanceBatchItemTabs subtle"}>
                        {batch.items.map((item) => (
                          <button
                            className={[
                              isStructuredCopyWork ? "instanceItemTab writeCopyItemTab" : isPolishWork ? "instanceItemTab polishItemTab" : "instanceItemTab",
                              getActiveItemId(batch) === item.id ? "active" : "",
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
                        const activeItem = batch.items.find((item) => item.id === getActiveItemId(batch)) ?? batch.items[0];
                        if (!activeItem) {
                          return (
                            <div className="instancePlainResult">
                              <div className="instancePreviewPlain">这一组内容还在生成中，结果会在这里持续回填。</div>
                            </div>
                          );
                        }
                        return (
                          <ResultBlock
                            copied={Boolean(copied[activeItem.id])}
                            isWriteCopy={isStructuredCopyWork}
                            item={activeItem}
                            key={activeItem.id}
                            onCopy={() => void handleCopy(activeItem.id, getEditableBody(activeItem, xhsDrafts))}
                            onExport={() => handleExport(activeItem.title, getEditableBody(activeItem, xhsDrafts), {
                              viewMode: activeItem.viewMode,
                              theme: wechatThemes[activeItem.id] ?? "default",
                            })}
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
                  <MarkdownContent content={plainResultContent} />
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

function ResultWorkspaceBar({
  detailsOpen,
  onToggleDetails,
  work,
  returnHref,
  returnLabel,
  title,
  primaryHref,
  primaryLabel = "再次创作",
}: {
  detailsOpen: boolean;
  onToggleDetails: () => void;
  work: WorkDetail;
  returnHref?: string;
  returnLabel?: string;
  title?: string;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  return (
    <header className="resultWorkspaceBar">
      <a className="resultWorkspaceBack" href={returnHref || appPath("/drafts")} aria-label={returnLabel || "返回创作历史"}>←</a>
      <div className="resultWorkspaceIdentity">
        <span>{formatAppLabel(work.platform)}</span>
        <h1>{title || formatWorkTitle(work)}</h1>
      </div>
      <div className="resultWorkspaceStatus">
        <span className={work.app_run?.status === "succeeded" ? "complete" : ""} />
        <strong>{work.app_run?.status === "succeeded" ? "已完成" : formatStatusLabel(work.status)}</strong>
        <time dateTime={work.updated_at}>{formatDate(work.updated_at)}</time>
      </div>
      <button className={detailsOpen ? "resultWorkspaceDetails active" : "resultWorkspaceDetails"} onClick={onToggleDetails} type="button">
        {detailsOpen ? "收起参数" : "生成参数"}
      </button>
      <a className="resultWorkspacePrimary" href={primaryHref || appPath(`/apps/${work.platform}?from=result`)}>{primaryLabel}</a>
    </header>
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
  const copyLabel = item.viewMode === "wechat"
    ? copied ? "公众号格式已复制" : "复制公众号格式"
    : copied ? "已复制" : "复制";
  const xhsStats = item.viewMode === "xiaohongshu" ? analyzeXhsDraft(xhsDraft) : null;
  const hasMeaningfulContent = editableBody.replace(/\s+/g, "").trim().length > 0;

  const handleWechatCopy = async () => {
    if (item.viewMode !== "wechat") {
      onCopy();
      return;
    }
    const success = await copyWechatRichText(editableBody, theme);
    if (success) {
      onCopy();
      return;
    }
    onCopy();
  };

  if (item.viewMode === "wechat") {
    return (
      <article className={isWriteCopy ? "instanceResultBlock active wechat writeCopyResultBlock" : "instanceResultBlock active wechat"} id={`instance-item-${item.id}`}>
        <div className="instanceResultToolbar">
          <div className="instanceResultToolbarTitle">
            <strong>{item.title}</strong>
            <span>公众号预览</span>
          </div>
          <div className="instanceResultActions">
            <button className="instanceActionButton" onClick={() => void handleWechatCopy()} type="button">{copyLabel}</button>
            <button className="instanceActionButton" onClick={onExport} type="button">导出Word</button>
          </div>
        </div>
        <div className="instancePlainResult">
          <MarkdownContent content={editableBody} />
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
            <button className="instanceActionButton" disabled={!hasMeaningfulContent} onClick={onCopy} type="button">{copied ? "已复制" : "复制"}</button>
            <button className="instanceActionButton" disabled={!hasMeaningfulContent} onClick={onExport} type="button">导出Word</button>
          </div>
        </div>
        <div className={isWriteCopy ? "instanceXhsShell readOnly" : "instanceXhsShell"}>
          <div className={`instanceXhsPreview ${isWriteCopy ? "readOnly" : ""} template-${xhsTemplate} font-${xhsFontSize} ${xhsFormat === "image" ? "is-image" : ""}`}>
            {hasMeaningfulContent ? (
              <MarkdownContent content={xhsDraft} />
            ) : (
              <div className="instancePreviewPlain">这一版内容还没有成功生成，建议重新生成或切换到其他版本。</div>
            )}
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

type VideoPolishReportSectionData = {
  id: string;
  title: string;
  body: string;
  kind: "persona" | "diagnosis" | "line-edit" | "method" | "final" | "titles" | "plain";
};

type XiaohongshuCheckAmendment = {
  original: string;
  revision: string;
  reason: string;
};

type XiaohongshuCheckReport = {
  disclaimer: string;
  riskLevel: string;
  articleNature: string;
  riskOverview: string;
  revisedBody: string;
  amendments: XiaohongshuCheckAmendment[];
};

function VideoPolishReportSection({
  section,
  registerSection,
}: {
  section: VideoPolishReportSectionData;
  registerSection: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      className={`videoPolishEmbeddedSection videoPolishReportSection section-${section.kind}`}
      id={section.id}
      ref={registerSection}
    >
      <div className="creationExampleBlockHeader videoPolishSectionHeader">
        <div className="creationExampleBlockTitle">
          <span className="creationExampleDocIcon" aria-hidden="true">{getVideoPolishSectionIcon(section.kind)}</span>
          <h2>{section.title}</h2>
        </div>
      </div>
      <div className="creationExampleBlockBody">
        {renderVideoPolishSectionBody(section)}
      </div>
    </div>
  );
}

function renderVideoPolishSectionBody(section: VideoPolishReportSectionData) {
  if (section.kind === "diagnosis") {
    const rows = parseDiagnosisRows(section.body);
    if (rows.length > 0) {
      return (
        <div className="videoPolishDiagnosisTable">
          <div className="videoPolishDiagnosisHeader">
            <span>关键指标</span>
            <span>现状</span>
            <span>建议值</span>
            <span>具体分析</span>
          </div>
          {rows.map((row) => (
            <div className="videoPolishDiagnosisRow" key={row.metric}>
              <strong>{row.metric}</strong>
              <span>{row.current}</span>
              <span>{row.target}</span>
              <p>{row.analysis}</p>
            </div>
          ))}
        </div>
      );
    }
  }

  if (section.kind === "line-edit") {
    const cards = parseLineEditCards(section.body);
    if (cards.length > 0) {
      return (
        <div className="videoPolishLineEditStack">
          {cards.map((card, index) => (
            <article className="videoPolishLineEditCard" key={`${card.original}-${index}`}>
              {card.original ? (
                <div>
                  <strong>原文</strong>
                  <p>{card.original}</p>
                </div>
              ) : null}
              {card.problem ? (
                <div>
                  <strong>问题</strong>
                  <MarkdownContent content={card.problem} />
                </div>
              ) : null}
              {card.revision ? (
                <div>
                  <strong>修改</strong>
                  <MarkdownContent content={card.revision} />
                </div>
              ) : null}
              {card.principle ? (
                <div>
                  <strong>原理</strong>
                  <MarkdownContent content={card.principle} />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      );
    }
  }

  return <MarkdownContent content={section.body} />;
}

function parseXiaohongshuCheckReport(content: string): XiaohongshuCheckReport | null {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;

  const revisedHeading = normalized.match(/(?:^|\n)\s*【修改后正文】\s*(?:\n|$)/);
  const amendmentsHeading = normalized.match(/(?:^|\n)\s*【改动说明】\s*(?:\n|$)/);
  if (!revisedHeading?.index || !amendmentsHeading?.index || amendmentsHeading.index <= revisedHeading.index) return null;

  const summary = normalized.slice(0, revisedHeading.index).trim();
  const revisedStart = revisedHeading.index + revisedHeading[0].length;
  const revisedBody = normalized.slice(revisedStart, amendmentsHeading.index).trim();
  const amendmentsBody = normalized.slice(amendmentsHeading.index + amendmentsHeading[0].length).trim();
  const riskLevel = getReportField(summary, "风险等级");
  const articleNature = getReportField(summary, "文章性质");
  const riskOverview = getReportField(summary, "风险概览");
  const disclaimer = summary
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("⚠️") || line.includes("合规 ≠ 流量保证")) ?? "";
  const amendments = parseXiaohongshuCheckAmendments(amendmentsBody);

  if (!riskLevel || !articleNature || !riskOverview || !revisedBody || amendments.length === 0) return null;
  return { disclaimer, riskLevel, articleNature, riskOverview, revisedBody, amendments };
}

function getReportField(content: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`(?:^|\n)\s*${escapedLabel}\s*[:：]\s*([^\n]+)`));
  return match?.[1]?.trim() ?? "";
}

function parseXiaohongshuCheckAmendments(content: string): XiaohongshuCheckAmendment[] {
  const blockRegex = /原文\s*[:：]\s*[「“"]([\s\S]*?)[」”"]\s*(?:→|->|改为)\s*(?:改为\s*[:：]\s*)?[「“"]([\s\S]*?)[」”"]\s*(?:\n|\s)*原因\s*[:：]\s*([\s\S]*?)(?=(?:\n\s*)?原文\s*[:：]|$)/g;
  return Array.from(content.matchAll(blockRegex))
    .map((match) => ({
      original: match[1].trim(),
      revision: match[2].trim(),
      reason: match[3].trim(),
    }))
    .filter((item) => item.original && item.revision && item.reason);
}

function getXiaohongshuRiskClass(riskLevel: string) {
  if (riskLevel.includes("高")) return "risk-high";
  if (riskLevel.includes("低")) return "risk-low";
  return "risk-medium";
}

function parseVideoPolishReportSections(content: string): VideoPolishReportSectionData[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const headingRegex = /(?:^|\n)\s*(?:\d+[）)]\s*)?【(.+?)】\s*\n/g;
  const matches = Array.from(normalized.matchAll(headingRegex));
  if (matches.length === 0) return [];

  return matches
    .map((match, index) => {
      const title = normalizeVideoPolishTitle(match[1]);
      const start = (match.index ?? 0) + match[0].length;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
      return {
        id: `video-polish-report-${index + 1}`,
        title,
        body: normalized.slice(start, end).trim(),
        kind: inferVideoPolishSectionKind(title),
      };
    })
    .filter((section) => section.body.length > 0);
}

function normalizeVideoPolishTitle(title: string) {
  return title.replace(/^\s*\d+[）)]\s*/, "").trim();
}

function inferVideoPolishSectionKind(title: string): VideoPolishReportSectionData["kind"] {
  if (title.includes("博主风格画像")) return "persona";
  if (title.includes("整体诊断")) return "diagnosis";
  if (title.includes("逐句")) return "line-edit";
  if (title.includes("系统提升")) return "method";
  if (title.includes("完善后的文案")) return "final";
  if (title.includes("推荐标题")) return "titles";
  return "plain";
}

function getVideoPolishSectionIcon(kind: VideoPolishReportSectionData["kind"]) {
  if (kind === "diagnosis") return "📊";
  if (kind === "line-edit") return "✏️";
  if (kind === "method") return "🧭";
  if (kind === "final") return "🪄";
  if (kind === "titles") return "🏷️";
  return "📋";
}

function parseDiagnosisRows(body: string) {
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const rows: Array<{ metric: string; current: string; target: string; analysis: string }> = [];
  let current: { metric: string; current: string; target: string; analysis: string } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/^[-*•]\s*/, "").trim();
    const metricMatch = line.match(/^([^：:]{2,18})\s*$/);
    const currentMatch = line.match(/^现状[:：]\s*(.+)$/);
    const targetMatch = line.match(/^建议值[:：]\s*(.+)$/);
    const analysisMatch = line.match(/^具体分析[:：]\s*(.+)$/);

    if (metricMatch && /钩子|逻辑|情感|行动|金句|完播|专业|术语/.test(metricMatch[1])) {
      if (current) rows.push(current);
      current = { metric: metricMatch[1], current: "", target: "", analysis: "" };
      continue;
    }

    if (!current) continue;
    if (currentMatch) current.current = currentMatch[1];
    else if (targetMatch) current.target = targetMatch[1];
    else if (analysisMatch) current.analysis = analysisMatch[1];
    else current.analysis = [current.analysis, line].filter(Boolean).join(" ");
  }

  if (current) rows.push(current);
  return rows.filter((row) => row.metric && (row.current || row.target || row.analysis));
}

function parseLineEditCards(body: string) {
  const blocks = body
    .split(/\n(?=原文|• 原文)/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const original = readLabeledBlock(block, ["原文"]);
    return {
      original: original.replace(/^["“]|["”]$/g, ""),
      problem: readLabeledBlock(block, ["问题"]),
      revision: readLabeledBlock(block, ["修改", "建议改", "建议改法"]),
      principle: readLabeledBlock(block, ["原理"]),
    };
  }).filter((card) => card.original || card.problem || card.revision || card.principle);
}

function readLabeledBlock(block: string, labels: string[]) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(?:^|\\n)\\s*(?:[-*•]\\s*)?(?:${escaped})\\s*[:：]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:[-*•]\\s*)?(?:原文|问题|修改|建议改|建议改法|原理)\\s*[:：]?|$)`);
  return block.match(regex)?.[1]?.trim() ?? "";
}

function PolishReportContent({ content }: { content: string }) {
  const sections = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="polishReportContent">
      {sections.map((section, index) => {
        if (section.startsWith("❌")) {
          return <ReportCallout key={`report-${index}`} tone="problem" title="问题" body={section.replace(/^❌\s*/, "")} />;
        }

        if (section.startsWith("✅")) {
          return <ReportCallout key={`report-${index}`} tone="solution" title="建议改法" body={section.replace(/^✅\s*/, "")} />;
        }

        if (section.startsWith("💡")) {
          return <ReportCallout key={`report-${index}`} tone="insight" title="原理说明" body={section.replace(/^💡\s*/, "")} />;
        }

        if (/^标题建议[:：]/.test(section) || /^标签建议[:：]/.test(section)) {
          const [heading, ...rest] = section.split("\n");
          return (
            <article className="polishReportListCard" key={`report-${index}`}>
              <strong>{heading}</strong>
              <div className="polishReportListBody">
                <MarkdownContent content={rest.join("\n")} />
              </div>
            </article>
          );
        }

        if (/^[1-9]\d*[.、]/.test(section)) {
          return (
            <article className="polishReportListCard" key={`report-${index}`}>
              <div className="polishReportListBody">
                <MarkdownContent content={section} />
              </div>
            </article>
          );
        }

        return (
          <article className="polishReportParagraphCard" key={`report-${index}`}>
            <MarkdownContent content={section} />
          </article>
        );
      })}
    </div>
  );
}

function ReportCallout({
  tone,
  title,
  body,
}: {
  tone: "problem" | "solution" | "insight";
  title: string;
  body: string;
}) {
  return (
    <article className={`polishReportCallout ${tone}`}>
      <div className="polishReportCalloutHeader">
        <strong>{title}</strong>
      </div>
      <div className="polishReportCalloutBody">
        <MarkdownContent content={body} />
      </div>
    </article>
  );
}

type ArticleBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "quote"; text: string }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "paragraph"; text: string };

type ArticleHeadingBlock = { type: "heading"; level: 1 | 2 | 3; text: string };

function WechatArticlePreview({ content, theme }: { content: string; theme: WechatTheme }) {
  const blocks = parseWechatArticleBlocks(content);
  const titleBlock = blocks.find((block): block is ArticleHeadingBlock => block.type === "heading" && block.level === 1);
  const bodyBlocks = titleBlock ? blocks.filter((block, index) => index !== blocks.indexOf(titleBlock)) : blocks;

  if (bodyBlocks.length === 0 && !titleBlock) {
    return <div className="markdownMessage">{renderMarkdown(content)}</div>;
  }

  if (theme === "editorial") {
    return <EditorialWechatPreview titleBlock={titleBlock} blocks={bodyBlocks} />;
  }

  if (theme === "forest") {
    return <ForestWechatPreview titleBlock={titleBlock} blocks={bodyBlocks} />;
  }

  return <div className="markdownMessage">{renderMarkdown(content)}</div>;
}

function EditorialWechatPreview({ titleBlock, blocks }: { titleBlock?: ArticleHeadingBlock; blocks: ArticleBlock[] }) {
  return (
    <div className="wechatArticleLayout wechatArticleLayout-editorial">
      {titleBlock ? (
        <header className="wechatArticleHero wechatArticleHero-editorial">
          <span className="wechatArticleKicker">INSIGHT NOTE</span>
          <h1>{renderInlineMarkdown(titleBlock.text)}</h1>
        </header>
      ) : null}
      <div className="wechatArticleFlow wechatArticleFlow-editorial">
        {renderWechatArticleBlocks(blocks, "editorial")}
      </div>
    </div>
  );
}

function ForestWechatPreview({ titleBlock, blocks }: { titleBlock?: ArticleHeadingBlock; blocks: ArticleBlock[] }) {
  return (
    <div className="wechatArticleLayout wechatArticleLayout-forest">
      {titleBlock ? (
        <header className="wechatArticleHero wechatArticleHero-forest">
          <span className="wechatArticleKicker">深度判断</span>
          <h1>{renderInlineMarkdown(titleBlock.text)}</h1>
        </header>
      ) : null}
      <div className="wechatArticleFlow wechatArticleFlow-forest">
        {renderWechatArticleBlocks(blocks, "forest")}
      </div>
    </div>
  );
}

function renderWechatArticleBlocks(blocks: ArticleBlock[], variant: "editorial" | "forest") {
  return blocks.map((block, index) => {
    if (block.type === "heading") {
      const Tag = block.level === 2 ? "h2" : "h3";
      return <Tag className={`wechatArticleSectionTitle wechatArticleSectionTitle-${variant}`} key={`${block.type}-${index}`}>{renderInlineMarkdown(block.text)}</Tag>;
    }

    if (block.type === "quote") {
      return <blockquote className={`wechatArticleQuote wechatArticleQuote-${variant}`} key={`${block.type}-${index}`}>{renderInlineMarkdown(block.text)}</blockquote>;
    }

    if (block.type === "list") {
      return (
        <div className={`wechatArticleList wechatArticleList-${variant}`} key={`${block.type}-${index}`}>
          {block.items.map((item, itemIndex) => (
            <div className="wechatArticleListItem" key={`${index}-${itemIndex}`}>
              <span>{block.ordered ? `${itemIndex + 1}.` : "•"}</span>
              <div>{renderInlineMarkdown(item)}</div>
            </div>
          ))}
        </div>
      );
    }

    return <p className={`wechatArticleParagraph wechatArticleParagraph-${variant}`} key={`${block.type}-${index}`}>{renderInlineMarkdown(block.text)}</p>;
  });
}

function parseWechatArticleBlocks(content: string): ArticleBlock[] {
  const lines = content.split("\n");
  const blocks: ArticleBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    const text = paragraphLines.join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: "list", items: [...listItems], ordered: listOrdered });
      listItems = [];
      listOrdered = false;
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        level: Math.min(headingMatch[1].length, 3) as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: quoteMatch[1].trim() });
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)[.、]\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listItems.length === 0) listOrdered = true;
      listItems.push(orderedMatch[2].trim());
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listItems.length === 0) listOrdered = false;
      listItems.push(unorderedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
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
        <Tag className={`markdownHeading markdownHeading-level-${level}`} key={`heading-${index}`}>
          {renderInlineMarkdown(headingMatch[2])}
        </Tag>
      );
    }

    const quoteMatch = trimmed.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      return (
        <blockquote className="markdownQuote" key={`quote-${index}`}>
          {renderInlineMarkdown(quoteMatch[1])}
        </blockquote>
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

function isVideoScriptPolishReportItem(item: CreationOutputItem) {
  return ["逐句精细批改", "系统提升方法论", "推荐标题 + 标签"].includes(item.title);
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

async function copyWechatRichText(content: string, theme: WechatTheme) {
  const html = buildWechatRichHtml(content, theme);
  if (!html) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard && typeof ClipboardItem !== "undefined" && window.isSecureContext) {
    try {
      const plainText = stripHtmlTags(html);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return true;
    } catch {
      // fall through
    }
  }

  try {
    const listener = (event: ClipboardEvent) => {
      event.preventDefault();
      event.clipboardData?.setData("text/html", html);
      event.clipboardData?.setData("text/plain", stripHtmlTags(html));
    };
    document.addEventListener("copy", listener, { once: true });
    const copied = document.execCommand("copy");
    document.removeEventListener("copy", listener);
    return copied;
  } catch {
    return false;
  }
}

function buildWechatRichHtml(content: string, theme: WechatTheme) {
  const blocks = parseWechatArticleBlocks(content);
  if (blocks.length === 0) return "";

  const titleBlock = blocks.find((block): block is ArticleHeadingBlock => block.type === "heading" && block.level === 1);
  const bodyBlocks = titleBlock ? blocks.filter((block, index) => index !== blocks.indexOf(titleBlock)) : blocks;

  const palette = theme === "forest"
    ? { title: "#ecfdf5", text: "#ecfdf5", heading: "#d1fae5", quoteBg: "rgba(16,185,129,0.14)", quoteBorder: "#34d399", surface: "#0f2f2a" }
    : theme === "editorial"
      ? { title: "#1f1a14", text: "#32281f", heading: "#2b241c", quoteBg: "rgba(120,113,108,0.08)", quoteBorder: "#78716c", surface: "#fffdf9" }
      : theme === "warm"
        ? { title: "#7c2d12", text: "#4b2d1f", heading: "#9a3412", quoteBg: "rgba(251,146,60,0.08)", quoteBorder: "#fb923c", surface: "#fffaf4" }
        : { title: "#1f2937", text: "#334155", heading: "#1d4ed8", quoteBg: "rgba(59,130,246,0.07)", quoteBorder: "#60a5fa", surface: "#f8fbff" };

  const bodyHtml = bodyBlocks.map((block) => {
    if (block.type === "heading") {
      const tag = block.level === 2 ? "h2" : "h3";
      return `<${tag} style="margin:24px 0 8px;color:${palette.heading};line-height:1.5;">${escapeHtml(block.text)}</${tag}>`;
    }
    if (block.type === "quote") {
      return `<blockquote style="margin:18px 0;padding:14px 16px;border-left:4px solid ${palette.quoteBorder};background:${palette.quoteBg};color:${palette.text};border-radius:12px;line-height:1.9;">${escapeHtml(block.text)}</blockquote>`;
    }
    if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items.map((item) => `<li style="margin:8px 0;">${escapeHtml(item)}</li>`).join("");
      return `<${tag} style="margin:12px 0 12px 22px;color:${palette.text};line-height:1.9;">${items}</${tag}>`;
    }
    return `<p style="margin:12px 0;color:${palette.text};line-height:1.95;">${escapeHtml(block.text)}</p>`;
  }).join("");

  const titleHtml = titleBlock
    ? `<h1 style="margin:0 0 18px;color:${palette.title};line-height:1.3;font-size:28px;">${escapeHtml(titleBlock.text)}</h1>`
    : "";

  return `<section style="background:${palette.surface};padding:24px 22px;border-radius:18px;">${titleHtml}${bodyHtml}</section>`;
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function exportWord(title: string, body: string, options?: { viewMode?: CreationOutputViewMode; theme?: WechatTheme }) {
  const html = buildWordDocumentHtml(title, body, options);
  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(title)}.doc`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildWordDocumentHtml(title: string, body: string, options?: { viewMode?: CreationOutputViewMode; theme?: WechatTheme }) {
  const articleHtml = options?.viewMode === "wechat"
    ? buildWechatRichHtml(body, options?.theme ?? "default")
    : buildGenericRichHtml(title, body);

  return `<!DOCTYPE html>
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <meta name="ProgId" content="Word.Document" />
    <meta name="Generator" content="Codex" />
    <meta name="Originator" content="Codex" />
    <style>
      body { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #1f2937; margin: 28px; line-height: 1.85; }
      h1 { font-size: 28px; line-height: 1.3; margin: 0 0 20px; }
      h2 { font-size: 22px; line-height: 1.4; margin: 26px 0 12px; }
      h3 { font-size: 18px; line-height: 1.45; margin: 22px 0 10px; }
      p { margin: 12px 0; }
      blockquote { margin: 18px 0; padding: 14px 16px; border-left: 4px solid #d97706; background: #fff7ed; }
      ul, ol { margin: 12px 0 12px 24px; }
      li { margin: 8px 0; }
    </style>
  </head>
  <body>${articleHtml}</body>
  </html>`;
}

function buildGenericRichHtml(title: string, body: string) {
  const lines = body.split("\n").map((line) => line.trimEnd());
  const parts = [`<h1>${escapeHtml(title)}</h1>`];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      parts.push("<p>&nbsp;</p>");
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length + 1, 3);
      parts.push(`<h${level}>${escapeHtml(headingMatch[2])}</h${level}>`);
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s+(.+)$/);
    if (quoteMatch) {
      parts.push(`<blockquote>${escapeHtml(quoteMatch[1])}</blockquote>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      parts.push(`<ul><li>${escapeHtml(unorderedMatch[1])}</li></ul>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)[.、]\s+(.+)$/);
    if (orderedMatch) {
      parts.push(`<ol><li>${escapeHtml(orderedMatch[2])}</li></ol>`);
      continue;
    }

    parts.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  return parts.join("");
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

type TopicPickerSection = {
  id: string;
  title: string;
  body: string;
};

function parseTopicPickerSections(content: string): TopicPickerSection[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const matches = Array.from(normalized.matchAll(/【([一二三四]、[^】]+)】/g));
  if (matches.length === 0) return [];

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length;
    const title = `【${match[1]}】`;
    return {
      id: getTopicPickerSectionId(title, index),
      title,
      body: normalized.slice(start, end).trim(),
    };
  }).filter((section) => section.body.trim().length > 0);
}

function buildTopicPickerFallbackSections(content: string): TopicPickerSection[] {
  if (!content.trim()) return [];
  return [{ id: "topic-picker-result", title: "生成结果", body: content }];
}

function getTopicPickerSectionId(title: string, index: number) {
  if (title.includes("人设提炼")) return "topic-picker-persona";
  if (title.includes("选题列表")) return "topic-picker-list";
  if (title.includes("选题使用方法")) return "topic-picker-usage";
  if (title.includes("选题详细指导")) return "topic-picker-guide";
  return `topic-picker-section-${index + 1}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "batch";
}

function readCreationOutputBatches(value: unknown): CreationOutputBatch[] {
  if (!value || typeof value !== "object") return [];
  const batches = (value as { batches?: unknown }).batches;
  if (!Array.isArray(batches)) return [];

  return batches.flatMap((candidate, batchIndex) => {
    if (!candidate || typeof candidate !== "object") return [];
    const batch = candidate as { id?: unknown; label?: unknown; items?: unknown };
    const label = typeof batch.label === "string" && batch.label.trim()
      ? batch.label.trim()
      : `生成内容 ${batchIndex + 1}`;
    const rawItems = Array.isArray(batch.items) ? batch.items : [];
    const items = rawItems.flatMap((rawItem, itemIndex) => {
      if (!rawItem || typeof rawItem !== "object") return [];
      const item = rawItem as {
        id?: unknown;
        title?: unknown;
        body?: unknown;
        viewMode?: unknown;
        summary?: unknown;
      };
      if (typeof item.body !== "string") return [];
      const viewMode: CreationOutputViewMode = item.viewMode === "wechat" || item.viewMode === "xiaohongshu"
        ? item.viewMode
        : "plain";
      return [{
        id: typeof item.id === "string" && item.id ? item.id : `${slugify(label)}-${batchIndex + 1}-${itemIndex + 1}`,
        title: typeof item.title === "string" && item.title.trim() ? item.title : `${label} ${itemIndex + 1}`,
        body: item.body,
        viewMode,
        summary: typeof item.summary === "string" ? item.summary : inferSummary(item.body),
      } satisfies CreationOutputItem];
    });

    return [{
      id: typeof batch.id === "string" && batch.id ? batch.id : `${slugify(label)}-${batchIndex + 1}`,
      label,
      items,
    } satisfies CreationOutputBatch];
  });
}

function hasRenderableBatch(batch: CreationOutputBatch) {
  return batch.items.some((item) => item.body.trim().length > 0);
}

function chooseBatchSource(sources: CreationOutputBatch[][]) {
  return sources.find((source) => source.some(hasRenderableBatch))
    ?? sources.find((source) => source.length > 0)
    ?? [];
}

function choosePreferredBatch(batches: CreationOutputBatch[], platform?: string | null) {
  const populatedBatches = batches.filter(hasRenderableBatch);
  if (platform === "write-copy" || platform === "lead-copy") {
    const oralBatch = populatedBatches.find((batch) => batch.label.includes("口播"));
    if (oralBatch) return oralBatch;
  }
  return populatedBatches[0] ?? batches[0] ?? null;
}

function buildExpectedWriteCopyBatches(targetChannels: string[]) {
  const labels = targetChannels
    .map((channel) => {
      if (channel === "video_script" || channel === "video_batch") return "口播稿";
      if (channel === "redbook_batch" || channel === "xiaohongshu") return "小红书";
      if (channel === "wechat_batch" || channel === "wechat_article") return "公众号";
      if (channel === "moments") return "朋友圈";
      return "";
    })
    .filter(Boolean);

  return labels.map((label, index) => ({
    id: `expected-${slugify(label)}-${index + 1}`,
    label,
    items: [],
  })) satisfies CreationOutputBatch[];
}

function isLeadCopyBatch(batch: CreationOutputBatch) {
  return batch.label === "口播稿" || batch.label === "小红书" || batch.label === "公众号";
}

function isMultiChannelCopyPlatform(platform?: string | null) {
  return platform === "lead-copy" || platform === "traffic-copy" || platform === "marketing-copy";
}

function supportsWorkStreaming(platform: string) {
  return new Set([
    "write-copy",
    "lead-copy",
    "traffic-copy",
    "marketing-copy",
    "general-content",
    "image-card",
    "wechat-images",
    "policy-renewal-card",
    "video-script-polish",
    "xiaohongshu-check",
    "topic-picker",
    "letter",
  ]).has(platform);
}

function mergeStreamedBatches(baseBatches: CreationOutputBatch[], streamedBatches: CreationOutputBatch[]) {
  if (baseBatches.length === 0) return streamedBatches;
  if (streamedBatches.length === 0) return baseBatches;

  const streamedByLabel = new Map(streamedBatches.map((batch) => [batch.label, batch]));
  const merged = baseBatches.map((batch) => streamedByLabel.get(batch.label) ?? batch);
  const mergedLabels = new Set(merged.map((batch) => batch.label));
  const extras = streamedBatches.filter((batch) => !mergedLabels.has(batch.label));
  return [...merged, ...extras];
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
  if (key === "content") return "小红书内容";
  if (key === "followup_notes") return "候选人沟通录音稿";
  if (key === "resume") return "候选人简历";
  if (key === "tone") return "表达倾向";
  if (key === "source") return "创作素材";
  if (key === "draft") return "现有口播稿";
  if (key === "goal") return "重点优化";
  if (key === "article") return "文章内容";
  if (key === "target") return "希望重点优化";
  if (key === "targets") return "创作内容";
  if (key === "theme") return "选题主题";
  if (key === "platform") return "发布平台";
  if (key === "focus") return "选题方向";
  if (key === "extra") return "补充情况";
  if (key === "special_requirements") return "特殊要求";
  if (key === "style") return "图片风格";
  if (key === "draw_portrait") return "是否画我的形象";
  if (key === "ratio") return "宽高比";
  if (key === "signature") return "签名";
  if (key === "reference_image") return "参考图";
  if (key === "customer_salutation") return "客户称呼";
  if (key === "insurer") return "保险公司";
  if (key === "product_name") return "产品名称";
  if (key === "policy_number") return "保单号";
  if (key === "renewal_date") return "续费日期";
  if (key === "premium_amount") return "本期保费";
  if (key === "currency") return "币种";
  if (key === "privacy_mode") return "保单号展示";
  if (key === "advisor_name") return "顾问姓名";
  if (key === "advisor_company") return "公司或团队";
  if (key === "contact_text") return "联系提示";
  if (key === "confirmation") return "信息确认";
  if (key === "portrait_treatment") return "头像处理";
  if (key === "avatar_visual_asset_ids") return "数字分身形象";
  if (key === "avatar_visual_mode") return "人物形象模式";
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
  if (key === "platform" && typeof value === "string") return formatTopicPlatformLabel(value);
  if (key === "focus" && Array.isArray(value)) return formatTopicFocusLabels(value.map(String));
  if (key === "focus" && typeof value === "string") return formatTopicFocusLabels([value]);
  if (key === "draw_portrait" && typeof value === "string") return value === "yes" ? "是，我已上传形象照" : "否，不要画人物形象";
  if (key === "ratio" && typeof value === "string") return formatRatioLabel(value);
  if (key === "style" && typeof value === "string") return formatImageStyleLabel(value);
  if (key === "reference_image" && typeof value === "string") return value ? "已上传参考图" : "-";
  if (key === "privacy_mode" && typeof value === "string") return value === "full" ? "显示完整号码" : "自动脱敏";
  if (key === "confirmation" && typeof value === "string") return value === "confirmed" ? "已核对关键信息" : "未确认";
  if (key === "portrait_treatment" && typeof value === "string") return value === "original" ? "保留清晰原照" : "柔和手绘感";
  if (key === "avatar_visual_asset_ids" && Array.isArray(value)) return value.length ? `使用 ${value.length} 张形象照` : "未使用";
  if (key === "avatar_visual_mode" && typeof value === "string") return value === "yes" ? "使用数字分身形象" : "不使用人物形象";
  if (key === "angle" && typeof value === "string") return formatLeadAngleLabel(value);
  if (key === "cta" && typeof value === "string") return formatLeadCtaLabel(value);
  if (Array.isArray(value)) return value.map(String).join(" / ");
  return String(value ?? "-");
}

function stringifySingleInputValue(value: unknown) {
  if (typeof value === "string") return value.trim() || "-";
  if (Array.isArray(value)) return value.map(String).join(" / ") || "-";
  return String(value ?? "-");
}

function formatToneLabel(value?: string | null) {
  if (value === "sharp_insight") return "犀利洞察";
  if (value === "gentle_empathy") return "温和共鸣";
  if (value === "analogy_thinking") return "类比思维";
  if (value === "raw_restore") return "原汁原味（还原整理）";
  if (value === "professional_direct") return "专业直接";
  if (value === "warm_trust") return "温和可信";
  if (value === "scenario_analogy") return "场景类比";
  if (value === "material_faithful") return "忠于素材";
  if (value === "traffic") return "偏犀利";
  if (value === "trust") return "偏稳重";
  if (value === "raw") return "尽量保留原意";
  if (value === "self") return "更像自己";
  return value ?? "";
}

function formatChannelLabels(values: string[]) {
  return values
    .map((value) => {
      if (value === "letter") return "一封信";
      if (value === "tracker") return "跟踪表";
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
  if (value === "wechat-images") return "公众号配图";
  if (value === "policy-renewal-card") return "保单续保提醒卡";
  if (value === "lead-copy") return "写引流文案";
  if (value === "traffic-copy") return "流量文案";
  if (value === "marketing-copy") return "营销文案";
  if (value === "video-script-polish") return "口播文案精修";
  if (value === "wechat-article-polish") return "公众号文章精修";
  if (value === "topic-picker") return "找选题";
  if (value === "xiaohongshu-check") return "小红书违规检测";
  return value ?? "";
}

function formatTopicPlatformLabel(value?: string | null) {
  if (value === "wechat_video") return "视频号";
  if (value === "xiaohongshu") return "小红书";
  if (value === "wechat_article") return "公众号";
  if (value === "mixed") return "混合使用";
  return value ?? "-";
}

function formatTopicFocusLabels(values: string[]) {
  return values
    .map((value) => {
      if (value === "traffic") return "流量选题";
      if (value === "trust") return "信任选题";
      if (value === "conversion") return "引流选题";
      return value;
    })
    .join(" / ");
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

  if (work.platform === "image-card" || work.platform === "wechat-images" || work.platform === "policy-renewal-card") {
    return buildImageWorkMeta(work).title;
  }

  if (isMultiChannelCopyPlatform(work.platform)) {
    const source = typeof work.app_run?.input_payload?.source === "string"
      ? work.app_run.input_payload.source.replace(/\s+/g, " ").trim()
      : "";
    const appLabel = formatAppLabel(work.platform);
    const suffix = title.replace(new RegExp(`^${appLabel}｜`), "").trim();
    const leakedTone = /^(?:sharp_insight|gentle_empathy|analogy_thinking|raw_restore|犀利洞察|温和共鸣|类比思维|原汁原味（还原整理）)$/.test(suffix);
    if (source && leakedTone) return `${appLabel}｜${source.slice(0, 18)}`;
  }

  return title
    .replace(/\bsharp_insight\b/gi, formatToneLabel("sharp_insight"))
    .replace(/\bgentle_empathy\b/gi, formatToneLabel("gentle_empathy"))
    .replace(/\banalogy_thinking\b/gi, formatToneLabel("analogy_thinking"))
    .replace(/\braw_restore\b/gi, formatToneLabel("raw_restore"))
    .replace(/\bprofessional_direct\b/gi, formatToneLabel("professional_direct"))
    .replace(/\bwarm_trust\b/gi, formatToneLabel("warm_trust"))
    .replace(/\bscenario_analogy\b/gi, formatToneLabel("scenario_analogy"))
    .replace(/\bmaterial_faithful\b/gi, formatToneLabel("material_faithful"))
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
    .replace(/^版本[一二三四五六七八九十0-9]+\s*[|｜]\s*/u, "")
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

  return `${fallbackLabel} | ${compact.slice(0, 18)}`;
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
  const isPolicyRenewalCard = work.platform === "policy-renewal-card";
  const avatarVisualAssetIds = Array.isArray(work.app_run?.result_json?.avatarVisualAssetIds)
    ? work.app_run.result_json.avatarVisualAssetIds.filter((item): item is string => typeof item === "string")
    : [];
  const source = typeof payload.article === "string" && payload.article.trim()
    ? payload.article.trim()
    : typeof payload.source === "string" && payload.source.trim()
      ? payload.source.trim()
    : inferImageSourceFromPayload(work);
  const fallbackTitle = stripImageWorkTitle(work.title);
  const styleFromTitle = inferImageStyleFromTitle(work.title);
  const title = isPolicyRenewalCard
    ? `${stringifySingleInputValue(payload.customer_salutation)} · ${stringifySingleInputValue(payload.renewal_date)}`
    : source ? source.replace(/\s+/g, " ").slice(0, 38) : stripImageWorkTitle(work.title);
  const isWechatImages = work.platform === "wechat-images";
  return {
    title: title || "图片生成结果",
    source,
    style: formatInputValue("style", payload.style) !== "-" ? formatInputValue("style", payload.style) : styleFromTitle,
    drawPortrait: isPolicyRenewalCard
      ? avatarVisualAssetIds.length > 0
        ? `数字分身形象（${avatarVisualAssetIds.length}张）`
        : payload.reference_image
          ? "已合成临时顾问形象照"
          : "未使用顾问形象照"
      : isWechatImages
      ? "不涉及人物形象"
      : formatInputValue("draw_portrait", payload.draw_portrait) !== "-"
        ? formatInputValue("draw_portrait", payload.draw_portrait)
        : "否，不要画人物形象",
    ratio: isWechatImages
      ? "多图文章配图"
      : formatInputValue("ratio", payload.ratio) !== "-"
        ? formatInputValue("ratio", payload.ratio)
        : inferImageRatioFromContent(work.content),
    hasPayload: Boolean(work.app_run?.input_payload && Object.keys(work.app_run.input_payload).length > 0),
    fallbackTitle,
  };
}

function buildImageInputEntries(work: WorkDetail) {
  const payload = work.app_run?.input_payload ?? {};
  const orderedKeys = work.platform === "policy-renewal-card"
    ? ["customer_salutation", "insurer", "product_name", "policy_number", "renewal_date", "premium_amount", "currency", "privacy_mode", "advisor_name", "advisor_company", "contact_text", "style", "avatar_visual_mode", "avatar_visual_asset_ids", "ratio", "reference_image", "portrait_treatment", "confirmation"]
    : work.platform === "wechat-images"
    ? ["style", "article", "avatar_visual_mode", "avatar_visual_asset_ids"]
    : ["draw_portrait", "avatar_visual_asset_ids", "ratio", "style", "source", "signature", "reference_image"];
  const seen = new Set<string>();
  const entries: Array<{ key: string; label: string; value?: string; actionLabel?: string; previewValue?: string }> = [];

  for (const key of orderedKeys) {
    const raw = key === "policy_number" && payload.privacy_mode !== "full" && typeof payload[key] === "string"
      ? maskPolicyNumberForDisplay(payload[key])
      : payload[key];
    if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) continue;
    seen.add(key);
    if (key === "source" || key === "article") {
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
    if (key === "source" || key === "article") {
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
    if (work.platform === "wechat-images") {
      entries.push(
        { key: "style", label: "图片风格", value: buildImageWorkMeta(work).style },
        { key: "article", label: "文章内容", actionLabel: "文本输入", previewValue: buildImageWorkMeta(work).source },
      );
      return entries;
    }
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
    .replace(/^公众号配图[｜|]/, "")
    .replace(/^保单续保提醒卡[｜|]/, "")
    .replace(/\billustration\b/gi, "手绘插画")
    .trim();
  return cleaned || "图片生成结果";
}

function maskPolicyNumberForDisplay(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length <= 4) return `${normalized.slice(0, 1)}***`;
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
  return `${normalized.slice(0, 3)}****${normalized.slice(-3)}`;
}

function formatImageStyleLabel(value?: string | null) {
  if (!value) return "-";
  if (value === "renewal-handwritten") return "手写服务单";
  if (value === "renewal-warm") return "温暖顾问版";
  if (value === "renewal-business") return "简洁商务版";
  if (value === "illustration") return "手绘插画";
  if (value === "flat") return "扁平海报";
  if (value === "realistic") return "写实质感";
  if (value === "cartoon") return "卡通绘本";
  if (value === "landscape") return "风景";
  if (value === "abstract") return "抽象";
  if (value === "miyazaki") return "温暖手绘";
  if (value === "shinkai") return "电影光影";
  if (value === "feng-zikai") return "东方线描";
  if (value === "cai-zhizhong") return "简笔叙事";
  if (value === "quentin-blake") return "松弛速写";
  if (value === "oliver-jeffers") return "童趣拼贴";
  if (value === "oil") return "油画风格";
  if (value === "watercolor") return "水彩晕染风格";
  if (value === "colored-pencil") return "彩色铅笔手绘插画风格";
  if (value === "fine-line") return "细线条插画";
  if (value === "ink") return "水墨画风格";
  if (value === "jimmy") return "纸张绘本";
  if (value === "city-detail") return "城市细节";
  if (value === "quiet-drama") return "静谧中的戏剧性";
  if (value === "city-sunset") return "城市日落时间";
  if (value === "healing") return "治愈系插画";
  if (value === "retro-drawing") return "复古手绘插画";
  if (value === "vivid-healing") return "高饱治愈插画";
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
  if (mode === "fallback") return "该作品是历史占位结果。当前系统不会再把占位图计为成功，请重新生成真实图片。";
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
