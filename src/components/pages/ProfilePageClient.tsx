"use client";

import { FormEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { apiPath, appPath } from "@/lib/client/url";
import { usePageMeta } from "@/lib/client/page-meta";
import type {
  AvatarEvolutionProposal,
  AvatarMemoryCategory,
  AvatarMemoryItem,
  AvatarMemorySource,
  AvatarPrivacySettings,
  AvatarVisualAsset,
  AvatarVisualAssetRole,
  AvatarVersion,
  AvatarCoachConversation,
  AvatarCoachMessage,
  AvatarContactCard,
} from "@/lib/avatar/types";
import type { ThinkingProfileSnapshot, ThinkingProfileSummary } from "@/lib/thinking/profile-snapshot";

type AvatarWorkspace = {
  memories: AvatarMemoryItem[];
  sources: AvatarMemorySource[];
  proposals: AvatarEvolutionProposal[];
  versions: AvatarVersion[];
  privacy: AvatarPrivacySettings;
  photos: AvatarVisualAsset[];
  usage: { count: number; lastUsedAt: string | null };
  profile: {
    version: number;
    snapshot: ThinkingProfileSnapshot;
    summary: ThinkingProfileSummary;
    updatedAt: string;
  } | null;
  questionnaire: { completionPercent: number; updatedAt: string } | null;
  contactCard: AvatarContactCard;
};

type AvatarTab = "coach" | "overview" | "memory" | "visual" | "contact" | "evolution" | "lab" | "sources" | "versions";
type CoachNextStep = { title: string; description: string; href: string };

const tabs: Array<{ id: AvatarTab; label: string; description: string }> = [
  { id: "coach", label: "小谷精灵", description: "和懂你的创作教练聊聊" },
  { id: "overview", label: "分身主页", description: "成熟度与当前状态" },
  { id: "memory", label: "我的记忆", description: "查看和管理长期记忆" },
  { id: "visual", label: "形象资产", description: "管理可复用的本人照片" },
  { id: "contact", label: "联系名片", description: "二维码与发布署名" },
  { id: "evolution", label: "进化中心", description: "确认分身如何改变" },
  { id: "lab", label: "分身试验室", description: "对比普通 AI 与你的分身" },
  { id: "sources", label: "学习资料", description: "文章、录音与故事来源" },
  { id: "versions", label: "版本与隐私", description: "回滚和学习控制" },
];

const categoryMeta: Record<AvatarMemoryCategory, { label: string; description: string }> = {
  identity: { label: "我是谁", description: "身份、经历、角色和专业可信度" },
  audience: { label: "我服务谁", description: "目标客户、典型问题和真实顾虑" },
  expertise: { label: "我擅长什么", description: "专业领域、判断框架和保险理念" },
  expression: { label: "我怎么表达", description: "语气、节奏、结构和行动引导" },
  story: { label: "我用什么证明", description: "个人故事、脱敏案例和可核验成果" },
  boundary: { label: "我不说什么", description: "合规边界、禁用词和个人忌讳" },
  temporary: { label: "临时记忆", description: "仅供阶段性任务使用的信息" },
};

const emptyPrivacy: AvatarPrivacySettings = {
  learning_enabled: true,
  behavior_learning_enabled: true,
  customer_memory_enabled: false,
  auto_inference_enabled: true,
  visual_creation_enabled: true,
};

export function ProfilePageClient() {
  const [workspace, setWorkspace] = useState<AvatarWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<AvatarTab>(() => {
    if (typeof window === "undefined") return "coach";
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (requestedTab && tabs.some((tab) => tab.id === requestedTab)) return requestedTab as AvatarTab;
    return "coach";
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [memoryDraft, setMemoryDraft] = useState<{ category: AvatarMemoryCategory; title: string; content: string }>({ category: "identity", title: "", content: "" });
  const [sourceDraft, setSourceDraft] = useState({ sourceType: "article", title: "", content: "" });
  const [labPrompt, setLabPrompt] = useState("");
  const [labResult, setLabResult] = useState<{ avatarText: string; baselineText: string } | null>(null);
  const [coachConversations, setCoachConversations] = useState<AvatarCoachConversation[]>([]);
  const [coachConversationId, setCoachConversationId] = useState("");
  const [coachMessages, setCoachMessages] = useState<AvatarCoachMessage[]>([]);
  const [coachInput, setCoachInput] = useState("");
  const [coachNextSteps, setCoachNextSteps] = useState<CoachNextStep[]>([]);
  const [coachProfilePrompt, setCoachProfilePrompt] = useState(false);
  const [coachThinkingStep, setCoachThinkingStep] = useState(-1);
  const [coachStreamingContent, setCoachStreamingContent] = useState("");
  const [contactDraft, setContactDraft] = useState({ displayName: "", organization: "", callToAction: "扫码联系我", serviceMotto: "保险不是推销，是长期的守护", phone: "", email: "", businessCardStyle: "classic" as "classic" | "emerald" | "editorial" | "ivory" | "garden" | "lavender", defaultQrCodeId: null as string | null });
  const coachInputRef = useRef<HTMLTextAreaElement | null>(null);
  usePageMeta({ title: "数字分身 · 人设与表达", description: `数字分身 / ${tabs.find((tab) => tab.id === activeTab)?.label ?? "分身主页"}` });

  async function loadAvatar(signal?: AbortSignal) {
    try {
      const response = await fetch(apiPath("/api/avatar"), { signal });
      const payload = await response.json() as { avatar?: AvatarWorkspace; error?: string };
      if (!response.ok || !payload.avatar) {
        setError(payload.error ?? "数字分身暂时无法加载");
        return;
      }
      setWorkspace(payload.avatar);
      setContactDraft({ displayName: payload.avatar.contactCard.display_name, organization: payload.avatar.contactCard.organization, callToAction: payload.avatar.contactCard.call_to_action, serviceMotto: payload.avatar.contactCard.service_motto, phone: payload.avatar.contactCard.phone, email: payload.avatar.contactCard.email, businessCardStyle: payload.avatar.contactCard.business_card_style, defaultQrCodeId: payload.avatar.contactCard.default_qr_code_id });
      setError("");
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("数字分身暂时无法加载");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadAvatar(controller.signal));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (activeTab !== "coach") return;
    void fetch(apiPath("/api/avatar/chat")).then(async (response) => response.ok ? response.json() : null).then((payload: { conversations?: AvatarCoachConversation[] } | null) => {
      if (payload?.conversations) setCoachConversations(payload.conversations);
    }).catch(() => undefined);
  }, [activeTab]);

  const maturity = useMemo(() => calculateMaturity(workspace), [workspace]);
  const activeMemories = workspace?.memories.filter((item) => item.status === "active") ?? [];
  const candidateMemories = workspace?.memories.filter((item) => item.status === "candidate") ?? [];
  const pendingProposals = workspace?.proposals.filter((item) => item.status === "pending") ?? [];
  const displayName = workspace?.profile?.snapshot.identity_profile.display_name || "你的数字分身";
  const primaryPhoto = workspace?.photos.find((photo) => photo.is_primary && photo.status === "active") ?? null;

  async function performAction(body: Record<string, unknown>, successMessage: string) {
    setBusy(String(body.action ?? "action"));
    setNotice("");
    setError("");
    try {
      const response = await fetch(apiPath("/api/avatar"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "操作失败");
        return false;
      }
      setNotice(successMessage);
      await loadAvatar();
      return true;
    } catch {
      setError("网络连接异常，请稍后重试");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function addMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await performAction({ action: "add-memory", ...memoryDraft, sensitivity: "normal", usageScope: memoryDraft.category === "temporary" ? "private" : "all" }, "记忆已加入数字分身。");
    if (ok) setMemoryDraft((current) => ({ ...current, title: "", content: "" }));
  }

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await performAction({ action: "add-source", ...sourceDraft, sensitivity: "normal" }, "学习资料已添加。");
    if (ok) setSourceDraft((current) => ({ ...current, title: "", content: "" }));
  }

  async function runLab(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("lab");
    setError("");
    setLabResult(null);
    try {
      const response = await fetch(apiPath("/api/avatar/lab"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: labPrompt }),
      });
      const payload = await response.json() as { avatarText?: string; baselineText?: string; error?: string };
      if (!response.ok || !payload.avatarText || !payload.baselineText) {
        setError(payload.error ?? "试写失败");
        return;
      }
      setLabResult({ avatarText: payload.avatarText, baselineText: payload.baselineText });
    } catch {
      setError("网络连接异常，请稍后重试");
    } finally {
      setBusy("");
    }
  }

  async function submitCoach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendCoachMessage(coachInput);
  }

  async function sendCoachMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (message.length < 2) return;
    const localUserMessage: AvatarCoachMessage = { id: `local-${Date.now()}`, role: "user", content: message, created_at: new Date().toISOString() };
    setCoachMessages((current) => [...current, localUserMessage]);
    setCoachInput(""); setBusy("coach"); setError(""); setCoachNextSteps([]); setCoachProfilePrompt(false);
    setCoachStreamingContent("");
    setCoachThinkingStep(0);
    const contextTimer = window.setTimeout(() => setCoachThinkingStep(1), 350);
    const planTimer = window.setTimeout(() => setCoachThinkingStep(2), 900);
    try {
      const response = await fetch(apiPath("/api/avatar/chat"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: coachConversationId || undefined, message }) });
      if (!response.ok || !response.body) throw new Error("咨询失败，请稍后重试");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let event = "message"; let received = false; let streamedAnswer = "";
      const consume = (block: string) => {
        const lines = block.split("\n"); const eventLine = lines.find((line) => line.startsWith("event:")); const dataLine = lines.find((line) => line.startsWith("data:"));
        if (!dataLine) return;
        const payload = JSON.parse(dataLine.slice(5).trim()) as { conversationId?: string; content?: string; nextSteps?: CoachNextStep[]; profilePrompt?: boolean; proposalCreated?: boolean; error?: string };
        event = eventLine?.slice(6).trim() ?? "message";
        if (event === "meta" && payload.conversationId) setCoachConversationId(payload.conversationId);
        if (event === "delta" && payload.content) { received = true; streamedAnswer += payload.content; setCoachThinkingStep(2); setCoachStreamingContent(streamedAnswer); }
        if (event === "done") { setCoachNextSteps(payload.nextSteps ?? []); setCoachProfilePrompt(Boolean(payload.profilePrompt)); if (payload.proposalCreated) { setNotice("小谷识别到一项长期偏好，已生成待确认的进化建议。"); void loadAvatar(); } }
        if (event === "error") throw new Error(payload.error ?? "咨询失败，请稍后重试");
      };
      while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }); let boundary; while ((boundary = buffer.indexOf("\n\n")) >= 0) { consume(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); } if (done) break; }
      if (!received) throw new Error("小谷暂时没有生成结果，请稍后重试");
      setCoachMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", content: streamedAnswer, created_at: new Date().toISOString() }]);
      setCoachStreamingContent("");
      const history = await fetch(apiPath("/api/avatar/chat"));
      if (history.ok) { const data = await history.json() as { conversations?: AvatarCoachConversation[] }; if (data.conversations) setCoachConversations(data.conversations); }
    } catch (cause) {
      setCoachMessages((current) => current.filter((item) => item.id !== localUserMessage.id));
      setError(cause instanceof Error ? cause.message : "咨询失败，请稍后重试");
    } finally { window.clearTimeout(contextTimer); window.clearTimeout(planTimer); setCoachThinkingStep(-1); setBusy(""); }
  }

  async function openCoachConversation(id: string) {
    setBusy("coach-history");
    try {
      const response = await fetch(apiPath(`/api/avatar/chat?conversationId=${encodeURIComponent(id)}`));
      const payload = await response.json() as { conversation?: { messages?: AvatarCoachMessage[] }; error?: string };
      if (!response.ok || !payload.conversation) throw new Error(payload.error ?? "记录无法加载");
      setCoachConversationId(id); setCoachMessages(payload.conversation.messages ?? []); setCoachNextSteps([]); setCoachProfilePrompt(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "记录无法加载"); } finally { setBusy(""); }
  }

  async function uploadPhotos(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setBusy("upload-photos");
    setNotice("");
    setError("");
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    try {
      const response = await fetch(apiPath("/api/avatar/photos"), { method: "POST", body: form });
      const payload = await response.json() as { photos?: AvatarVisualAsset[]; errors?: Array<{ fileName: string; error: string }>; error?: string };
      if (!response.ok) {
        setError(payload.error ?? payload.errors?.[0]?.error ?? "形象照上传失败");
        return;
      }
      const failed = payload.errors?.length ?? 0;
      setNotice(`已上传 ${payload.photos?.length ?? 0} 张形象照${failed ? `，${failed} 张未通过检查` : ""}。`);
      await loadAvatar();
    } catch {
      setError("形象照上传失败，请检查网络后重试");
    } finally {
      setBusy("");
    }
  }

  async function updatePhoto(assetId: string, patch: Record<string, unknown>, successMessage: string) {
    setBusy(`photo-${assetId}`);
    setNotice("");
    setError("");
    try {
      const response = await fetch(apiPath("/api/avatar/photos"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId, ...patch }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "形象照更新失败");
        return;
      }
      setNotice(successMessage);
      await loadAvatar();
    } finally {
      setBusy("");
    }
  }

  async function deletePhoto(assetId: string) {
    if (!window.confirm("删除后将不再用于未来创作，确认删除这张形象照？")) return;
    setBusy(`photo-${assetId}`);
    try {
      const response = await fetch(apiPath(`/api/avatar/photos?id=${assetId}`), { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "形象照删除失败");
        return;
      }
      setNotice("形象照已删除。历史生成作品不受影响。");
      await loadAvatar();
    } finally {
      setBusy("");
    }
  }

  async function saveContactCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("contact-card"); setError(""); setNotice("");
    try { const response = await fetch(apiPath("/api/avatar/contact-card"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(contactDraft) }); const payload = await response.json() as { error?: string }; if (!response.ok) { setError(payload.error ?? "联系名片保存失败"); return; } setNotice("联系名片已保存，知识卡片下载时可直接使用。"); await loadAvatar(); } catch { setError("联系名片保存失败，请检查网络后重试"); } finally { setBusy(""); }
  }

  async function uploadContactQr(file: File | undefined) {
    if (!file) return; setBusy("contact-qr"); setError(""); setNotice(""); const form = new FormData(); form.append("file", file);
    try { const response = await fetch(apiPath("/api/avatar/contact-card"), { method: "POST", body: form }); const payload = await response.json() as { error?: string }; if (!response.ok) { setError(payload.error ?? "二维码上传失败"); return; } setNotice("联系二维码已更新。"); await loadAvatar(); } catch { setError("二维码上传失败，请检查网络后重试"); } finally { setBusy(""); }
  }

  async function deleteContactQr(id: string) { if (!window.confirm("确认删除这个联系二维码？")) return; setBusy("contact-qr"); try { const response = await fetch(apiPath(`/api/avatar/contact-card?id=${encodeURIComponent(id)}`), { method: "DELETE" }); const payload = await response.json() as { error?: string }; if (!response.ok) { setError(payload.error ?? "二维码删除失败"); return; } setNotice("二维码已删除。"); await loadAvatar(); } catch { setError("二维码删除失败，请检查网络后重试"); } finally { setBusy(""); } }

  return (
    <div className={`avatarConsolePage ${activeTab === "coach" ? "coachActive" : ""}`}>
      {error ? <div className="alertPanel">{error}</div> : null}
      {notice ? <div className="successPanel">{notice}</div> : null}

      <nav className="avatarConsoleTabs" aria-label="数字分身功能">
        {tabs.map((tab) => (
          <button className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">
            <strong>{tab.label}</strong><span>{tab.description}</span>
            {tab.id === "evolution" && pendingProposals.length > 0 ? <em>{pendingProposals.length}</em> : null}
          </button>
        ))}
      </nav>

      {activeTab === "coach" ? (
        <AvatarCoachView busy={busy} thinkingStep={coachThinkingStep} streamingContent={coachStreamingContent} conversations={coachConversations} messages={coachMessages} input={coachInput} nextSteps={coachNextSteps} profilePrompt={coachProfilePrompt} inputRef={coachInputRef} onChangeInput={setCoachInput} onSubmit={submitCoach} onPrompt={(prompt) => void sendCoachMessage(prompt)} onOpenConversation={openCoachConversation} onOpenProfile={() => setActiveTab("memory")} onNew={() => { setCoachConversationId(""); setCoachMessages([]); setCoachStreamingContent(""); setCoachNextSteps([]); setCoachProfilePrompt(false); }} />
      ) : null}

      {activeTab === "overview" ? <>
        <section className="avatarConsoleHero">
          <p className="avatarConsoleVision">让小谷理解并记住你的经验、判断与表达方式，把它们沉淀成可长期复用的个人内容资产，让每一次创作都更像你。</p>
          <div className="avatarConsoleIdentity">
            {primaryPhoto ? (
              <>
                {/* User-uploaded avatar assets may use runtime-generated URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={`${displayName}的主形象`} className="avatarConsolePhoto" src={primaryPhoto.content_url} />
              </>
            ) : <div className="avatarConsoleMark" aria-hidden="true">AI</div>}
            <div>
              <div className="avatarConsoleMeta"><span>{loading ? "同步中" : "分身在线"}</span><em>V{workspace?.versions[0]?.version ?? workspace?.profile?.version ?? 1}</em></div>
              <h1>{displayName}</h1>
              <p>{workspace?.profile?.summary.one_liner || "持续记住你的经历、客户和表达方式，并在确认后不断进化。"}</p>
            </div>
          </div>
          <div className="avatarHeroStats"><div><strong>{maturity.overall}%</strong><span>分身成熟度</span></div><div><strong>{activeMemories.length}</strong><span>长期记忆</span></div><div><strong>{workspace?.usage.count ?? 0}</strong><span>应用次数</span></div></div>
          <div className="avatarHeroActions"><button className="primaryButton" onClick={() => { setActiveTab("coach"); window.requestAnimationFrame(() => document.getElementById("avatar-coach")?.scrollIntoView({ behavior: "smooth", block: "center" })); }} type="button">和小谷聊聊</button><div className="avatarHeroSecondaryActions"><button onClick={() => setActiveTab("memory")} type="button">完善记忆</button><i>·</i><button onClick={() => setActiveTab("lab")} type="button">试试像不像我</button></div></div>
          <p className="avatarHeroContext">小谷已参考：{activeMemories.length ? `${activeMemories.length} 条长期记忆、你的表达偏好与目标客户` : "待完善的个人画像"}<button onClick={() => setActiveTab("memory")} type="button">查看画像</button></p>
        </section>
        <OverviewView maturity={maturity} workspace={workspace} onOpenTab={setActiveTab} />
      </> : null}

      {activeTab === "memory" ? (
        <section className="avatarViewLayout">
          <div className="avatarViewMain">
            <div className="avatarSectionHeader"><div><span>长期记忆</span><h2>小谷现在记住了什么</h2><p>推断内容会显示来源和可信度，你可以确认、停用或删除。</p></div></div>
            {candidateMemories.length > 0 ? (
              <div className="avatarCandidateBanner"><strong>{candidateMemories.length} 条候选记忆待确认</strong><span>AI 推断不会在确认前进入正式创作上下文。</span></div>
            ) : null}
            <div className="avatarMemoryGroups">
              {(Object.keys(categoryMeta) as AvatarMemoryCategory[]).map((category) => {
                const items = workspace?.memories.filter((item) => item.category === category) ?? [];
                return (
                  <section className="avatarMemoryGroup" key={category}>
                    <div className="avatarMemoryGroupHeader"><div><h3>{categoryMeta[category].label}</h3><p>{categoryMeta[category].description}</p></div><span>{items.length}</span></div>
                    <div className="avatarMemoryList">
                      {items.map((item) => (
                        <article className={`avatarMemoryItem ${item.status}`} key={item.id}>
                          <div><strong>{item.title || categoryMeta[category].label}</strong><p>{item.content}</p></div>
                          <div className="avatarMemoryItemMeta"><span>{originLabel(item.origin)}</span><span>可信度 {item.confidence}%</span><span>{item.usage_scope === "private" ? "仅自己可见" : "参与创作"}</span></div>
                          <div className="avatarMemoryActions">
                            {item.status === "candidate" ? <button onClick={() => void performAction({ action: "set-memory-status", memoryId: item.id, status: "active" }, "候选记忆已确认。")}>确认</button> : null}
                            {item.status === "active" ? <button onClick={() => void performAction({ action: "set-memory-status", memoryId: item.id, status: "candidate" }, "记忆已暂停使用。")}>暂停</button> : null}
                            <button className="danger" onClick={() => void performAction({ action: "set-memory-status", memoryId: item.id, status: "archived" }, "记忆已归档。")}>归档</button>
                          </div>
                        </article>
                      ))}
                      {items.length === 0 ? <div className="avatarEmptyRow">暂时没有这类记忆。</div> : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
          <aside className="avatarViewAside">
            <form className="avatarSideForm" onSubmit={addMemory}>
              <div><span>新增记忆</span><h2>告诉小谷一件事</h2></div>
              <label>记忆类型<select value={memoryDraft.category} onChange={(event) => setMemoryDraft((current) => ({ ...current, category: event.target.value as AvatarMemoryCategory }))}>{(Object.keys(categoryMeta) as AvatarMemoryCategory[]).map((key) => <option key={key} value={key}>{categoryMeta[key].label}</option>)}</select></label>
              <label>标题<input value={memoryDraft.title} onChange={(event) => setMemoryDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例如：我的服务原则" /></label>
              <label>具体内容<textarea value={memoryDraft.content} onChange={(event) => setMemoryDraft((current) => ({ ...current, content: event.target.value }))} placeholder="写清楚事实、偏好或边界" required /></label>
              <button className="primaryButton" disabled={busy === "add-memory" || !memoryDraft.content.trim()} type="submit">加入长期记忆</button>
              <p>客户姓名、联系方式、身份证件和完整保单信息不建议保存为长期记忆。</p>
            </form>
          </aside>
        </section>
      ) : null}

      {activeTab === "visual" ? (
        <VisualAssetsView
          busy={busy}
          photos={workspace?.photos ?? []}
          privacyEnabled={workspace?.privacy.visual_creation_enabled ?? true}
          onDelete={deletePhoto}
          onUpdate={updatePhoto}
          onUpload={uploadPhotos}
          onUpdatePrivacy={(enabled) => performAction({
            action: "privacy",
            learningEnabled: workspace?.privacy.learning_enabled ?? true,
            behaviorLearningEnabled: workspace?.privacy.behavior_learning_enabled ?? true,
            customerMemoryEnabled: workspace?.privacy.customer_memory_enabled ?? false,
            autoInferenceEnabled: workspace?.privacy.auto_inference_enabled ?? true,
            visualCreationEnabled: enabled,
          }, enabled ? "已允许创作调用形象照。" : "已暂停创作调用形象照。")}
        />
      ) : null}

      {activeTab === "evolution" ? (
        <section className="avatarSingleView">
          <div className="avatarSectionHeader"><div><span>可控进化</span><h2>待确认的进化建议</h2><p>小谷只提出建议，不会未经确认改变你的核心分身。</p></div></div>
          <div className="avatarProposalList">
            {(workspace?.proposals ?? []).map((proposal) => (
              <article className={`avatarProposal ${proposal.status}`} key={proposal.id}>
                <div className="avatarProposalTop"><div><span>{categoryMeta[proposal.category as AvatarMemoryCategory]?.label ?? proposal.category}</span><h3>{proposal.title}</h3></div><strong>{proposal.confidence}% 可信</strong></div>
                <p>{proposal.description}</p>
                <ul>{proposal.evidence_json.map((item) => <li key={item}>{item}</li>)}</ul>
                {proposal.status === "pending" ? <div><button className="primaryButton" onClick={() => void performAction({ action: "resolve-proposal", proposalId: proposal.id, decision: "accepted" }, "进化建议已接受，并创建了新版本。")}>接受并进化</button><button className="secondaryButton" onClick={() => void performAction({ action: "resolve-proposal", proposalId: proposal.id, decision: "rejected" }, "进化建议已忽略。")}>忽略</button></div> : <em>{proposal.status === "accepted" ? "已接受" : "已忽略"}</em>}
              </article>
            ))}
            {(workspace?.proposals.length ?? 0) === 0 ? <div className="avatarEmptyState"><strong>还没有进化建议</strong><p>在分身试验室评价结果，或在作品中持续反馈，小谷会在发现稳定模式后提出建议。</p></div> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "lab" ? (
        <section className="avatarLabView">
          <div className="avatarSectionHeader"><div><span>分身试验室</span><h2>同一个主题，看看分身有什么不同</h2><p>左侧使用你的长期记忆，右侧使用普通保险内容顾问基线。</p></div></div>
          <div className="avatarVisualLabStrip">
            <div><strong>视觉分身准备度</strong><span>{workspace?.photos.length ? `已有 ${workspace.photos.length} 张形象照，可在做图和个性名片中调用。` : "还没有形象照，图片创作只能使用临时上传。"}</span></div>
            <button onClick={() => setActiveTab("visual")} type="button">{workspace?.photos.length ? "管理形象" : "添加形象"}</button>
          </div>
          <form className="avatarLabComposer" onSubmit={runLab}><textarea value={labPrompt} onChange={(event) => setLabPrompt(event.target.value)} placeholder="例如：写一段关于中年家庭为什么要先保障收入支柱的朋友圈" /><button className="primaryButton" disabled={busy === "lab" || labPrompt.trim().length < 5}>{busy === "lab" ? "对比生成中" : "开始对比"}</button></form>
          {labResult ? (
            <div className="avatarLabResults">
              <article><div><span>数字分身版本</span><strong>使用 {activeMemories.length} 条记忆</strong></div><p>{labResult.avatarText}</p><FeedbackActions onFeedback={(eventType) => void performAction({ action: "feedback", eventType, beforeText: labResult.avatarText, feedbackText: labPrompt }, "反馈已记录，稳定模式会进入进化中心。")}/></article>
              <article><div><span>普通 AI 基线</span><strong>不使用个人记忆</strong></div><p>{labResult.baselineText}</p></article>
            </div>
          ) : <div className="avatarLabPlaceholder"><strong>输入一个你经常创作的真实主题</strong><p>建议选择你熟悉、能够判断“像不像自己”的内容。</p></div>}
        </section>
      ) : null}

      {activeTab === "sources" ? (
        <section className="avatarViewLayout">
          <div className="avatarViewMain avatarSinglePanel">
            <div className="avatarSectionHeader"><div><span>学习资料</span><h2>数字分身的知识来源</h2><p>每份资料都可单独停用。敏感客户信息不要直接上传。</p></div></div>
            <div className="avatarSourceList">
              {(workspace?.sources ?? []).map((source) => <article key={source.id}><div><span>{sourceTypeLabel(source.source_type)}</span><h3>{source.title}</h3><p>{source.content}</p></div><div><em>{source.status === "active" ? "参与学习" : "已停用"}</em><button onClick={() => void performAction({ action: "set-source-status", sourceId: source.id, status: source.status === "active" ? "disabled" : "active" }, source.status === "active" ? "资料已停用。" : "资料已启用。")}>{source.status === "active" ? "停用" : "启用"}</button><button className="danger" onClick={() => void performAction({ action: "set-source-status", sourceId: source.id, status: "archived" }, "资料已归档。")}>归档</button></div></article>)}
              {(workspace?.sources.length ?? 0) === 0 ? <div className="avatarEmptyState"><strong>还没有学习资料</strong><p>可以添加你认可的文章、朋友圈、录音整理稿和个人故事。</p></div> : null}
            </div>
          </div>
          <aside className="avatarViewAside"><form className="avatarSideForm" onSubmit={addSource}><div><span>添加资料</span><h2>让小谷学习你的原文</h2></div><label>资料类型<select value={sourceDraft.sourceType} onChange={(event) => setSourceDraft((current) => ({ ...current, sourceType: event.target.value }))}><option value="article">文章</option><option value="moments">朋友圈</option><option value="transcript">录音整理稿</option><option value="story">个人故事</option><option value="manual">其他资料</option></select></label><label>标题<input value={sourceDraft.title} onChange={(event) => setSourceDraft((current) => ({ ...current, title: event.target.value }))} required /></label><label>正文<textarea value={sourceDraft.content} onChange={(event) => setSourceDraft((current) => ({ ...current, content: event.target.value }))} placeholder="至少 20 个字" required /></label><button className="primaryButton" disabled={busy === "add-source" || sourceDraft.content.trim().length < 20}>添加学习资料</button></form></aside>
        </section>
      ) : null}

      {activeTab === "versions" ? (
        <VersionsView privacy={workspace?.privacy ?? emptyPrivacy} versions={workspace?.versions ?? []} onAction={performAction} />
      ) : null}
      {activeTab === "contact" ? <ContactCardView card={workspace?.contactCard ?? null} draft={contactDraft} busy={busy} onChange={setContactDraft} onSave={saveContactCard} onUpload={uploadContactQr} onDelete={deleteContactQr} /> : null}
    </div>
  );
}

const visualRoleLabels: Record<AvatarVisualAssetRole, string> = {
  portrait: "正面形象",
  professional: "职业半身",
  lifestyle: "自然生活",
  full_body: "全身照片",
  side_profile: "侧面形象",
};

const visualScopeOptions = [
  { id: "image-card", label: "知识卡片" },
  { id: "personality-card", label: "个性名片" },
  { id: "wechat-images", label: "公众号配图" },
  { id: "policy-renewal-card", label: "续费提醒卡" },
  { id: "video-cover", label: "视频封面" },
];

function ContactCardView({ card, draft, busy, onChange, onSave, onUpload, onDelete }: {
  card: AvatarContactCard | null;
  draft: { displayName: string; organization: string; callToAction: string; serviceMotto: string; phone: string; email: string; businessCardStyle: "classic" | "emerald" | "editorial" | "ivory" | "garden" | "lavender"; defaultQrCodeId: string | null };
  busy: string;
  onChange: (value: { displayName: string; organization: string; callToAction: string; serviceMotto: string; phone: string; email: string; businessCardStyle: "classic" | "emerald" | "editorial" | "ivory" | "garden" | "lavender"; defaultQrCodeId: string | null }) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onUpload: (file: File | undefined) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [fullQr, setFullQr] = useState<{ url: string; label: string } | null>(null);
  const [previewQrIds, setPreviewQrIds] = useState<string[]>([]);
  useEffect(() => { setPreviewQrIds((current) => { const valid = current.filter((id) => card?.qr_codes.some((qr) => qr.id === id)); if (valid.length) return valid; return card?.default_qr_code_id ? [card.default_qr_code_id] : card?.qr_codes[0] ? [card.qr_codes[0].id] : []; }); }, [card?.default_qr_code_id, card?.qr_codes]);
  const previewQrs = card?.qr_codes.filter((qr) => previewQrIds.includes(qr.id)) ?? [];
  return <section className="avatarVisualView">
    <div className="avatarVisualHeader"><div><span>发布身份</span><h2>我的联系名片</h2><p>二维码不会交给图片模型生成；小谷会在下载知识卡片时清晰、可扫码地合成到成图上。</p></div></div>
    <div className="avatarContactLayout">
      <form className="avatarSideForm avatarContactForm" onSubmit={(event) => void onSave(event)}>
        <label>顾问名称<input maxLength={40} onChange={(event) => onChange({ ...draft, displayName: event.target.value })} placeholder="例如：林顾问" value={draft.displayName} /></label>
        <label>机构名称（可选）<input maxLength={60} onChange={(event) => onChange({ ...draft, organization: event.target.value })} placeholder="例如：安心家庭保险工作室" value={draft.organization} /></label>
        <label>引导语<input maxLength={50} onChange={(event) => onChange({ ...draft, callToAction: event.target.value })} required value={draft.callToAction} /></label>
        <label>服务信条<input maxLength={60} onChange={(event) => onChange({ ...draft, serviceMotto: event.target.value })} placeholder="例如：保险不是推销，是长期的守护" value={draft.serviceMotto} /></label>
        <label>手机联系方式（可选）<input inputMode="tel" maxLength={30} onChange={(event) => onChange({ ...draft, phone: event.target.value })} placeholder="例如：138 0000 0000" value={draft.phone} /></label>
        <label>邮箱（可选）<input inputMode="email" maxLength={120} onChange={(event) => onChange({ ...draft, email: event.target.value })} placeholder="例如：name@example.com" value={draft.email} /></label>
        <div className="avatarBusinessStyles"><span>名片效果</span>{([{ id: "classic", label: "经典商务" }, { id: "emerald", label: "翡翠专业" }, { id: "editorial", label: "留白编辑" }, { id: "ivory", label: "温柔雅致" }, { id: "garden", label: "花园手记" }, { id: "lavender", label: "柔光质感" }] as const).map((style) => <button className={draft.businessCardStyle === style.id ? "active" : ""} key={style.id} onClick={() => onChange({ ...draft, businessCardStyle: style.id })} type="button">{style.label}</button>)}</div>
        <button className="primaryButton" disabled={busy === "contact-card"} type="submit">{busy === "contact-card" ? "保存中..." : "保存联系名片"}</button>
      </form>
      <aside className="avatarContactQrPanel"><strong>联系二维码（最多 8 个）</strong><small>勾选 1–3 个用于当前名片预览和下载。</small><div className="avatarQrList">{card?.qr_codes.map((qr) => { const selected = previewQrIds.includes(qr.id); return <article className={selected ? "active" : ""} key={qr.id}><button onClick={() => onChange({ ...draft, defaultQrCodeId: qr.id })} type="button"><img alt={qr.label || "联系二维码"} src={qr.qr_code_url} /><span>{qr.label || "未命名二维码"}</span></button><div><button disabled={!selected && previewQrIds.length >= 3} onClick={() => setPreviewQrIds((current) => selected ? current.filter((id) => id !== qr.id) : [...current, qr.id])} type="button">{selected ? "移出预览" : "加入预览"}</button><button onClick={() => setFullQr({ url: qr.original_url, label: `${qr.label || "联系二维码"}（原始上传图）` })} type="button">查看全图</button><button aria-label="删除二维码" className="danger" disabled={busy === "contact-qr"} onClick={() => void onDelete(qr.id)} type="button">删除</button></div></article>; })}</div>{!card?.has_qr_code ? <p>还没有上传二维码</p> : null}<label className="avatarVisualUploadButton">{busy === "contact-qr" ? "处理中..." : "上传二维码"}<input accept="image/jpeg,image/png,image/webp" disabled={busy === "contact-qr" || (card?.qr_codes.length ?? 0) >= 8} multiple onChange={(event) => { Array.from(event.target.files ?? []).forEach((file) => void onUpload(file)); event.currentTarget.value = ""; }} type="file" /></label></aside>
    </div>
    <BusinessCardPreview draft={draft} qrUrls={previewQrs.map((qr) => qr.qr_code_url)} />
    {fullQr ? <div className="avatarQrFullPreview" onClick={() => setFullQr(null)} role="presentation"><div onClick={(event) => event.stopPropagation()}><button aria-label="关闭全图预览" onClick={() => setFullQr(null)} type="button">×</button><strong>{fullQr.label}</strong><img alt={`${fullQr.label}全图`} src={fullQr.url} /></div></div> : null}
  </section>;
}

function BusinessCardPreview({ draft, qrUrls }: { draft: { displayName: string; organization: string; callToAction: string; serviceMotto: string; phone: string; email: string; businessCardStyle: "classic" | "emerald" | "editorial" | "ivory" | "garden" | "lavender" }; qrUrls: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { void renderBusinessCard(canvasRef.current, draft, qrUrls); }, [draft, qrUrls]);
  function download() { const canvas = canvasRef.current; if (!canvas) return; const link = document.createElement("a"); link.download = `${draft.displayName || "我的"}-联系名片.png`; link.href = canvas.toDataURL("image/png"); link.click(); }
  return <div className="avatarBusinessCardPreview"><div><span>名片成品预览</span><strong>专业电子名片</strong><small>选择效果后可直接下载 PNG，用于社交主页、朋友圈或线下物料。</small></div><canvas height="675" ref={canvasRef} width="1200" /><button className="primaryButton" onClick={download} type="button">下载名片 PNG</button></div>;
}

async function renderBusinessCard(canvas: HTMLCanvasElement | null, draft: { displayName: string; organization: string; callToAction: string; serviceMotto: string; phone: string; email: string; businessCardStyle: "classic" | "emerald" | "editorial" | "ivory" | "garden" | "lavender" }, qrUrls: string[]) {
  if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return; const w = canvas.width, h = canvas.height;
  const styles = { classic: { bg: "#102a43", accent: "#c9a66b", text: "#f8fafc", sub: "#bed1df" }, emerald: { bg: "#0c4a43", accent: "#b6e3ce", text: "#f2fbf7", sub: "#b8d9ce" }, editorial: { bg: "#f7f3ea", accent: "#1f4d43", text: "#1f2937", sub: "#62737a" }, ivory: { bg: "#fbf4ed", accent: "#ae715b", text: "#463631", sub: "#8a7167" }, garden: { bg: "#e9f1e8", accent: "#547963", text: "#244238", sub: "#6f8577" }, lavender: { bg: "#efebf6", accent: "#76679a", text: "#352e4c", sub: "#756e89" } } as const; const theme = styles[draft.businessCardStyle];
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = theme.accent; ctx.globalAlpha = .18; ctx.beginPath(); ctx.arc(w * .86, h * .1, 260, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  if (draft.businessCardStyle === "editorial") { ctx.strokeStyle = "#d5c5a0"; ctx.lineWidth = 2; ctx.strokeRect(34, 34, w - 68, h - 68); }
  ctx.fillStyle = theme.accent; ctx.font = "700 26px Arial, sans-serif"; ctx.fillText(draft.organization || "专业保险服务", 80, 105); ctx.fillStyle = theme.text; ctx.font = "700 68px Arial, sans-serif"; ctx.fillText(draft.displayName || "你的姓名", 80, 250); ctx.fillStyle = theme.sub; ctx.font = "400 30px Arial, sans-serif"; ctx.fillText("保险顾问 · 专业服务", 84, 310); ctx.fillStyle = theme.accent; ctx.fillRect(82, 360, 120, 5); ctx.fillStyle = theme.text; ctx.font = "600 34px Arial, sans-serif"; ctx.fillText(draft.callToAction || "扫码联系我", 82, 438);
  const count = Math.min(3, qrUrls.length); const qrSize = count === 1 ? 220 : count === 2 ? 160 : 145; const positions = count === 1 ? [[900, 152]] : count === 2 ? [[850, 240], [1030, 240]] : [[875, 94], [1045, 94], [960, 280]];
  for (let index = 0; index < Math.max(1, count); index += 1) { const [x, y] = positions[index] ?? [900, 152]; ctx.fillStyle = "#fff"; ctx.fillRect(x, y, qrSize, qrSize); const url = qrUrls[index]; if (url) { try { const image = await loadBusinessCardImage(url); const inset = Math.round(qrSize * .1); ctx.imageSmoothingEnabled = false; ctx.drawImage(image, x + inset, y + inset, qrSize - inset * 2, qrSize - inset * 2); ctx.imageSmoothingEnabled = true; } catch { drawQrPlaceholder(ctx, x, y, qrSize); } } else drawQrPlaceholder(ctx, x, y, qrSize); }
  const contactLines = [["电话", draft.phone.trim()], ["邮箱", draft.email.trim()]].filter((item): item is [string, string] => Boolean(item[1]));
  if (contactLines.length) { ctx.fillStyle = theme.sub; ctx.font = "400 22px Arial, sans-serif"; contactLines.forEach(([label, value], index) => ctx.fillText(`${label}  ${value}`, 82, 505 + index * 34)); }
  ctx.fillStyle = theme.accent; ctx.font = "600 22px Arial, sans-serif"; ctx.fillText(draft.serviceMotto || "保险不是推销，是长期的守护", 82, contactLines.length ? 605 : 570);
}
function drawQrPlaceholder(ctx: CanvasRenderingContext2D, x = 900, y = 152, size = 220) { ctx.fillStyle = "#d7e2dd"; ctx.fillRect(x, y, size, size); ctx.fillStyle = "#49665b"; ctx.font = "600 20px Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText("选择二维码", x + size / 2, y + size / 2); ctx.textAlign = "left"; }
function loadBusinessCardImage(url: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = document.createElement("img"); image.onload = () => resolve(image); image.onerror = reject; image.src = url; }); }

function VisualAssetsView({
  photos,
  busy,
  privacyEnabled,
  onUpload,
  onUpdate,
  onDelete,
  onUpdatePrivacy,
}: {
  photos: AvatarVisualAsset[];
  busy: string;
  privacyEnabled: boolean;
  onUpload: (files: FileList | null) => Promise<void>;
  onUpdate: (assetId: string, patch: Record<string, unknown>, successMessage: string) => Promise<void>;
  onDelete: (assetId: string) => Promise<void>;
  onUpdatePrivacy: (enabled: boolean) => Promise<boolean>;
}) {
  return (
    <section className="avatarVisualView">
      <div className="avatarVisualHeader">
        <div><span>视觉身份</span><h2>我的形象资产</h2><p>保存本人已授权的照片，在需要人物出镜的图片应用中按次选择。</p></div>
        <label className="avatarVisualUploadButton">
          {busy === "upload-photos" ? "处理中..." : "上传形象照"}
          <input accept="image/jpeg,image/png,image/webp" disabled={busy === "upload-photos" || photos.length >= 8} multiple onChange={(event) => { void onUpload(event.target.files); event.currentTarget.value = ""; }} type="file" />
        </label>
      </div>

      <div className="avatarVisualPrivacyBar">
        <div><strong>允许图片创作调用形象照</strong><span>关闭后照片仍保留，但所有新图片任务都不会读取。</span></div>
        <input checked={privacyEnabled} onChange={(event) => void onUpdatePrivacy(event.target.checked)} type="checkbox" />
      </div>

      {photos.length ? (
        <div className="avatarVisualGrid">
          {photos.map((photo) => {
            const photoBusy = busy === `photo-${photo.id}`;
            return (
              <article className={photo.status === "active" ? "avatarVisualCard" : "avatarVisualCard disabled"} key={photo.id}>
                <div className="avatarVisualFrame">
                  {/* User-uploaded avatar assets may use runtime-generated URLs. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={photo.label || visualRoleLabels[photo.role]} src={photo.content_url} />
                  {photo.is_primary ? <strong>主形象</strong> : null}
                  <span>{photo.width} × {photo.height}</span>
                </div>
                <div className="avatarVisualCardBody">
                  <label>照片类型<select disabled={photoBusy} onChange={(event) => void onUpdate(photo.id, { role: event.target.value }, "照片类型已更新。") } value={photo.role}>{Object.entries(visualRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <div className="avatarVisualScopes">
                    <span>允许使用</span>
                    {visualScopeOptions.map((scope) => {
                      const checked = photo.usage_scopes.includes(scope.id);
                      return <label key={scope.id}><input checked={checked} disabled={photoBusy || (checked && photo.usage_scopes.length === 1)} onChange={() => void onUpdate(photo.id, { usageScopes: checked ? photo.usage_scopes.filter((item) => item !== scope.id) : [...photo.usage_scopes, scope.id] }, "使用范围已更新。") } type="checkbox" />{scope.label}</label>;
                    })}
                  </div>
                  {(photo.quality_json.warnings ?? []).map((warning) => <p className="avatarVisualWarning" key={warning}>{warning}</p>)}
                  <div className="avatarVisualActions">
                    {!photo.is_primary && photo.status === "active" ? <button disabled={photoBusy} onClick={() => void onUpdate(photo.id, { isPrimary: true }, "主形象已更新。")}>设为主形象</button> : null}
                    <button disabled={photoBusy} onClick={() => void onUpdate(photo.id, { status: photo.status === "active" ? "disabled" : "active" }, photo.status === "active" ? "形象照已停用。" : "形象照已启用。")}>{photo.status === "active" ? "停用" : "启用"}</button>
                    <button className="danger" disabled={photoBusy} onClick={() => void onDelete(photo.id)}>删除</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="avatarVisualEmpty"><strong>还没有形象照</strong><p>建议先上传 1 张正面照、1 张职业半身照和 1 张自然生活照。</p></div>
      )}
      <p className="avatarVisualFootnote">最多保存 8 张。上传时会统一方向、移除 EXIF，并限制为安全尺寸；不会根据面部推断年龄、性格、职业或健康信息。</p>
    </section>
  );
}

function OverviewView({ workspace, maturity, onOpenTab }: { workspace: AvatarWorkspace | null; maturity: ReturnType<typeof calculateMaturity>; onOpenTab: (tab: AvatarTab) => void }) {
  const snapshot = workspace?.profile?.snapshot;
  const pending = workspace?.proposals.filter((item) => item.status === "pending") ?? [];
  const maturityTips = buildMaturityTips(workspace, maturity);
  return (
    <div className="avatarOverviewGrid">
      <section className="avatarOverviewMain">
        <div className="avatarSectionHeader"><div><span>成熟度模型</span><h2>分身对你的理解</h2><p>不是问卷完成率，而是能够真实参与创作的有效信息。</p></div><a href={appPath("/questionnaire")}>重新测评与补充</a></div>
        <div className="avatarMaturityGrid">{maturity.dimensions.map((item) => <article key={item.key}><div><strong>{item.label}</strong><span>{item.value}%</span></div><div><span style={{ width: `${item.value}%` }} /></div><p>{item.hint}</p></article>)}</div>
        <div className="avatarProfileDigest">
          <div><span>个人定位</span><strong>{workspace?.profile?.summary.positioning_hint || "补充经历和专业优势后生成"}</strong></div>
          <div><span>核心客群</span><strong>{workspace?.profile?.summary.audience_hint || "补充真实客户和高频问题后生成"}</strong></div>
          <div><span>表达方式</span><strong>{workspace?.profile?.summary.style_hint || "完成表达偏好和内容样本后生成"}</strong></div>
        </div>
      </section>
      <aside className="avatarOverviewAside">
        <section>
          <div className="avatarSectionHeader compact"><div><span>下一步建议</span><h2>怎么提升分身成熟度</h2></div></div>
          <div className="avatarMaturityTips">
            {maturityTips.map((tip) => (
              <button className="avatarMaturityTip" key={tip.title} onClick={() => onOpenTab(tip.tab)} type="button">
                <strong>{tip.title}</strong>
                <span>{tip.description}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="avatarSectionHeader compact"><div><span>进化动态</span><h2>待确认建议</h2></div><button onClick={() => onOpenTab("evolution")}>{pending.length} 条</button></div>
          {pending.slice(0, 2).map((item) => <button className="avatarProposalPreview" key={item.id} onClick={() => onOpenTab("evolution")}><strong>{item.title}</strong><span>{item.description}</span></button>)}
          {pending.length === 0 ? <p className="avatarAsideEmpty">继续使用和反馈后，小谷会提出可解释的进化建议。</p> : null}
        </section>
        {snapshot?.mbti_profile ? <MbtiProfilePanel profile={snapshot.mbti_profile} /> : <section className="avatarMbtiEmpty"><span>MBTI 表达偏好</span><h2>尚未完成 32 题测评</h2><p>测评用于调整表达方式，不作为心理诊断或官方 MBTI® 结论。</p><a href={appPath("/questionnaire")}>开始测评</a></section>}
      </aside>
    </div>
  );
}

function VersionsView({ versions, privacy, onAction }: { versions: AvatarVersion[]; privacy: AvatarPrivacySettings; onAction: (body: Record<string, unknown>, message: string) => Promise<boolean> }) {
  function update(key: keyof AvatarPrivacySettings, value: boolean) {
    const next = { ...privacy, [key]: value };
    void onAction({ action: "privacy", learningEnabled: next.learning_enabled, behaviorLearningEnabled: next.behavior_learning_enabled, customerMemoryEnabled: next.customer_memory_enabled, autoInferenceEnabled: next.auto_inference_enabled, visualCreationEnabled: next.visual_creation_enabled }, "隐私设置已更新。");
  }
  return <section className="avatarVersionsGrid"><div className="avatarSinglePanel"><div className="avatarSectionHeader"><div><span>版本时间线</span><h2>每次进化都可以回退</h2><p>接受进化建议后自动创建新版本。</p></div></div><div className="avatarVersionList">{versions.map((version) => <article key={version.id}><div><strong>V{version.version} · {version.label || "数字分身"}</strong><span>{formatDate(version.created_at)}</span></div><p>{version.change_summary || "分身画像与记忆快照"}</p><em>{version.status === "active" ? "当前版本" : version.status === "restored" ? "已恢复" : "历史版本"}</em>{version.status !== "active" ? <button onClick={() => void onAction({ action: "restore-version", versionId: version.id }, `已恢复到 V${version.version}。`)}>恢复此版本</button> : null}</article>)}{versions.length === 0 ? <div className="avatarEmptyState"><strong>当前还没有版本记录</strong><p>第一次接受进化建议后会创建 V1。</p></div> : null}</div></div><aside className="avatarPrivacyPanel"><div className="avatarSectionHeader compact"><div><span>隐私控制</span><h2>记忆如何被使用</h2></div></div><PrivacyToggle label="允许数字分身学习" detail="关闭后停止新增学习，但保留现有记忆" checked={privacy.learning_enabled} onChange={(value) => update("learning_enabled", value)} /><PrivacyToggle label="从修改行为学习" detail="根据你对作品的修改生成进化建议" checked={privacy.behavior_learning_enabled} onChange={(value) => update("behavior_learning_enabled", value)} /><PrivacyToggle label="允许客户记忆" detail="默认关闭；即使开启也应只保存脱敏信息" checked={privacy.customer_memory_enabled} onChange={(value) => update("customer_memory_enabled", value)} /><PrivacyToggle label="允许 AI 推断候选记忆" detail="推断只进入待确认区，不直接成为事实" checked={privacy.auto_inference_enabled} onChange={(value) => update("auto_inference_enabled", value)} /><PrivacyToggle label="允许图片创作调用形象照" detail="关闭后保留照片，但新任务不再读取" checked={privacy.visual_creation_enabled} onChange={(value) => update("visual_creation_enabled", value)} /><p>客户身份证件、联系方式、健康资料和完整保单默认不进入长期记忆。</p></aside></section>;
}

function PrivacyToggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="avatarPrivacyToggle"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function FeedbackActions({ onFeedback }: { onFeedback: (eventType: string) => void }) {
  return <div className="avatarFeedbackActions"><button onClick={() => onFeedback("more-like-me")}>更像我</button><button onClick={() => onFeedback("too-salesy")}>太销售</button><button onClick={() => onFeedback("too-formal")}>太正式</button><button onClick={() => onFeedback("remember-style")}>记住这种表达</button></div>;
}

function AvatarCoachView({
  busy, thinkingStep, streamingContent, conversations, messages, input, nextSteps, profilePrompt, inputRef, onChangeInput, onSubmit, onPrompt, onOpenConversation, onOpenProfile, onNew,
}: {
  busy: string; thinkingStep: number; streamingContent: string; conversations: AvatarCoachConversation[]; messages: AvatarCoachMessage[]; input: string; nextSteps: CoachNextStep[]; profilePrompt: boolean; inputRef: RefObject<HTMLTextAreaElement | null>;
  onChangeInput: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; onPrompt: (prompt: string) => void; onOpenConversation: (id: string) => Promise<void>; onOpenProfile: () => void; onNew: () => void;
}) {
  const quickPrompts = [
    { label: "帮我判断当前增长卡点", text: "请结合我的数字分身，帮我判断当前最可能的内容增长卡点，并告诉我本周最值得先做的一步。" },
    { label: "给我本周创作计划", text: "根据我的定位和目标客户，帮我安排本周可执行的内容计划。" },
    { label: "找 6 个获客选题", text: "根据我的目标客户，给我 6 个兼顾信任与有效咨询的选题方向。" },
    { label: "设计获客承接", text: "我想让内容带来更多有效咨询，请帮我设计一条合规、自然的评论和私信承接路径。" },
  ];
  return <section className="avatarCoachView" id="avatar-coach">
    <aside className="avatarCoachSidebar">
      <div className="avatarCoachMentor" aria-hidden="true"><div className="avatarCoachFairy"><Image alt="" height={162} priority src="/avatars/xiaogu-fairy.png" width={108} /></div><i>加油噢！</i></div>
      <div><span>小谷精灵 · 创作教练</span><h2>今天，先做最重要的一步</h2><p>小谷会结合你的分身画像、内容目标与已确认偏好，给出有依据的建议。</p></div>
      <div className="avatarCoachHistory"><div><strong>最近咨询</strong>{messages.length ? <button className="avatarCoachNewChat" onClick={onNew} type="button"><i>＋</i>开启新咨询</button> : null}</div>{conversations.length ? conversations.slice(0, 4).map((item) => <button key={item.id} onClick={() => void onOpenConversation(item.id)} type="button"><b>{item.title.replace("分身咨询｜", "")}</b><span>{formatDate(item.updated_at)} · {item.message_count} 条消息</span></button>) : <p>从一次真实困惑开始，小谷会持续理解你的创作方式。</p>}</div>
    </aside>
    <div className="avatarCoachMain">
      {messages.length === 0 ? <div className="avatarCoachWelcome"><strong>不必选功能，直接告诉我你现在遇到的真实问题</strong><p>例如“内容有收藏但没有咨询”“我不知道这周该写什么”或“以后不要用焦虑营销”。</p><div>{quickPrompts.map((prompt) => <button key={prompt.label} onClick={() => onPrompt(prompt.text)} type="button">{prompt.label}</button>)}</div></div> : <div className="avatarCoachMessages">{messages.map((item) => <CoachMessage key={item.id} message={item} />)}{busy === "coach" ? <CoachThinkingIndicator step={thinkingStep} /> : null}{streamingContent ? <CoachMessage message={{ id: "streaming", role: "assistant", content: streamingContent, created_at: "" }} /> : null}</div>}
      {nextSteps.length ? <div className="avatarCoachFollowups"><strong>教练建议 · 下一步直接做</strong><div>{nextSteps.map((step) => <a href={appPath(step.href)} key={step.href}><span><b>{step.title}</b><small>{step.description}</small></span><em>去完成 →</em></a>)}</div>{profilePrompt ? <p>想让后续建议更贴近你的实际业务？<button onClick={onOpenProfile} type="button">补充一条客户问题</button></p> : null}</div> : null}
      <form className="avatarCoachComposer" onSubmit={(event) => void onSubmit(event)}>
        <textarea ref={inputRef} value={input} onChange={(event) => onChangeInput(event.target.value)} placeholder="直接说你的真实情况。小谷会自动判断你需要选题、复盘、获客建议还是更新分身。" />
        <button className="primaryButton" disabled={busy === "coach" || input.trim().length < 2} type="submit">{busy === "coach" ? "小谷思考中" : "发送咨询"}</button>
      </form>
      <p className="avatarCoachSafety">请勿输入客户身份证件、联系方式、健康资料或完整保单号。小谷不会自动发送内容或修改你的长期画像。</p>
    </div>
  </section>;
}

function CoachThinkingIndicator({ step }: { step: number }) {
  const steps = ["梳理你当前遇到的内容或业务症状", "对照你的定位、目标客户和表达习惯", "判断最值得优先尝试的增长动作"];
  return <article className="assistant coachThinking"><span>小谷精灵正在分析</span><div>{steps.map((item, index) => <p className={index <= step ? "active" : ""} key={item}><i>{index < step ? "✓" : index === step ? "·" : ""}</i>{item}</p>)}</div></article>;
}

function CoachMessage({ message }: { message: AvatarCoachMessage }) {
  if (message.role === "user") return <article className="user"><span>你</span><p>{message.content}</p></article>;
  const sections = parseCoachResponse(message.content);
  return <article className="assistant coachAnswer"><span>小谷精灵</span><div className="coachAnswerBody">{sections.map((section) => <section key={`${section.title}-${section.content}`}><h3>{section.title}</h3><ReactMarkdown>{section.content}</ReactMarkdown></section>)}</div></article>;
}

function parseCoachResponse(content: string) {
  const titles = ["我的判断", "为什么这样判断", "下一步行动"];
  const matcher = new RegExp(`【(${titles.join("|")})】`, "g");
  const matches = [...content.matchAll(matcher)];
  if (matches.length === 0) return [{ title: "小谷的建议", content }];
  return matches.map((match, index) => ({ title: match[1], content: content.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index).trim() || "—" }));
}

function MbtiProfilePanel({ profile }: { profile: NonNullable<ThinkingProfileSnapshot["mbti_profile"]> }) {
  return <section className="avatarMbtiPanel"><div><span>MBTI 表达偏好</span><strong>{profile.type}</strong><em>清晰度 {profile.confidence}%</em></div><p>{profile.completedQuestions}/{profile.totalQuestions ?? 32} 题 · 四维偏好测评</p><div>{Object.entries(profile.dimensions).map(([key, dimension]) => <article key={key}><span>{dimension.left} {dimension.leftPercent}%</span><div><i style={{ width: `${dimension.leftPercent}%` }} /></div><span>{dimension.rightPercent}% {dimension.right}</span></article>)}</div><small>非官方 MBTI® 测评，仅用于内容表达偏好，不作为心理诊断。</small></section>;
}

function calculateMaturity(workspace: AvatarWorkspace | null) {
  const snapshot = workspace?.profile?.snapshot;
  const memories = workspace?.memories.filter((item) => item.status === "active") ?? [];
  const count = (category: AvatarMemoryCategory) => memories.filter((item) => item.category === category).length;
  const dimensions = [
    { key: "identity", label: "身份认知", value: score(Boolean(snapshot?.identity_profile.career_path), snapshot?.identity_profile.core_identity.length ?? 0, count("identity")), hint: "经历、角色与可信度来源" },
    { key: "audience", label: "客户理解", value: score(Boolean(snapshot?.audience_profile.primary_audience), snapshot?.audience_profile.common_questions.length ?? 0, count("audience")), hint: "真实客群、问题与决策障碍" },
    { key: "expertise", label: "专业知识", value: score(Boolean(snapshot?.content_motifs.pillar_topics.length), snapshot?.belief_system.believes.length ?? 0, count("expertise")), hint: "擅长领域、理念与判断框架" },
    { key: "expression", label: "表达风格", value: score(Boolean(snapshot?.expression_style.style_summary), snapshot?.expression_style.tone.length ?? 0, count("expression")), hint: "语气、节奏、结构与转化方式" },
    { key: "story", label: "内容案例", value: score(Boolean(snapshot?.trust_signals.personal_story_anchor), snapshot?.trust_signals.case_signals.length ?? 0, count("story")), hint: "个人故事、案例与事实证据" },
    { key: "boundary", label: "合规边界", value: score(Boolean(snapshot?.belief_system.disbelieves.length), snapshot?.content_motifs.taboo_angles.length ?? 0, count("boundary")), hint: "禁用表达、隐私和合规要求" },
  ];
  return { overall: Math.round(dimensions.reduce((sum, item) => sum + item.value, 0) / dimensions.length), dimensions };
}

function buildMaturityTips(workspace: AvatarWorkspace | null, maturity: ReturnType<typeof calculateMaturity>) {
  const snapshot = workspace?.profile?.snapshot;
  const tips: Array<{ title: string; description: string; tab: AvatarTab }> = [];

  if (!snapshot?.trust_signals.personal_story_anchor || (snapshot.trust_signals.case_signals?.length ?? 0) < 2) {
    tips.push({
      title: "补 1-2 个真实案例",
      description: "去“学习资料”或“我的记忆”补充脱敏客户故事，能最快提升内容案例成熟度。",
      tab: "sources",
    });
  }

  if ((workspace?.sources.length ?? 0) < 2) {
    tips.push({
      title: "添加你的原文资料",
      description: "上传朋友圈、文章或录音整理稿，让分身学到你的真实表达，而不只是一份问卷摘要。",
      tab: "sources",
    });
  }

  if ((workspace?.photos.length ?? 0) === 0) {
    tips.push({
      title: "上传形象照",
      description: "补 1 张正面照和 1 张职业半身照后，做图、名片和封面会更像你本人。",
      tab: "visual",
    });
  }

  if ((workspace?.usage.count ?? 0) === 0) {
    tips.push({
      title: "先试写 1 个常用主题",
      description: "去“分身试验室”跑一次对比生成，最容易判断它目前像不像你。",
      tab: "lab",
    });
  }

  if ((workspace?.proposals.filter((item) => item.status === "pending").length ?? 0) > 0) {
    tips.push({
      title: "处理待确认进化建议",
      description: "接受或忽略这些建议后，分身会形成更稳定的新版本。",
      tab: "evolution",
    });
  }

  const weakest = [...maturity.dimensions].sort((a, b) => a.value - b.value)[0];
  if (weakest?.key === "audience") {
    tips.push({
      title: "补充客户高频问题",
      description: "把客户最常问的原话和真实顾虑再补几条，分身会更懂你的目标客群。",
      tab: "memory",
    });
  } else if (weakest?.key === "expression") {
    tips.push({
      title: "补一段最像你的表达",
      description: "补充你常用的措辞、结构和不喜欢的说法，能明显减少 AI 味。",
      tab: "memory",
    });
  } else if (weakest?.key === "boundary") {
    tips.push({
      title: "明确不能替你说的话",
      description: "把不能承诺、不能夸大、不能制造焦虑的表达写进边界，合规和像你都会更稳。",
      tab: "memory",
    });
  }

  if (tips.length < 3) {
    tips.push({
      title: "持续使用并反馈",
      description: "每次用完在试验室或作品里判断“更像我/太销售/太正式”，系统才会持续进化。",
      tab: "lab",
    });
  }

  return tips.slice(0, 4);
}

function score(hasCore: boolean, evidenceCount: number, memoryCount: number) {
  return Math.min(100, (hasCore ? 45 : 0) + Math.min(30, evidenceCount * 8) + Math.min(25, memoryCount * 8));
}

function originLabel(origin: AvatarMemoryItem["origin"]) {
  return ({ user: "本人确认", imported: "资料提取", behavior: "行为学习", inferred: "AI 推断", system: "系统生成" } as const)[origin];
}

function sourceTypeLabel(type: string) {
  return ({ article: "文章", moments: "朋友圈", transcript: "录音稿", story: "个人故事", manual: "手动资料" } as Record<string, string>)[type] ?? type;
}

function formatDate(value?: string | null) {
  if (!value) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
