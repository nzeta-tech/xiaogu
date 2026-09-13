"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  AvatarContactCard,
} from "@/lib/avatar/types";
import type { ThinkingProfileSnapshot, ThinkingProfileSummary } from "@/lib/thinking/profile-snapshot";
import type { DigitalHumanAsset, DigitalHumanProvider, DigitalHumanTemplate, DigitalHumanVoice } from "@/lib/digital-human/types";
import { chanjingCreationReferenceSamples } from "@/lib/digital-human/creation-reference-samples";

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

type AvatarTab = "overview" | "memory" | "visual" | "contact" | "evolution" | "sources" | "versions";

const tabs: Array<{ id: AvatarTab; label: string; description: string }> = [
  { id: "overview", label: "分身主页", description: "成熟度与当前状态" },
  { id: "memory", label: "我的记忆", description: "查看和管理长期记忆" },
  { id: "visual", label: "形象资产", description: "照片、数字人模板与声音库" },
  { id: "contact", label: "联系名片", description: "二维码与发布署名" },
  { id: "evolution", label: "进化中心", description: "确认分身如何改变" },
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
    if (typeof window === "undefined") return "overview";
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (requestedTab && tabs.some((tab) => tab.id === requestedTab)) return requestedTab as AvatarTab;
    return "overview";
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [memoryFilter, setMemoryFilter] = useState("all"); const [memorySearch, setMemorySearch] = useState("");
  const [proposalFilter, setProposalFilter] = useState("all"); const [proposalSearch, setProposalSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all"); const [sourceSearch, setSourceSearch] = useState("");
  const [memoryDraft, setMemoryDraft] = useState<{ category: AvatarMemoryCategory; title: string; content: string; sourceLabel: string; memoryScope: string }>({ category: "identity", title: "", content: "", sourceLabel: "手动录入", memoryScope: "global" });
  const [sourceDraft, setSourceDraft] = useState({ sourceType: "article", title: "", content: "", sourceLabel: "手动录入", memoryScope: "global" });
  const [contactDraft, setContactDraft] = useState({ displayName: "", organization: "", callToAction: "扫码联系我", serviceMotto: "保险不是推销，是长期的守护", phone: "", email: "", businessCardStyle: "classic" as "classic" | "emerald" | "editorial" | "ivory" | "garden" | "lavender", defaultQrCodeId: null as string | null });
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
    <div className="avatarConsolePage">
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
          <div className="avatarHeroActions"><a className="primaryButton" href={appPath("/workbuddy")}>交给 Workbuddy</a><div className="avatarHeroSecondaryActions"><button onClick={() => setActiveTab("memory")} type="button">完善记忆</button><i>·</i><button onClick={() => setActiveTab("sources")} type="button">补充学习资料</button></div></div>
          <p className="avatarHeroContext">小谷已参考：{activeMemories.length ? `${activeMemories.length} 条长期记忆、你的表达偏好与目标客户` : "待完善的个人画像"}<button onClick={() => setActiveTab("memory")} type="button">查看画像</button></p>
        </section>
        <OverviewView maturity={maturity} workspace={workspace} onOpenTab={setActiveTab} />
      </> : null}

      {activeTab === "memory" ? (
        <section className="avatarViewLayout">
          <div className="avatarViewMain">
            <div className="avatarSectionHeader"><div><span>长期记忆</span><h2>小谷现在记住了什么</h2><p>推断内容会显示来源和可信度，你可以确认、停用或删除。</p></div></div>
            {candidateMemories.length > 0 ? (
              <div className="avatarCandidateBanner"><strong>{candidateMemories.length} 条候选记忆待确认</strong><span>小谷推断不会在确认前进入正式创作上下文。</span></div>
            ) : null}
            <RecordFilters value={memoryFilter} onValue={setMemoryFilter} search={memorySearch} onSearch={setMemorySearch} options={[["active","启用"],["candidate","暂停"],["archived","归档"]]} />
            <div className="avatarMemoryGroups">
              {(Object.keys(categoryMeta) as AvatarMemoryCategory[]).map((category) => {
                const items = workspace?.memories.filter((item) => item.category === category && (memoryFilter === "all" || item.status === memoryFilter) && `${item.title} ${item.content} ${item.metadata_json?.sourceLabel ?? ""}`.toLowerCase().includes(memorySearch.toLowerCase())) ?? [];
                return (
                  <section className="avatarMemoryGroup" key={category}>
                    <div className="avatarMemoryGroupHeader"><div><h3>{categoryMeta[category].label}</h3><p>{categoryMeta[category].description}</p></div><span>{items.length}</span></div>
                    <div className="avatarMemoryList">
                      {items.map((item) => (
                        <article className={`avatarMemoryItem ${item.status}`} key={item.id}>
                          <div><strong>{item.title || categoryMeta[category].label}</strong><p>{item.content}</p></div>
                          <div className="avatarMemoryItemMeta"><span>{item.metadata_json?.sourceLabel ?? originLabel(item.origin)}</span><span>{memoryScopeLabel(item.metadata_json?.memoryScope)}</span><span>可信度 {item.confidence}%</span><span>{item.usage_scope === "private" ? "仅自己可见" : "参与创作"}</span></div>
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
              <label>来源<input value={memoryDraft.sourceLabel} onChange={(event) => setMemoryDraft((current) => ({ ...current, sourceLabel: event.target.value }))} /></label>
              <label>作用域<MemoryScopeSelect value={memoryDraft.memoryScope} onChange={(memoryScope) => setMemoryDraft((current) => ({ ...current, memoryScope }))} /></label>
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
          <RecordFilters value={proposalFilter} onValue={setProposalFilter} search={proposalSearch} onSearch={setProposalSearch} options={[["pending","待确认"],["accepted","已采用"],["rejected","已忽略"]]} />
          <div className="avatarProposalList">
            {(workspace?.proposals ?? []).filter((proposal) => (proposalFilter === "all" || proposal.status === proposalFilter) && `${proposal.title} ${proposal.description}`.toLowerCase().includes(proposalSearch.toLowerCase())).map((proposal) => (
              <article className={`avatarProposal ${proposal.status}`} key={proposal.id}>
                <div className="avatarProposalTop"><div><span>{categoryMeta[proposal.category as AvatarMemoryCategory]?.label ?? proposal.category}</span><h3>{proposal.title}</h3><small>来源：{String(proposal.patch_json.sourceLabel ?? "进化建议")} · {formatDate(proposal.created_at)}</small></div><strong>{proposal.confidence}% 可信</strong></div>
                <div className="avatarProposalReport"><ReactMarkdown>{proposal.description}</ReactMarkdown></div>
                <ul>{proposal.evidence_json.map((item) => <li key={item}>{item}</li>)}</ul>
                {proposal.status === "pending" ? <div><button className="primaryButton" onClick={() => void performAction({ action: "resolve-proposal", proposalId: proposal.id, decision: "accepted" }, "风格报告已确认，训练资料将参与后续内容生成。")}>{proposal.patch_json.sourceId ? "确认并用于创作" : "接受并进化"}</button><button className="secondaryButton" onClick={() => void performAction({ action: "resolve-proposal", proposalId: proposal.id, decision: "rejected" }, "进化建议已忽略。")}>忽略</button></div> : <em>{proposal.status === "accepted" ? "已接受" : "已忽略"}</em>}
              </article>
            ))}
            {(workspace?.proposals.length ?? 0) === 0 ? <div className="avatarEmptyState"><strong>还没有进化建议</strong><p>在分身试验室评价结果，或在作品中持续反馈，小谷会在发现稳定模式后提出建议。</p></div> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "sources" ? (
        <section className="avatarViewLayout">
          <div className="avatarViewMain avatarSinglePanel">
            <div className="avatarSectionHeader"><div><span>学习资料</span><h2>数字分身的知识来源</h2><p>每份资料都可单独停用。敏感客户信息不要直接上传。</p></div></div>
            <RecordFilters value={sourceFilter} onValue={setSourceFilter} search={sourceSearch} onSearch={setSourceSearch} options={[["active","启用"],["disabled","暂停"],["archived","归档"]]} />
            <div className="avatarSourceList">
              {(workspace?.sources ?? []).filter((source) => (sourceFilter === "all" || source.status === sourceFilter) && `${source.title} ${source.content} ${source.metadata_json?.sourceLabel ?? ""}`.toLowerCase().includes(sourceSearch.toLowerCase())).map((source) => <article key={source.id}><div><span>{sourceTypeLabel(source.source_type)}</span><h3>{source.title}</h3><p>{source.content}</p><small>来源：{source.metadata_json?.sourceLabel ?? sourceTypeLabel(source.source_type)} · {formatDate(source.created_at)}</small></div><div><em>{source.status === "active" ? "参与学习" : source.status === "archived" ? "已归档" : "已停用"}</em><button onClick={() => void performAction({ action: "set-source-status", sourceId: source.id, status: source.status === "active" ? "disabled" : "active" }, source.status === "active" ? "资料已停用。" : "资料已启用。")}>{source.status === "active" ? "停用" : "启用"}</button><button className="danger" onClick={() => void performAction({ action: "set-source-status", sourceId: source.id, status: "archived" }, "资料已归档。")}>归档</button></div></article>)}
              {(workspace?.sources.length ?? 0) === 0 ? <div className="avatarEmptyState"><strong>还没有学习资料</strong><p>可以添加你认可的文章、朋友圈、录音整理稿和个人故事。</p></div> : null}
            </div>
          </div>
          <aside className="avatarViewAside">
            <form className="avatarSideForm" onSubmit={addSource}><div><span>手动添加</span><h2>补充你的原文</h2></div><label>资料类型<select value={sourceDraft.sourceType} onChange={(event) => setSourceDraft((current) => ({ ...current, sourceType: event.target.value }))}><option value="article">文章</option><option value="moments">朋友圈</option><option value="transcript">录音整理稿</option><option value="story">个人故事</option><option value="douyin">抖音作品资料</option><option value="manual">其他资料</option></select></label><label>来源<input value={sourceDraft.sourceLabel} onChange={(event) => setSourceDraft((current) => ({ ...current, sourceLabel: event.target.value }))} /></label><label>作用域<MemoryScopeSelect value={sourceDraft.memoryScope} onChange={(memoryScope) => setSourceDraft((current) => ({ ...current, memoryScope }))} /></label><label>标题<input value={sourceDraft.title} onChange={(event) => setSourceDraft((current) => ({ ...current, title: event.target.value }))} required /></label><label>正文<textarea value={sourceDraft.content} onChange={(event) => setSourceDraft((current) => ({ ...current, content: event.target.value }))} placeholder="至少 20 个字" required /></label><button className="primaryButton" disabled={busy === "add-source" || sourceDraft.content.trim().length < 20}>添加学习资料</button></form>
          </aside>
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

function MemoryScopeSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}><option value="global">全局</option><option value="short_video">短视频通用（视频号/抖音）</option><option value="marketing">营销转化</option><option value="customer">客户沟通</option></select>;
}

function memoryScopeLabel(value?: string) {
  return ({ global: "全局", short_video: "短视频通用", marketing: "营销转化", customer: "客户沟通" } as Record<string, string>)[value ?? "global"] ?? "全局";
}

function RecordFilters({ value, onValue, search, onSearch, options }: { value: string; onValue: (value: string) => void; search: string; onSearch: (value: string) => void; options: Array<[string, string]> }) {
  return <div className="avatarRecordFilters"><div>{[["all", "全部"], ...options].map(([id, label]) => <button className={value === id ? "active" : ""} key={id} onClick={() => onValue(id)} type="button">{label}</button>)}</div><input onChange={(event) => onSearch(event.target.value)} placeholder="搜索标题、内容或来源" value={search} /></div>;
}

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
  useEffect(() => {
    // Reconcile selections after the remotely loaded contact card changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewQrIds((current) => { const valid = current.filter((id) => card?.qr_codes.some((qr) => qr.id === id)); if (valid.length) return valid; return card?.default_qr_code_id ? [card.default_qr_code_id] : card?.qr_codes[0] ? [card.qr_codes[0].id] : []; });
  }, [card?.default_qr_code_id, card?.qr_codes]);
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
  const [assetSection, setAssetSection] = useState<"photos" | "digital-humans">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("asset") === "digital-humans" ? "digital-humans" : "photos");
  return (
    <section className="avatarVisualView">
      <div className="avatarVisualHeader">
        <div><span>视觉身份</span><h2>我的形象资产</h2><p>{assetSection === "photos" ? "保存本人已授权的照片，在图片应用中按次选择。" : "管理用于口播视频的小谷数字分身。"}</p></div>
        {assetSection === "photos" ? <label className="avatarVisualUploadButton">
          {busy === "upload-photos" ? "处理中..." : "上传形象照"}
          <input accept="image/jpeg,image/png,image/webp" disabled={busy === "upload-photos" || photos.length >= 8} multiple onChange={(event) => { void onUpload(event.target.files); event.currentTarget.value = ""; }} type="file" />
        </label> : null}
      </div>

      <div className="avatarAssetSectionTabs" role="tablist" aria-label="形象资产类型">
        <button aria-selected={assetSection === "photos"} className={assetSection === "photos" ? "active" : ""} onClick={() => setAssetSection("photos")} role="tab" type="button"><strong>形象照片</strong><span>{photos.length} 张 · 用于图片创作</span></button>
        <button aria-selected={assetSection === "digital-humans"} className={assetSection === "digital-humans" ? "active" : ""} onClick={() => setAssetSection("digital-humans")} role="tab" type="button"><strong>视频数字人</strong><span>我的数字分身 · 用于口播视频</span></button>
      </div>

      {assetSection === "photos" ? <>
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
      </> : <DigitalHumanAssetsPanel />}
    </section>
  );
}

function DigitalHumanAssetsPanel() {
  const [assets, setAssets] = useState<DigitalHumanAsset[]>([]);
  const [providers, setProviders] = useState<Record<DigitalHumanProvider, boolean>>({ heygen: false, chanjing: false });
  const [provider, setProvider] = useState<DigitalHumanProvider>("chanjing"); const [name, setName] = useState(""); const [file, setFile] = useState<File | null>(null); const [consent, setConsent] = useState(false);
  const [replaceBackground, setReplaceBackground] = useState(true); const [quality, setQuality] = useState<"standard" | "high">("standard"); const [trainType, setTrainType] = useState<"figure" | "both">("both"); const [language, setLanguage] = useState<"cn" | "en">("cn"); const [continueWithoutVoice, setContinueWithoutVoice] = useState(false);
  const [manageMode, setManageMode] = useState<"new" | "voices" | "templates" | null>(() => {
    if (typeof window === "undefined") return "new";
    const requested = new URLSearchParams(window.location.search).get("digitalHumanTab");
    return requested === "templates" ? "templates" : requested === "voices" ? "voices" : "new";
  });
  const [creationLane, setCreationLane] = useState<"mine" | "public">("mine");
  const [generatedPhotoMode, setGeneratedPhotoMode] = useState(false);
  const [upgradeIdentityId,setUpgradeIdentityId]=useState("");
  const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [previewAsset, setPreviewAsset] = useState<DigitalHumanAsset | null>(null);
  const [looksAsset, setLooksAsset] = useState<DigitalHumanAsset | null>(null);
  async function load() { try { const response = await fetch(apiPath("/api/avatar/digital-humans")); const text = await response.text(); const payload = text ? JSON.parse(text) as { assets?: DigitalHumanAsset[]; providers?: Record<DigitalHumanProvider, boolean> } : null; if (response.ok && payload) { setAssets(payload.assets ?? []); setProviders(payload.providers ?? { heygen: false, chanjing: false }); } else if (!response.ok) setError("数字人资产暂时无法加载"); } catch { setError("数字人资产服务返回异常，请稍后重试"); } }
  useEffect(() => { void Promise.resolve().then(() => load()); }, []);
  useEffect(()=>{const id=new URLSearchParams(window.location.search).get("upgrade")||"";if(id){setUpgradeIdentityId(id);setProvider("heygen");setManageMode("new");setCreationLane("mine");}},[]);
  useEffect(()=>{if(upgradeIdentityId&&!name){const identity=assets.find(asset=>asset.id===upgradeIdentityId);if(identity)setName(identity.name);}},[assets,upgradeIdentityId,name]);
  useEffect(() => { const timer = window.setInterval(() => { if (assets.some((asset) => asset.status === "creating")) void load(); }, 8000); return () => window.clearInterval(timer); }, [assets]);
  async function create(event: FormEvent) { event.preventDefault(); if (!file) return; setBusy("create"); setError(""); setMessage(""); const form = new FormData(); form.append("name", name || assets.find(asset=>asset.id===upgradeIdentityId)?.name || "我的数字人"); form.append("consent", String(consent)); form.append("file", file); if(upgradeIdentityId)form.append("identityId",upgradeIdentityId); form.append("replaceBackground", String(replaceBackground)); form.append("quality", quality); form.append("trainType", trainType); form.append("language", language); form.append("continueWithoutVoice", String(continueWithoutVoice)); try { const response = await fetch(apiPath("/api/avatar/digital-humans"), { method: "POST", body: form }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "数字人创建失败"); setMessage(upgradeIdentityId?"Pro 版创建任务已提交，完成后会显示在同一个数字人下。":"创建任务已提交。系统会自动准备所选形象与声音能力。"); setName(""); setFile(null); setConsent(false); setUpgradeIdentityId(""); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "数字人创建失败"); } finally { setBusy(""); } }
  async function syncExisting() { setBusy("sync"); setError(""); setMessage(""); try { const response=await fetch(apiPath("/api/avatar/digital-humans/sync"),{method:"POST"}); const payload=await response.json() as {count?:number;error?:string}; if(!response.ok)throw new Error(payload.error||"同步失败"); setMessage(`已同步 ${payload.count||0} 个已有数字人。`); await load(); } catch(cause){setError(cause instanceof Error?cause.message:"同步失败");} finally{setBusy("");} }
  async function action(asset: DigitalHumanAsset, actionName: "refresh" | "retry" | "toggle" | "delete") { if (actionName === "delete" && !window.confirm(`删除「${asset.name}」？相关生成能力也会同步停用。`)) return; setBusy(asset.id); setError(""); try { const response = await fetch(apiPath(`/api/avatar/digital-humans${actionName === "delete" ? `?id=${asset.id}` : ""}`), { method: actionName === "delete" ? "DELETE" : "PATCH", headers: actionName === "delete" ? undefined : { "content-type": "application/json" }, body: actionName === "delete" ? undefined : JSON.stringify({ id: asset.id, action: actionName }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "操作失败"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); } finally { setBusy(""); } }
  return <section className="digitalHumanAssetsPanel"><div className="digitalHumanAssetsHeading"><div><span>视频身份资产</span><h3>{manageMode === "new" ? "我的数字人" : manageMode === "templates" ? "我的视频模板" : "声音库"}</h3><p>{manageMode === "new" ? "管理自己的数字分身和公共角色。" : manageMode === "templates" ? "管理已收藏的成片风格与内容结构。" : "查看数字人绑定声音，并管理克隆声音、收藏声音和公共声音。"}</p></div><a href={appPath("/apps/digital-human-video")}>去生成视频</a></div>
    <div className="digitalHumanAssetTabs" role="tablist"><button className={manageMode === "new" ? "active" : ""} onClick={() => setManageMode("new")} type="button">我的数字人</button><button className={manageMode === "templates" ? "active" : ""} onClick={() => setManageMode("templates")} type="button">视频模板</button><button className={manageMode === "voices" ? "active" : ""} onClick={() => setManageMode("voices")} type="button">声音库</button></div>
    {error ? <div className="alertPanel">{error}</div> : null}{message ? <div className="successPanel">{message}</div> : null}
    {upgradeIdentityId ? <div className="digitalHumanUpgradeNotice"><div><strong>升级数字人 Pro</strong><span>为「{assets.find(asset=>asset.id===upgradeIdentityId)?.name||"当前数字人"}」补充 Pro 版；上传清晰正面照片后，新版本仍归入同一个数字人身份。</span></div><button onClick={()=>setUpgradeIdentityId("")} type="button">取消升级</button></div>:null}
    {manageMode === "new" && assets.length ? <DigitalHumanEditionStrip assets={assets} /> : null}
    {manageMode === "new" ? <div className="digitalHumanAssetList">{assets.length ? assets.map((asset) => <article key={asset.id}>{asset.preview_image_url ? <button aria-label={`播放${asset.name}训练预览`} className="digitalHumanPreviewCover" disabled={!asset.preview_video_url} onClick={() => setPreviewAsset(asset)} type="button"><img alt={asset.name} src={asset.preview_image_url} />{asset.preview_video_url ? <span>▶ 训练预览</span> : null}</button> : <div className="digitalHumanAvatarFallback">{asset.name.slice(0, 1)}</div>}<section><span>{asset.metadata_json?.source === "chanjing_generated_photo" ? "文字生成数字人" : asset.source_type === "photo" ? "上传照片创建" : "视频高还原创建"}</span><strong>{asset.name}</strong><small>{asset.status === "ready" ? (asset.source_type === "video" ? "训练已完成；换背景效果请在生成视频时查看" : "已就绪") : asset.status === "creating" ? "正在准备形象能力" : asset.status === "disabled" ? "已停用" : asset.error_message || "创建失败"}</small></section><div>{asset.status === "ready" ? <button onClick={() => setLooksAsset(asset)} type="button">形象与声音</button> : null}{asset.preview_video_url ? <button onClick={() => setPreviewAsset(asset)} type="button">{asset.source_type === "video" ? "训练预览" : "形象预览"}</button> : asset.status === "failed" ? <button disabled={busy === asset.id} onClick={() => void action(asset, "retry")} type="button">重新创建</button> : <button disabled={busy === asset.id} onClick={() => void action(asset, "refresh")} type="button">刷新</button>}{["ready", "disabled"].includes(asset.status) ? <button disabled={busy === asset.id} onClick={() => void action(asset, "toggle")} type="button">{asset.status === "disabled" ? "启用" : "停用"}</button> : null}<button className="danger" disabled={busy === asset.id} onClick={() => void action(asset, "delete")} type="button">删除</button></div></article>) : <div className="avatarVisualEmpty"><strong>还没有数字人</strong><p>上传已授权的照片或视频，创建完成后即可反复生成口播视频。</p></div>}</div> : null}
    {looksAsset ? <DigitalHumanLookManager asset={looksAsset} onClose={() => setLooksAsset(null)} /> : null}
    {previewAsset?.preview_video_url ? <div className="digitalHumanPreviewModal" onClick={() => setPreviewAsset(null)} role="dialog" aria-modal="true" aria-label={`${previewAsset.name}形象预览`}><div onClick={(event) => event.stopPropagation()}><header><div><strong>{previewAsset.name}</strong><span>{previewAsset.metadata_json?.supports_remove_background === true ? "处理后的形象预览；透明或纯色背景表示人物已具备独立合成能力" : "当前形象的训练素材预览，可能与上传原片相同"}</span></div><button aria-label="关闭预览" onClick={() => setPreviewAsset(null)} type="button">×</button></header><video autoPlay controls playsInline preload="metadata" poster={previewAsset.preview_image_url || undefined} src={previewAsset.preview_video_url} /><footer><span>这里不是最终口播成片；数字人效果需用一段新文案生成后验证。</span></footer></div></div> : null}
    <div className="digitalHumanLibraryActions"><button className={manageMode === "new" ? "active" : ""} onClick={() => setManageMode((mode) => mode === "new" ? null : "new")} type="button">＋ 新增数字人</button><button className={manageMode === "templates" ? "active" : ""} onClick={() => setManageMode((mode) => mode === "templates" ? null : "templates")} type="button">管理视频模板</button><button className={manageMode === "voices" ? "active" : ""} onClick={() => setManageMode((mode) => mode === "voices" ? null : "voices")} type="button">管理声音库</button></div>
    {manageMode ? <div className="digitalHumanManageDrawer">{manageMode === "new" ? <><div className="digitalHumanCreationTabs" role="tablist"><button className={creationLane === "mine" ? "active" : ""} onClick={() => setCreationLane("mine")} type="button"><strong>创建我的数字人</strong><span>使用本人照片或视频创建可复用分身</span></button><button className={creationLane === "public" ? "active" : ""} onClick={() => setCreationLane("public")} type="button"><strong>选择公共数字人</strong><span>从现成角色库直接加入我的资产</span></button></div>{creationLane === "mine" ? <><div className="digitalHumanCreateIntro"><div><strong>选择创建方式</strong><span>不确定素材怎么拍？独立指南包含示范、检查表、录制文稿和提词器。</span></div><a href={appPath("/avatar/digital-human-guide")}>查看创建指南 →</a></div><div className="digitalHumanProviderTabs digitalHumanProviderChooser">{(["chanjing", "heygen"] as DigitalHumanProvider[]).map((item) => <button className={!generatedPhotoMode && provider === item ? "active" : ""} disabled={!providers[item]} key={item} onClick={() => { setGeneratedPhotoMode(false); setProvider(item); setFile(null); }} type="button"><strong>{item === "heygen" ? "上传照片创建" : "视频高还原创建"}</strong><span>{providers[item] ? (item === "heygen" ? "一张照片创建人物身份，后续可增加不同造型" : "真人视频训练高还原形象，可选择是否同步声音") : item === "heygen" ? "当前功能不可用" : "当前功能不可用"}</span></button>)}<button className={generatedPhotoMode ? "active" : ""} disabled={!providers.chanjing} onClick={() => { setGeneratedPhotoMode(true); setFile(null); }} type="button"><strong>文字生成数字人</strong><span>{providers.chanjing ? "按文字描述创建数字人形象，可继续制作动态视频" : "当前功能不可用"}</span></button></div>{generatedPhotoMode ? <ChanjingGeneratedPhotoForm onCreated={load} /> : <form className="digitalHumanCreateForm" onSubmit={create}><label>数字人名称<input maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：我的专业口播形象" required value={name} /></label><label className="digitalHumanSourceUpload"><strong>{provider === "heygen" ? "上传正面照片" : "上传真人训练视频"}</strong><span>{file?.name || (provider === "heygen" ? "JPG / PNG / WebP，清晰正面半身照" : "MP4 / MOV / WebM，建议 30 秒至 5 分钟")}</span><input accept={provider === "heygen" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/quicktime,video/webm"} onChange={(event) => setFile(event.target.files?.[0] ?? null)} required type="file" /></label>{provider === "chanjing" ? <fieldset className="digitalHumanCreationOptions"><legend>创建能力</legend><label><span>训练内容</span><select onChange={(event)=>setTrainType(event.target.value as "figure"|"both")} value={trainType}><option value="both">形象 + 本人声音</option><option value="figure">仅训练形象</option></select></label>{trainType === "both" ? <label><span>素材语言</span><select onChange={(event)=>setLanguage(event.target.value as "cn"|"en")} value={language}><option value="cn">中文</option><option value="en">英文</option></select></label> : null}<label><span>清晰度</span><select onChange={(event)=>setQuality(event.target.value as "standard"|"high")} value={quality}><option value="standard">1080p（推荐）</option><option value="high">4K（需 4K 素材）</option></select></label><label className="digitalHumanOptionCheck"><input checked={replaceBackground} onChange={(event)=>setReplaceBackground(event.target.checked)} type="checkbox" /><span>准备背景移除能力</span></label>{trainType === "both" ? <label className="digitalHumanOptionCheck"><input checked={continueWithoutVoice} onChange={(event)=>setContinueWithoutVoice(event.target.checked)} type="checkbox" /><span>声音训练失败时仍保留形象</span></label> : null}</fieldset> : <div className="digitalHumanCreationSummary"><strong>创建结果</strong><span>创建人物身份与首个造型；完成后可为同一人物继续增加服装、姿态或画幅造型。</span></div>}<label className="digitalHumanConsent"><input checked={consent} onChange={(event) => setConsent(event.target.checked)} required type="checkbox" /><span>我确认素材为本人或已取得本人明确授权，并同意用于创建数字人{provider === "chanjing" && trainType === "both" ? "和声音" : ""}。</span></label><button disabled={busy === "create" || !providers[provider]} type="submit">{busy === "create" ? "正在上传并创建…" : "创建我的数字人"}</button></form>}{providers.chanjing ? <button className="digitalHumanSyncButton" disabled={busy === "sync"} onClick={()=>void syncExisting()} type="button">{busy === "sync" ? "正在同步…" : "同步账号中已有的数字人"}</button> : null}</> : <DigitalHumanResourceManager key="public-avatars" mode="public-avatars" provider="chanjing" onTemplateActivated={() => void load()} />}</> : manageMode === "templates" ? <DigitalHumanTemplateFavoritesManager /> : <DigitalHumanResourceManager assets={assets} key={`voices-${provider}`} mode="voices" provider={provider} onTemplateActivated={() => void load()} />}</div> : null}
  </section>;
}

function DigitalHumanEditionStrip({assets}:{assets:DigitalHumanAsset[]}){
  const standard=assets.filter(asset=>asset.editions?.some(item=>item.edition==="standard"&&item.status==="ready"&&item.reviewStatus==="approved")).length;
  const pro=assets.filter(asset=>asset.editions?.some(item=>item.edition==="pro"&&item.status==="ready"&&item.reviewStatus==="approved")).length;
  return <div className="digitalHumanEditionStrip"><div><span>标准版</span><strong>{standard} 个已启用</strong><small>适合高频日常口播，生成稳定</small></div><div><span>Pro 版</span><strong>{pro} 个已启用</strong><small>支持更精细表现与多造型能力</small></div><p>每条视频会锁定一个版本；没有经过启用确认的版本不会参与自动生成。</p></div>;
}

function ChanjingGeneratedPhotoForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name,setName]=useState(""); const [detail,setDetail]=useState(""); const [background,setBackground]=useState(""); const [age,setAge]=useState<"Young adult"|"Adult"|"Teenager"|"Elderly">("Adult"); const [gender,setGender]=useState<"Male"|"Female">("Female"); const [aspectRatio,setAspectRatio]=useState<"9:16"|"16:9">("9:16"); const [consent,setConsent]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{const response=await fetch(apiPath("/api/avatar/generated-digital-humans"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,detail,background,age,gender,aspectRatio,talkingPose:"上半身正面口播构图，目视镜头",consent})});const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error||"文字生成数字人创建失败");setName("");setDetail("");setBackground("");setConsent(false);await onCreated();}catch(cause){setError(cause instanceof Error?cause.message:"文字生成数字人创建失败");}finally{setBusy(false);}}
  return <form className="digitalHumanCreateForm" onSubmit={submit}><div className="digitalHumanCreationSummary"><strong>文字生成数字人</strong><span>根据人物描述生成数字人形象图；这是生成式形象，不等同于真人高还原克隆。</span></div><label>形象名称<input maxLength={80} onChange={event=>setName(event.target.value)} placeholder="例如：专业保险顾问" required value={name}/></label><label>人物描述<textarea maxLength={1500} onChange={event=>setDetail(event.target.value)} placeholder="例如：亲和专业的亚洲女性保险顾问，深色职业套装，正面半身" required value={detail}/></label><label>年龄感<select onChange={event=>setAge(event.target.value as typeof age)} value={age}><option value="Young adult">青年</option><option value="Adult">成年</option><option value="Teenager">少年</option><option value="Elderly">长者</option></select></label><label>人物性别<select onChange={event=>setGender(event.target.value as typeof gender)} value={gender}><option value="Female">女性</option><option value="Male">男性</option></select></label><label>画幅<select onChange={event=>setAspectRatio(event.target.value as typeof aspectRatio)} value={aspectRatio}><option value="9:16">竖屏 9:16</option><option value="16:9">横屏 16:9</option></select></label><label>背景描述<input maxLength={1500} onChange={event=>setBackground(event.target.value)} placeholder="例如：明亮整洁的专业咨询室" value={background}/></label><label className="digitalHumanConsent"><input checked={consent} onChange={event=>setConsent(event.target.checked)} required type="checkbox"/><span>我确认描述和参考方向不侵犯他人肖像、著作权或其他权益。</span></label>{error?<div className="alertPanel">{error}</div>:null}<button disabled={busy||!consent} type="submit">{busy?"正在提交生成…":"文字生成数字人"}</button></form>;
}

type DigitalHumanLook = { id: string; name: string; status: string; previewImageUrl: string; previewVideoUrl: string; width?: number; height?: number };
function DigitalHumanLookManager({ asset, onClose }: { asset: DigitalHumanAsset; onClose: () => void }) {
  const [looks, setLooks] = useState<DigitalHumanLook[]>([]); const [name, setName] = useState(""); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [voicePreviewUrl, setVoicePreviewUrl] = useState(typeof asset.metadata_json?.voice_preview_url === "string" ? asset.metadata_json.voice_preview_url : ""); const [voicePreviewBusy, setVoicePreviewBusy] = useState(false);
  const canAddLooks = asset.provider === "heygen" && Boolean(asset.provider_group_id);
  async function load() { if (!canAddLooks) return; setError(""); try { const response = await fetch(apiPath(`/api/avatar/digital-human-looks?assetId=${encodeURIComponent(asset.id)}`)); const payload = await response.json() as { looks?: DigitalHumanLook[]; error?: string }; if (!response.ok) throw new Error(payload.error || "造型加载失败"); setLooks(payload.looks ?? []); } catch (cause) { setError(cause instanceof Error ? cause.message : "造型加载失败"); } }
  useEffect(() => { void Promise.resolve().then(() => load()); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); if (!file) return; setBusy(true); setError(""); const form = new FormData(); form.append("assetId", asset.id); form.append("name", name); form.append("file", file); try { const response = await fetch(apiPath("/api/avatar/digital-human-looks"), { method: "POST", body: form }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "新增造型失败"); setName(""); setFile(null); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "新增造型失败"); } finally { setBusy(false); } }
  async function previewVoice() { setVoicePreviewBusy(true); setError(""); try { const response = await fetch(apiPath("/api/avatar/digital-human-voice-preview"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: asset.id }) }); const payload = await response.json() as { url?: string; error?: string }; if (!response.ok || !payload.url) throw new Error(payload.error || "声音试听生成失败"); setVoicePreviewUrl(payload.url); } catch (cause) { setError(cause instanceof Error ? cause.message : "声音试听生成失败"); } finally { setVoicePreviewBusy(false); } }
  const visibleLooks = looks.length ? looks : [{ id: asset.provider_avatar_id || asset.id, name: "当前形象", status: "completed", previewImageUrl: asset.preview_image_url || "", previewVideoUrl: asset.preview_video_url || "" }];
  return <div className="digitalHumanLookModal" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${asset.name}形象与声音管理`}><div onClick={(event) => event.stopPropagation()}><header><div><strong>{asset.name}的形象与声音</strong><span>查看这个数字人当前可用的形象版本和绑定声音</span></div><button onClick={onClose} type="button">×</button></header>{error ? <div className="alertPanel">{error}</div> : null}<div className="digitalHumanIdentityManager"><section><div className="digitalHumanIdentitySectionTitle"><strong>我的造型</strong><span>{canAddLooks ? "可继续增加服装、姿态和画幅造型" : "当前形象由一次完整训练生成"}</span></div><div className="digitalHumanLookGrid">{visibleLooks.map((look) => <article key={look.id}>{look.previewImageUrl ? <img alt={look.name} src={look.previewImageUrl} /> : <div className="digitalHumanAvatarFallback">{asset.name.slice(0, 1)}</div>}<strong>{look.name}</strong><small>{look.status === "completed" ? "已就绪" : "正在生成"}{look.width && look.height ? ` · ${look.width}×${look.height}` : ""}</small></article>)}</div></section><section><div className="digitalHumanIdentitySectionTitle"><strong>我的声音</strong><span>生成口播时会自动使用，也可在成片页切换其他声音</span></div><article className="digitalHumanBoundVoice"><span>声音</span><div><strong>{asset.provider_voice_id ? `${asset.name}的绑定声音` : asset.metadata_json?.source === "public" ? "默认声音" : "声音正在准备"}</strong><small>{asset.provider_voice_id ? "已与当前数字人绑定" : "当前使用随形象准备的默认声音"}</small></div><i>{asset.provider_voice_id ? "已就绪" : "默认"}</i></article>{voicePreviewUrl ? <audio className="digitalHumanBoundVoiceAudio" controls autoPlay preload="metadata" src={voicePreviewUrl} /> : asset.provider_voice_id ? <button className="digitalHumanVoicePreviewButton" disabled={voicePreviewBusy} onClick={() => void previewVoice()} type="button">{voicePreviewBusy ? "正在准备试听…" : "▶ 试听声音"}</button> : null}</section></div>{canAddLooks ? <form onSubmit={submit}><div><strong>增加一个新造型</strong><span>上传同一人物的新照片，可改变服装、姿态或横竖构图，但保持人物身份。</span></div><label>造型名称<input maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：职业西装·竖版" required value={name} /></label><label>造型参考照片<input accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required type="file" /></label><button disabled={busy || !file} type="submit">{busy ? "正在创建造型…" : "增加造型"}</button></form> : <div className="digitalHumanChannelNotice"><strong>需要另一个造型？</strong><span>当前形象由一段完整训练素材生成。如需更换服装、姿态或构图，请使用同一人物的新训练视频新增一个形象，小谷会继续统一管理和自动选择可用能力。</span></div>}</div></div>;
}

type FavoriteVideoTemplate = { id: string; collection: "expressive" | "production"; name: string; category: string; categories: string[]; aspectRatio: "9:16" | "16:9"; width: number; height: number; durationSeconds: number | null; structure: string[]; coverUrl: string; previewUrl: string };
function DigitalHumanTemplateFavoritesManager() {
  const [showLibrary, setShowLibrary] = useState(false); const [templates, setTemplates] = useState<FavoriteVideoTemplate[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  async function load() { setLoading(true); setError(""); try { const response = await fetch(apiPath("/api/digital-human-template-favorites")); const payload = await response.json() as { templates?: FavoriteVideoTemplate[]; error?: string }; if (!response.ok) throw new Error(payload.error || "收藏模板加载失败"); setTemplates(payload.templates ?? []); } catch (cause) { setError(cause instanceof Error ? cause.message : "收藏模板加载失败"); } finally { setLoading(false); } }
  useEffect(() => { if (!showLibrary) void Promise.resolve().then(() => load()); }, [showLibrary]);
  async function remove(template: FavoriteVideoTemplate) { setBusy(template.id); try { const response = await fetch(apiPath(`/api/digital-human-template-favorites?collection=${template.collection}&id=${encodeURIComponent(template.id)}`), { method: "DELETE" }); if (!response.ok) throw new Error("取消收藏失败"); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "取消收藏失败"); } finally { setBusy(""); } }
  if (showLibrary) return <><button className="digitalHumanBackToFavorites" onClick={() => setShowLibrary(false)} type="button">← 返回我的收藏</button><DigitalHumanTemplateLibraryBrowser /></>;
  return <section className="digitalHumanFavoriteTemplateManager"><header><div><span>我的常用资产</span><h4>我收藏的模板</h4><p>生成数字人视频时，只会从这里选择模板。</p></div><button className="digitalHumanBrowseLibrary" onClick={() => setShowLibrary(true)} type="button">＋ 浏览模板库</button></header>{error ? <div className="alertPanel">{error}</div> : null}{loading ? <div className="digitalHumanEmpty">正在加载收藏模板…</div> : templates.length ? <div className="digitalHumanFavoriteTemplateGrid">{templates.map((template) => <article key={`${template.collection}:${template.id}`}><button className="preview" disabled={!template.previewUrl} type="button">{template.coverUrl ? <img alt={template.name} src={template.coverUrl} /> : <span>暂无封面</span>}</button><strong>{template.name}</strong><small>{template.category} · {template.aspectRatio}</small><button disabled={busy === template.id} onClick={() => void remove(template)} type="button">{busy === template.id ? "处理中…" : "取消收藏"}</button></article>)}</div> : <div className="digitalHumanEmpty"><strong>还没有收藏模板</strong><p>进入精简模板库，收藏常用成片模板。</p><button onClick={() => setShowLibrary(true)} type="button">浏览模板库</button></div>}</section>;
}
function DigitalHumanTemplateLibraryBrowser() {
  const [collection, setCollection] = useState<"expressive" | "production">("expressive"); const [category, setCategory] = useState("全部"); const [page, setPage] = useState(1); const [templates, setTemplates] = useState<FavoriteVideoTemplate[]>([]); const [categories, setCategories] = useState<string[]>([]); const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]); const [preview, setPreview] = useState<FavoriteVideoTemplate | null>(null); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  async function loadFavorites() { const response = await fetch(apiPath("/api/digital-human-template-favorites")); const payload = await response.json() as { keys?: string[] }; if (response.ok) setFavoriteKeys(payload.keys ?? []); }
  async function loadLibrary() { setError(""); try { const query = new URLSearchParams({ collection, category, page: String(page), pageSize: "12" }); const response = await fetch(apiPath(`/api/digital-human-template-library?${query}`)); const payload = await response.json() as { templates?: FavoriteVideoTemplate[]; categories?: string[]; error?: string }; if (!response.ok) throw new Error(payload.error || "模板库加载失败"); setTemplates(payload.templates ?? []); setCategories(payload.categories ?? []); } catch (cause) { setError(cause instanceof Error ? cause.message : "模板库加载失败"); } }
  // Changing a library filter intentionally hydrates a fresh result page.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void Promise.all([loadLibrary(), loadFavorites()]); }, [collection, category, page]);
  async function toggle(template: FavoriteVideoTemplate) { const key = `${template.collection}:${template.id}`; const saved = favoriteKeys.includes(key); setBusy(key); setError(""); try { const response = await fetch(apiPath(`/api/digital-human-template-favorites${saved ? `?collection=${template.collection}&id=${encodeURIComponent(template.id)}` : ""}`), saved ? { method: "DELETE" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(template) }); if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error || "模板收藏失败"); } await loadFavorites(); } catch (cause) { setError(cause instanceof Error ? cause.message : "模板收藏失败"); } finally { setBusy(""); } }
  const allowed = collection === "expressive" ? ["全部", "IP打造", "教育培训", "营销带货"] : ["全部", "知识口播", "情感口播", "法律科普"].filter((item) => item === "全部" || categories.includes(item));
  return <section className="digitalHumanFavoriteTemplateManager"><header><div><span>我的常用资产</span><h4>收藏视频模板</h4><p>在这里发现和收藏；生成视频时只展示你收藏的模板。</p></div><strong>已收藏 {favoriteKeys.length} 个</strong></header><div className="digitalHumanResourceTabs"><button className={collection === "expressive" ? "active" : ""} onClick={() => { setCollection("expressive"); setCategory("全部"); setPage(1); }} type="button">AI 模板</button><button className={collection === "production" ? "active" : ""} onClick={() => { setCollection("production"); setCategory("全部"); setPage(1); }} type="button">模板库</button></div><div className="digitalHumanFavoriteCategories">{allowed.map((item) => <button className={category === item ? "active" : ""} key={item} onClick={() => { setCategory(item); setPage(1); }} type="button">{item === "全部" ? "推荐" : item}</button>)}</div>{error ? <div className="alertPanel">{error}</div> : null}<div className="digitalHumanFavoriteTemplateGrid">{templates.map((template) => { const key = `${template.collection}:${template.id}`; const saved = favoriteKeys.includes(key); return <article key={key}><button className="preview" disabled={!template.previewUrl} onClick={() => setPreview(template)} type="button">{template.coverUrl ? <img alt={template.name} src={template.coverUrl} /> : <span>暂无封面</span>}{template.previewUrl ? <i>▶ 预览</i> : null}</button><strong>{template.name}</strong><small>{template.category} · {template.aspectRatio}</small><button className={saved ? "saved" : ""} disabled={busy === key} onClick={() => void toggle(template)} type="button">{busy === key ? "处理中…" : saved ? "已收藏 · 取消" : "收藏到我的模板"}</button></article>; })}</div>{preview?.previewUrl ? <div className="digitalHumanTemplateModal" onClick={() => setPreview(null)} role="dialog" aria-modal="true"><div onClick={(event) => event.stopPropagation()}><header><strong>{preview.name}</strong><button onClick={() => setPreview(null)} type="button">×</button></header><video autoPlay controls playsInline poster={preview.coverUrl} src={preview.previewUrl} /></div></div> : null}</section>;
}

function DigitalHumanResourceManager({ provider, onTemplateActivated, mode, assets = [] }: { provider: DigitalHumanProvider; onTemplateActivated: () => void; mode: "public-avatars" | "voices"; assets?: DigitalHumanAsset[] }) {
  const [tab, setTab] = useState<"templates" | "voices" | "clone">(mode === "public-avatars" ? "templates" : "clone");
  const [templates, setTemplates] = useState<DigitalHumanTemplate[]>([]); const [voices, setVoices] = useState<DigitalHumanVoice[]>([]);
  const [name, setName] = useState(""); const [referenceUrl, setReferenceUrl] = useState(""); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<DigitalHumanTemplate | null>(null);
  const [figureChoices, setFigureChoices] = useState<Record<string, string>>({});
  async function loadResources() { try { const response = await fetch(apiPath("/api/digital-human-resources")); const text = await response.text(); const payload = text ? JSON.parse(text) as { templates?: DigitalHumanTemplate[]; voices?: DigitalHumanVoice[]; error?: string } : null; if (!response.ok || !payload) throw new Error(payload?.error || "资源库加载失败"); setTemplates((payload.templates ?? []).filter((item) => item.provider === provider)); setVoices((payload.voices ?? []).filter((item) => item.provider === provider)); } catch (cause) { setError(cause instanceof Error ? cause.message : "资源库加载失败"); } }
  useEffect(() => { void Promise.resolve().then(() => loadResources()); }, [provider]);
  async function activate(template: DigitalHumanTemplate) { setBusy(`template:${template.id}:${template.figure_type}`); setError(""); try { const response = await fetch(apiPath("/api/digital-human-resources"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ personId: template.id, name: template.name, figureType: template.figure_type, voiceId: template.voice_id, coverUrl: template.cover_url, previewUrl: template.preview_url, width: template.width, height: template.height }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "模板启用失败"); setMessage(`已把「${template.name}」加入我的数字人。`); onTemplateActivated(); } catch (cause) { setError(cause instanceof Error ? cause.message : "模板启用失败"); } finally { setBusy(""); } }
  async function cloneVoice() { if (!name.trim() || !referenceUrl.trim() || !consent) return; setBusy("clone"); setError(""); try { const response = await fetch(apiPath("/api/digital-human-resources"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, referenceUrl, consent }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "声音克隆提交失败"); setName(""); setReferenceUrl(""); setConsent(false); setMessage("声音克隆任务已提交，通常需要几分钟完成。"); await loadResources(); } catch (cause) { setError(cause instanceof Error ? cause.message : "声音克隆提交失败"); } finally { setBusy(""); } }
  async function refreshVoice(id: string) { setBusy(id); try { const response = await fetch(apiPath("/api/digital-human-resources"), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "声音状态刷新失败"); await loadResources(); } catch (cause) { setError(cause instanceof Error ? cause.message : "声音状态刷新失败"); } finally { setBusy(""); } }
  async function saveVoice(voice: DigitalHumanVoice) { setBusy(`voice:${voice.id}`); setError(""); try { const response = await fetch(apiPath("/api/digital-human-resources"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save-public-voice", provider: voice.provider, name: voice.name, voiceId: voice.provider_voice_id, previewUrl: voice.preview_audio_url }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "声音收藏失败"); setMessage(`已把「${voice.name}」收藏到我的声音。`); await loadResources(); } catch (cause) { setError(cause instanceof Error ? cause.message : "声音收藏失败"); } finally { setBusy(""); } }
  async function removeVoice(voice: DigitalHumanVoice) { setBusy(`remove:${voice.id}`); setError(""); try { const response = await fetch(apiPath(`/api/digital-human-resources?id=${encodeURIComponent(voice.id)}`), { method: "DELETE" }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error || "取消收藏失败"); setMessage(`已取消收藏「${voice.name}」。`); await loadResources(); } catch (cause) { setError(cause instanceof Error ? cause.message : "取消收藏失败"); } finally { setBusy(""); } }
  const publicVoices = voices.filter((voice) => voice.source === "public"); const creatorVoices = voices.filter((voice) => voice.source === "creator");
  const boundVoiceAssets = assets.filter((asset) => asset.status === "ready" && Boolean(asset.provider_voice_id));
  const templateGroups = useMemo(() => Array.from(templates.reduce((groups, template) => {
    const variants = groups.get(template.id) ?? new Map<string, DigitalHumanTemplate>();
    const figureType = normalizeFigureType(template.figure_type);
    const normalizedTemplate = { ...template, figure_type: figureType };
    const current = variants.get(figureType);
    if (!current || (!current.cover_url && template.cover_url) || (!current.preview_url && template.preview_url)) variants.set(figureType, normalizedTemplate);
    groups.set(template.id, variants);
    return groups;
  }, new Map<string, Map<string, DigitalHumanTemplate>>()).values()).map((variants) => Array.from(variants.values()).sort((left, right) => figureTypePriority(left.figure_type) - figureTypePriority(right.figure_type))), [templates]);
  return <section className="digitalHumanProfileResources"><header><div><span>{mode === "public-avatars" ? "金融保险顾问角色库" : "声音资产"}</span><h4>{mode === "public-avatars" ? "选择现成数字人" : "声音库"}</h4><p>{mode === "public-avatars" ? `已按官方“金融保险顾问”标签筛选全部 ${templateGroups.length} 位角色；预览后可加入我的数字人。` : "查看数字人绑定声音，并管理独立克隆或收藏的声音。"}</p></div></header>{mode === "voices" ? <div className="digitalHumanResourceTabs"><button className={tab === "voices" ? "active" : ""} onClick={() => setTab("voices")} type="button">公共声音</button><button className={tab === "clone" ? "active" : ""} onClick={() => setTab("clone")} type="button">我的可用声音</button></div> : null}{error ? <div className="alertPanel">{error}</div> : null}{message ? <div className="successPanel">{message}</div> : null}
    {tab === "templates" ? provider === "chanjing" ? <><div className="digitalHumanTemplateGrid">{templateGroups.map((figures) => { const uniqueFigures = uniqueFigureVariants(figures); const selected = uniqueFigures.find((item) => item.figure_type === figureChoices[uniqueFigures[0].id]) ?? uniqueFigures[0]; return <article key={selected.id}><button aria-label={`预览${selected.name}`} className="digitalHumanTemplateCover" disabled={!selected.preview_url} onClick={() => setPreviewTemplate(selected)} type="button">{selected.cover_url ? <img alt={`${selected.name}完整形象封面`} src={selected.cover_url} /> : <span className="digitalHumanAvatarFallback">{selected.name.slice(0, 1)}</span>}{selected.preview_url ? <i>▶ 预览</i> : null}</button><div className="digitalHumanTemplateInfo"><strong>{selected.name}</strong><span>{selected.voice_name || "平台默认声音"}</span></div>{uniqueFigures.length > 1 ? <div className="digitalHumanFigureChoices" aria-label="选择人物构图"><small>可选构图</small><div>{uniqueFigures.map((figure) => <button className={selected.figure_type === figure.figure_type ? "active" : ""} key={figure.figure_type} onClick={() => setFigureChoices((current) => ({ ...current, [selected.id]: figure.figure_type }))} type="button">{figureTypeLabel(figure.figure_type)}</button>)}</div></div> : null}<small className="digitalHumanTemplateMeta">{figureTypeLabel(selected.figure_type)} · {selected.width}×{selected.height}</small><button className="digitalHumanTemplateAdd" disabled={Boolean(busy)} onClick={() => void activate(selected)} type="button">{busy === `template:${selected.id}:${selected.figure_type}` ? "正在添加…" : "加入我的数字人"}</button></article>})}</div>{previewTemplate?.preview_url ? <div className="digitalHumanTemplateModal" onClick={() => setPreviewTemplate(null)} role="dialog" aria-modal="true" aria-label={`${previewTemplate.name}完整预览`}><div onClick={(event) => event.stopPropagation()}><header><div><strong>{previewTemplate.name}</strong><span>{figureTypeLabel(previewTemplate.figure_type)} · {previewTemplate.width}×{previewTemplate.height} · {previewTemplate.voice_name || "默认声音"}</span></div><button onClick={() => setPreviewTemplate(null)} type="button">×</button></header><video autoPlay controls loop muted playsInline poster={previewTemplate.cover_url || undefined} src={previewTemplate.preview_url} /></div></div> : null}</> : <div className="digitalHumanEmpty"><strong>快速形象模板正在准备</strong><p>你仍可上传一张清晰正面照创建自己的数字分身。</p></div> : null}
    {tab === "voices" ? <><div className="digitalHumanVoiceUsageHint"><strong>公共声音怎么用？</strong><span>先试听，喜欢后收藏到“我的声音”；真正选择和使用声音在数字人视频创作页完成。</span></div><div className="digitalHumanVoiceGrid">{publicVoices.map((voice) => { const saved = creatorVoices.some((item) => item.provider === voice.provider && item.provider_voice_id === voice.provider_voice_id); return <article key={voice.id}><div><strong>{voice.name}</strong><small>精选声音 · {voice.gender || voice.language || "中文"}</small></div>{voice.preview_audio_url ? <audio controls preload="none" src={voice.preview_audio_url} /> : null}<button className="digitalHumanUseVoice" disabled={saved || busy === `voice:${voice.id}`} onClick={() => void saveVoice(voice)} type="button">{saved ? "已收藏到我的声音" : busy === `voice:${voice.id}` ? "正在收藏…" : "收藏到我的声音"}</button></article>})}{!publicVoices.length ? <div className="digitalHumanEmpty">当前暂未返回公共声音。</div> : null}</div></> : null}
    {tab === "clone" ? <div className="digitalHumanCreatorVoiceManager"><div className="digitalHumanVoiceUsageHint"><strong>数字人绑定声音</strong><span>随数字人训练或启用，只用于对应数字人；生成视频时会自动使用。</span></div><div className="digitalHumanVoiceGrid">{boundVoiceAssets.map((asset) => <article key={`bound:${asset.id}`}><div><strong>{asset.name}的绑定声音</strong><small>数字人声音 · 仅用于「{asset.name}」</small></div><span className="digitalHumanVoiceStatus">已就绪</span></article>)}</div>{!boundVoiceAssets.length ? <div className="digitalHumanEmpty">当前没有已就绪的数字人绑定声音。</div> : null}<div className="digitalHumanVoiceUsageHint"><strong>独立声音</strong><span>克隆或收藏后，可在生成视频时按需切换。</span></div><div className="digitalHumanVoiceGrid">{creatorVoices.map((voice) => <article key={voice.id}><div><strong>{voice.name}</strong><small>{voice.is_favorite ? "收藏的公共声音" : voice.status === "ready" ? "我的克隆声音 · 已就绪" : voice.status === "failed" ? voice.error_message || "训练失败" : "正在训练"}</small></div>{voice.preview_audio_url ? <audio controls preload="none" src={voice.preview_audio_url} /> : null}{voice.is_favorite ? <button disabled={busy === `remove:${voice.id}`} onClick={() => void removeVoice(voice)} type="button">{busy === `remove:${voice.id}` ? "处理中…" : "取消收藏"}</button> : voice.status === "creating" ? <button disabled={busy === voice.id} onClick={() => void refreshVoice(voice.id)} type="button">刷新状态</button> : null}</article>)}</div>{!creatorVoices.length ? <div className="digitalHumanEmpty">还没有收藏或创建声音。可切换到“公共声音”收藏，或在下方克隆自己的声音。</div> : null}{provider === "chanjing" ? <div className="digitalHumanVoiceCloneForm"><div><strong>克隆我的声音</strong><span>使用 30 秒–5 分钟干净人声，参考音频需为 HTTPS 公网地址。</span></div><label>声音名称<input maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：我的专业讲解声" value={name} /></label><label>参考音频地址<input onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://…/voice.mp3" type="url" value={referenceUrl} /></label><label className="digitalHumanConsent"><input checked={consent} onChange={(event) => setConsent(event.target.checked)} type="checkbox" /><span>我确认这是本人声音或已获得明确的声音克隆授权。</span></label><button disabled={busy === "clone" || !name.trim() || !referenceUrl.trim() || !consent} onClick={() => void cloneVoice()} type="button">{busy === "clone" ? "正在提交…" : "开始克隆声音"}</button></div> : <div className="digitalHumanEmpty">该创建方式默认跟随数字人声音，无需单独录入。</div>}</div> : null}
  </section>;
}

function figureTypeLabel(value: string) { return value === "sit_body" ? "坐姿半身" : value === "whole_body" ? "全身站姿" : value === "circle_view" ? "圆形近景" : value; }
function figureTypePriority(value: string) { return value === "whole_body" ? 0 : value === "sit_body" ? 1 : value === "circle_view" ? 2 : 3; }
function normalizeFigureType(value: string) { return value.trim().toLowerCase(); }
function uniqueFigureVariants(figures: DigitalHumanTemplate[]) { return Array.from(new Map(figures.map((figure) => [normalizeFigureType(figure.figure_type), { ...figure, figure_type: normalizeFigureType(figure.figure_type) }])).values()); }

const digitalHumanRecordingScript = [
  "大家好，我是【你的名字】。很高兴通过这段视频认识你。接下来，我会用自然、清楚的方式，分享一些我在工作和生活中的思考。",
  "我平时主要关注家庭保障、风险管理和长期规划。面对每一个问题，我都会先了解真实需求，再解释相关规则、适用范围和需要注意的边界，而不是急着给出结论。",
  "举个简单的例子。当一个家庭开始做保障规划时，我通常会先梳理家庭成员、收入支出和已有保障，再分清哪些风险更需要优先处理。信息越完整，沟通就越有效，选择也会更从容。",
  "我希望自己的表达专业但不生硬，清晰但不夸张。遇到不确定的信息，我会如实说明；涉及具体产品、条款或个人情况时，也会提醒大家以正式资料和实际需求为准。",
  "对我来说，一次好的沟通，不只是回答当下的问题，更是帮助对方建立判断方法。感谢你耐心听完这段介绍。以后我也会继续分享简单、实用、容易理解的内容。我们下次见。",
];

export function DigitalHumanRecordingGuide({ provider, tutorial }: { provider: DigitalHumanProvider; tutorial: { title: string; summary: string; requirements: string[]; steps: string[]; url: string; videoUrl: string; linkLabel: string } }) {
  const [copied, setCopied] = useState(false);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [paragraph, setParagraph] = useState(0);
  const script = `[开始前保持安静并看镜头 3 秒]\n\n${digitalHumanRecordingScript.join("\n\n")}\n\n[说完后保持微笑并看镜头 2 秒]`;
  async function copyScript() {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  function openTeleprompter() { setParagraph(0); setTeleprompterOpen(true); }
  return <article className="digitalHumanOfficialGuide">
    <header><div><span>小谷录制准备中心</span><h4>{tutorial.title}</h4><p>{tutorial.summary}</p></div>{tutorial.url ? <a href={tutorial.url} rel="noreferrer" target="_blank">{tutorial.linkLabel} ↗</a> : null}</header>
    {provider === "heygen" ? <div className="digitalHumanGuideNotice"><strong>先看清创建方式</strong><span>当前选择的是上传照片创建，下方只需上传一张清晰正面照片；如需更自然的动作与声音，请切换到视频高还原创建。</span></div> : null}
    <div className="digitalHumanLearningGrid">
      <section className="digitalHumanDemoCard">
        <div className="digitalHumanGuideSectionTitle"><span>01</span><div><strong>先看官方示范</strong><small>{provider === "heygen" ? "照片数字人逐步参考" : "真人录制正确 / 错误案例和示例视频"}</small></div></div>
        {tutorial.videoUrl ? <iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen src={tutorial.videoUrl} title="数字人录制教程" /> : tutorial.url ? <a className="digitalHumanTutorialPoster" href={tutorial.url} rel="noreferrer" target="_blank"><span>小谷拍摄教程</span><strong>查看录制准备与常见错误</strong><small>点击查看完整视频与操作演示 ↗</small></a> : <div className="digitalHumanTutorialPoster"><span>小谷拍摄教程</span><strong>按照右侧检查表准备素材</strong><small>保持正面、清晰、稳定，减少返工</small></div>}
      </section>
      <section className="digitalHumanChecklistCard">
        <div className="digitalHumanGuideSectionTitle"><span>02</span><div><strong>照着检查再开拍</strong><small>少返工，一次录对</small></div></div>
        <ul>{tutorial.requirements.map((item) => <li key={item}><i>✓</i><span>{item}</span></li>)}</ul>
        {provider === "heygen" ? <p>快速测试可录约 30 秒；正式训练建议连续录制至少 2 分钟。如需授权视频，请使用创建页面给出的原文，不能用下方口播稿代替。</p> : <p>先完成训练素材，再按创建页面提示单独完成人脸授权；授权声明请逐字照读创建页面原文。</p>}
      </section>
    </div>
    {provider === "chanjing" ? <section className="digitalHumanReferenceSamples"><div className="digitalHumanGuideSectionTitle"><span>03</span><div><strong>参考这些成品形象来拍</strong><small>来自官方公共数字人展示素材；只用于理解机位、构图、服装和动作，不是让你照着选择角色</small></div></div><div>{chanjingCreationReferenceSamples.map((sample) => <article key={sample.id}><video controls playsInline poster={sample.coverUrl} preload="none" src={sample.videoUrl} /><section><strong>{sample.name}</strong><small>{sample.pose}</small><div>{sample.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section></article>)}</div><p>参考重点：人物始终清晰、相机固定、正面看镜头、动作幅度适中。样例人物与声音归原平台或权利人所有，仅作为拍摄参考。</p></section> : null}
    <section className="digitalHumanScriptCard">
      <div className="digitalHumanGuideSectionTitle"><span>{provider === "chanjing" ? "04" : "03"}</span><div><strong>直接照读的录制文稿</strong><small>约 2 分钟 · 已加入自然停顿和合规表达</small></div></div>
      <div className="digitalHumanScriptPreview"><em>开场保持安静 3 秒</em>{digitalHumanRecordingScript.slice(0, 2).map((item) => <p key={item}>{item}</p>)}<span>……完整文稿共 {digitalHumanRecordingScript.length} 段</span></div>
      <div className="digitalHumanScriptActions"><button onClick={() => void copyScript()} type="button">{copied ? "已复制到剪贴板 ✓" : "复制完整文稿"}</button><button onClick={openTeleprompter} type="button">打开大字提词器</button></div>
    </section>
    <div className="digitalHumanCreateSteps"><strong>录好以后</strong><ol>{tutorial.steps.map((item) => <li key={item}>{item}</li>)}</ol></div>
    <p className="digitalHumanGuideNote">教程入口来自拍摄参考中心；服务规格可能调整，请以打开后的最新说明为准。训练文稿由小谷提供，不代替创建流程要求的授权声明。</p>
    {teleprompterOpen ? <div className="digitalHumanTeleprompter" role="dialog" aria-modal="true" aria-label="数字人录制提词器"><div><header><span>录制提词器 · {paragraph + 1}/{digitalHumanRecordingScript.length}</span><button aria-label="关闭提词器" onClick={() => setTeleprompterOpen(false)} type="button">×</button></header><p>{digitalHumanRecordingScript[paragraph]}</p><footer><button disabled={paragraph === 0} onClick={() => setParagraph((value) => value - 1)} type="button">上一段</button><span>{paragraph === 0 ? "先看镜头静默 3 秒，再开始朗读" : paragraph === digitalHumanRecordingScript.length - 1 ? "读完后保持微笑 2 秒" : "自然停顿一下，再进入下一段"}</span><button disabled={paragraph === digitalHumanRecordingScript.length - 1} onClick={() => setParagraph((value) => value + 1)} type="button">下一段</button></footer></div></div> : null}
  </article>;
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
  return <section className="avatarVersionsGrid"><div className="avatarSinglePanel"><div className="avatarSectionHeader"><div><span>版本时间线</span><h2>每次进化都可以回退</h2><p>接受进化建议后自动创建新版本。</p></div></div><div className="avatarVersionList">{versions.map((version) => <article key={version.id}><div><strong>V{version.version} · {version.label || "数字分身"}</strong><span>{formatDate(version.created_at)}</span></div><p>{version.change_summary || "分身画像与记忆快照"}</p><em>{version.status === "active" ? "当前版本" : version.status === "restored" ? "已恢复" : "历史版本"}</em>{version.status !== "active" ? <button onClick={() => void onAction({ action: "restore-version", versionId: version.id }, `已恢复到 V${version.version}。`)}>恢复此版本</button> : null}</article>)}{versions.length === 0 ? <div className="avatarEmptyState"><strong>当前还没有版本记录</strong><p>第一次接受进化建议后会创建 V1。</p></div> : null}</div></div><aside className="avatarPrivacyPanel"><div className="avatarSectionHeader compact"><div><span>隐私控制</span><h2>记忆如何被使用</h2></div></div><PrivacyToggle label="允许数字分身学习" detail="关闭后停止新增学习，但保留现有记忆" checked={privacy.learning_enabled} onChange={(value) => update("learning_enabled", value)} /><PrivacyToggle label="从修改行为学习" detail="根据你对作品的修改生成进化建议" checked={privacy.behavior_learning_enabled} onChange={(value) => update("behavior_learning_enabled", value)} /><PrivacyToggle label="允许客户记忆" detail="默认关闭；即使开启也应只保存脱敏信息" checked={privacy.customer_memory_enabled} onChange={(value) => update("customer_memory_enabled", value)} /><PrivacyToggle label="允许小谷推断候选记忆" detail="推断只进入待确认区，不直接成为事实" checked={privacy.auto_inference_enabled} onChange={(value) => update("auto_inference_enabled", value)} /><PrivacyToggle label="允许图片创作调用形象照" detail="关闭后保留照片，但新任务不再读取" checked={privacy.visual_creation_enabled} onChange={(value) => update("visual_creation_enabled", value)} /><p>客户身份证件、联系方式、健康资料和完整保单默认不进入长期记忆。</p></aside></section>;
}

function PrivacyToggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="avatarPrivacyToggle"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
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
      tab: "memory",
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
      description: "补充你常用的措辞、结构和不喜欢的说法，能明显减少模板感。",
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
      description: "持续补充真实经历、表达偏好和边界，系统会据此完善个人上下文。",
      tab: "memory",
    });
  }

  return tips.slice(0, 4);
}

function score(hasCore: boolean, evidenceCount: number, memoryCount: number) {
  return Math.min(100, (hasCore ? 45 : 0) + Math.min(30, evidenceCount * 8) + Math.min(25, memoryCount * 8));
}

function originLabel(origin: AvatarMemoryItem["origin"]) {
  return ({ user: "本人确认", imported: "资料提取", behavior: "行为学习", inferred: "小谷推断", system: "系统生成" } as const)[origin];
}

function sourceTypeLabel(type: string) {
  return ({ article: "文章", moments: "朋友圈", transcript: "短视频/录音稿", story: "个人故事", manual: "手动资料", video_channel: "视频号风格训练", douyin: "抖音风格训练" } as Record<string, string>)[type] ?? type;
}

function formatDate(value?: string | null) {
  if (!value) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
