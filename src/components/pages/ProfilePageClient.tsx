"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
};

type AvatarTab = "overview" | "memory" | "visual" | "evolution" | "lab" | "sources" | "versions";

const tabs: Array<{ id: AvatarTab; label: string; description: string }> = [
  { id: "overview", label: "分身主页", description: "成熟度与当前状态" },
  { id: "memory", label: "我的记忆", description: "查看和管理长期记忆" },
  { id: "visual", label: "形象资产", description: "管理可复用的本人照片" },
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
  const [activeTab, setActiveTab] = useState<AvatarTab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [memoryDraft, setMemoryDraft] = useState<{ category: AvatarMemoryCategory; title: string; content: string }>({ category: "identity", title: "", content: "" });
  const [sourceDraft, setSourceDraft] = useState({ sourceType: "article", title: "", content: "" });
  const [labPrompt, setLabPrompt] = useState("");
  const [labResult, setLabResult] = useState<{ avatarText: string; baselineText: string } | null>(null);
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

  return (
    <div className="avatarConsolePage">
      <section className="avatarConsoleHero">
        <p className="avatarConsoleVision">让小谷理解并记住你的经验、判断与表达方式，把它们沉淀成可长期复用的个人内容资产，让每一次创作都更像你。</p>
        <div className="avatarConsoleIdentity">
          {primaryPhoto ? <img alt={`${displayName}的主形象`} className="avatarConsolePhoto" src={primaryPhoto.content_url} /> : <div className="avatarConsoleMark" aria-hidden="true">AI</div>}
          <div>
            <div className="avatarConsoleMeta">
              <span>{loading ? "同步中" : "分身在线"}</span>
              <em>V{workspace?.versions[0]?.version ?? workspace?.profile?.version ?? 1}</em>
            </div>
            <h1>{displayName}</h1>
            <p>{workspace?.profile?.summary.one_liner || "持续记住你的经历、客户和表达方式，并在确认后不断进化。"}</p>
          </div>
        </div>
        <div className="avatarHeroStats">
          <div><strong>{maturity.overall}%</strong><span>分身成熟度</span></div>
          <div><strong>{activeMemories.length}</strong><span>长期记忆</span></div>
          <div><strong>{workspace?.usage.count ?? 0}</strong><span>应用次数</span></div>
          <div><strong>{workspace?.photos.length ?? 0}/8</strong><span>形象资料</span></div>
        </div>
        <div className="avatarHeroActions">
          <button className="secondaryButton" onClick={() => setActiveTab("lab")} type="button">测试分身</button>
          <button className="primaryButton" onClick={() => setActiveTab("memory")} type="button">添加记忆</button>
        </div>
      </section>

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

      {activeTab === "overview" ? (
        <OverviewView maturity={maturity} workspace={workspace} onOpenTab={setActiveTab} />
      ) : null}

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
