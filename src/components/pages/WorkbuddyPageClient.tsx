"use client";
/* eslint-disable @next/next/no-img-element -- app option previews use catalog-provided aspect ratios and URLs. */

import {
  ChangeEvent,
  FormEvent,
  Fragment,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import { visibleCreationFields } from "@/lib/apps/field-interaction";
import { resolveConversationFormState } from "@/lib/workbuddy/app-conversation";
import { apiPath, appPath } from "@/lib/client/url";
import { usePageMeta } from "@/lib/client/page-meta";
import { creationApps, type CreationApp } from "@/lib/apps/catalog";
import { hiddenWorkspaceCardSlugs } from "@/lib/apps/workspace-visibility";
import { type WorkbuddyScenario } from "@/lib/workbuddy/catalog";
import type { WorkbuddyTask } from "@/lib/workbuddy/store";
import type { WorkbuddyPresentationBlock } from "@/lib/workbuddy/presentation";
import { conversationContinuationMessage, isWorkbuddyWorkspaceUrl, parseConversationContinuation, shouldContinueInsideConversation, shouldOpenEmbeddedContinuation } from "@/lib/workbuddy/continuation-navigation";
import { splitAncillaryResearchSection } from "@/lib/workbuddy/presentation-content";
import { workbuddyUserVisibleText } from "@/lib/workbuddy/user-visible-text";
import {
  selectedWorkbuddyCapabilityId,
  serializeWorkbuddyComposerContext,
  type WorkbuddyComposerContextItem,
} from "@/lib/workbuddy/composer-context";

type Workspace = {
  tasks: WorkbuddyTask[];
  customers: Array<{
    id: string;
    display_name: string;
    stage: string;
    tags: string[];
    needs_summary: string;
    next_action: string;
    next_action_at: string | null;
  }>;
  automations: Array<{
    id: string;
    name: string;
    trigger_type: string;
    instruction: string;
    schedule_text: string;
    enabled: boolean;
    next_run_at: string | null;
  }>;
  stats: { total: number; running: number; waiting: number; completed: number };
};
type MentionWork = {
  id: string;
  title: string;
  content: string;
  platform: string;
  updatedAt: string;
};
type ComposerContextItem = WorkbuddyComposerContextItem;
type WorkbuddySkill = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  scenario: WorkbuddyScenario;
  usageCount: number;
  kind: "system" | "app";
};
type SystemCapability = {
  id: string;
  name: string;
  description: string;
  systemSkill?: boolean;
  skillIcon?: string;
  skillOrder?: number;
};
type LiveExecutionEvent = {
  type: string;
  message: string;
  taskId?: string;
  data?: Record<string, unknown>;
  at?: string;
};
const emptyWorkspace: Workspace = {
  tasks: [],
  customers: [],
  automations: [],
  stats: { total: 0, running: 0, waiting: 0, completed: 0 },
};
const scenarioLabels: Record<string, string> = {
  content: "内容经营",
  video: "视频创作",
  customer: "客户经营",
  product: "产品研究",
  team: "团队管理",
  research: "行业研究",
  general: "自主执行",
};
const statusLabels: Record<string, string> = {
  planning: "规划中",
  running: "执行中",
  waiting_approval: "待验收",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  pending: "等待",
  approved: "已通过",
  rejected: "需调整",
};
const fallbackSkillOrder = [
  "xiaohongshu-studio",
  "traffic-copy",
  "video-cover",
  "image-card",
  "wechat-studio",
  "ppt-maker",
  "link-remix",
  "digital-human-video",
];
function skillScenario(app: CreationApp): WorkbuddyScenario {
  if (app.slug === "digital-human-video") return "video";
  if (app.category === "growth") return "team";
  return "content";
}
function buildAppSkills(usage: Map<string, number>): WorkbuddySkill[] {
  return creationApps
    .filter((app) => !hiddenWorkspaceCardSlugs.has(app.slug))
    .map((app) => ({
      id: `app.${app.slug}`,
      slug: app.slug,
      title: app.name,
      description: app.description,
      icon: app.emoji,
      scenario: skillScenario(app),
      usageCount: usage.get(app.slug) ?? usage.get(app.id) ?? 0,
      kind: "app" as const,
    }))
    .sort(
      (left, right) =>
        right.usageCount - left.usageCount ||
        (fallbackSkillOrder.indexOf(left.slug) < 0
          ? 999
          : fallbackSkillOrder.indexOf(left.slug)) -
          (fallbackSkillOrder.indexOf(right.slug) < 0
            ? 999
            : fallbackSkillOrder.indexOf(right.slug)) ||
        left.title.localeCompare(right.title, "zh-CN"),
    );
}
function buildSystemSkills(capabilities: SystemCapability[]): WorkbuddySkill[] {
  return capabilities
    .filter((item) => item.systemSkill)
    .map((item): WorkbuddySkill => ({
      id: item.id,
      slug: item.id,
      title: item.name,
      description: item.description,
      icon: item.skillIcon || "✦",
      scenario:
        item.id === "mcp.openchatcut"
          ? "video"
          : item.id.includes("research")
            ? "research"
            : item.id.includes("customer")
              ? "customer"
              : item.id.includes("product")
                ? "product"
                : "general",
      usageCount: 0,
      kind: "system",
    }))
    .sort(
      (a, b) =>
        (capabilities.find((item) => item.id === a.id)?.skillOrder ?? 999) -
        (capabilities.find((item) => item.id === b.id)?.skillOrder ?? 999),
    );
}
function XiaoguAvatar() {
  return (
    <span className="avatar">
      <img alt="小谷" src={appPath("/brand/xiaogu-icon.png")} />
    </span>
  );
}
function displayMessageContent(content: string) {
  const continuation = parseConversationContinuation(content);
  if (continuation?.userLabel) return continuation.userLabel;
  return workbuddyUserVisibleText(content);
}
function friendlyExecutionError(message: string) {
  return /fetch failed|network error|econnreset|socket hang up/i.test(message)
    ? "主模型连接在返回内容前中断，本次没有调用创作应用，也不会扣除应用点数。请直接重试。"
    : message;
}

export function WorkbuddyPageClient() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [task, setTask] = useState<WorkbuddyTask | null>(null);
  const [objective, setObjective] = useState("");
  const [contextItems, setContextItems] = useState<ComposerContextItem[]>([]);
  const [scenario, setScenario] = useState<WorkbuddyScenario>("general");
  const [selectedSkill, setSelectedSkill] = useState<WorkbuddySkill | null>(
    null,
  );
  const [appUsage, setAppUsage] = useState<Map<string, number>>(new Map());
  const [systemCapabilities, setSystemCapabilities] = useState<
    SystemCapability[]
  >([]);
  const [followup, setFollowup] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [followupContextItems, setFollowupContextItems] = useState<
    ComposerContextItem[]
  >([]);
  const [leftTab, setLeftTab] = useState<"tasks" | "spaces">("tasks");
  const [search, setSearch] = useState("");
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("chat");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveExecutionEvent[]>([]);
  const [streamedContent, setStreamedContent] = useState("");
  const [submittedObjective, setSubmittedObjective] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState("");
  const [mentionWorks, setMentionWorks] = useState<MentionWork[]>([]);
  const [applicationWorkspace, setApplicationWorkspace] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const executionAbortRef = useRef<AbortController | null>(null);
  const executingTaskIdRef = useRef("");
  usePageMeta({
    title: "Workbuddy · 专业服务 AI 生产力工作台",
    description: "一句话指挥财经、财富、保险与通用专业团队",
  });

  async function loadWorkspace(signal?: AbortSignal) {
    try {
      const response = await fetch(apiPath("/api/workbuddy/tasks"), {
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as {
        workspace?: Workspace;
        error?: string;
      };
      if (!response.ok || !payload.workspace)
        throw new Error(payload.error || "加载失败");
      setWorkspace(payload.workspace);
      setError("");
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(cause instanceof Error ? cause.message : "工作台加载失败");
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadWorkspace(controller.signal));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("task")?.trim();
    if (id) void openTask(id);
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") !== "video") return;
      setScenario("video");
      const requested = params.get("objective")?.trim();
      if (requested) setObjective(requested);
    });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiPath("/api/creation/hub?view=works&page=1&pageSize=8"), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((payload: { works?: { items?: MentionWork[] } }) =>
        setMentionWorks(payload.works?.items ?? []),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiPath("/api/creation/hub"), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then(
        (payload: {
          hub?: { appUsage?: Array<{ appId: string; usedCount: number }> };
        }) =>
          setAppUsage(
            new Map(
              (payload.hub?.appUsage ?? []).map((item) => [
                item.appId,
                item.usedCount,
              ]),
            ),
          ),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiPath("/api/workbuddy/capabilities"), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((payload: { capabilities?: SystemCapability[] }) =>
        setSystemCapabilities(payload.capabilities ?? []),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  async function openTask(id: string) {
    setApplicationWorkspace(null);
    setBusy("open");
    try {
      const response = await fetch(apiPath(`/api/workbuddy/tasks/${id}`), {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        task?: WorkbuddyTask;
        error?: string;
      };
      if (!response.ok || !payload.task)
        throw new Error(payload.error || "任务读取失败");
      setTask(payload.task);
      setHistoryOpen(false);
      setMobilePane("chat");
      const url = new URL(window.location.href);
      url.searchParams.set("task", id);
      window.history.replaceState(null, "", url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "任务读取失败");
    } finally {
      setBusy("");
    }
  }
  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!objective.trim()) return;
    const executionController = new AbortController();
    executionAbortRef.current = executionController;
    executingTaskIdRef.current = "";
    setSubmittedObjective(objective);
    setBusy("create");
    setError("");
    setLiveEvents([]);
    setStreamedContent("");
    const context = serializeWorkbuddyComposerContext(
      contextItems,
      contextTypeLabel,
    );
    try {
      const response = await fetch(apiPath("/api/workbuddy/tasks/stream"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify({
          objective,
          context,
          scenario,
          requestedCapabilityId: selectedSkill?.id,
        }),
        signal: executionController.signal,
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || "任务创建失败");
      }
      setMobilePane("chat");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let openedTaskId = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const line = block
            .split("\n")
            .find((item) => item.startsWith("data: "));
          if (!line) continue;
          const streamEvent = JSON.parse(line.slice(6)) as LiveExecutionEvent;
          if (streamEvent.type === "error")
            throw new Error(streamEvent.message);
          if (streamEvent.type === "content.delta")
            setStreamedContent((value) => value + streamEvent.message);
          else setLiveEvents((value) => [...value, streamEvent]);
          if (
            streamEvent.type === "task.created" &&
            streamEvent.taskId &&
            !openedTaskId
          ) {
            openedTaskId = streamEvent.taskId;
            executingTaskIdRef.current = streamEvent.taskId;
            setObjective("");
            setContextItems([]);
            setSelectedSkill(null);
            setScenario("general");
            void fetch(apiPath(`/api/workbuddy/tasks/${streamEvent.taskId}`), {
              cache: "no-store",
            })
              .then((item) => item.json())
              .then((payload: { task?: WorkbuddyTask }) => {
                if (payload.task) setTask(payload.task);
              })
              .catch(() => undefined);
          }
          const streamedTask = streamEvent.data?.task as
            WorkbuddyTask | undefined;
          if (
            (streamEvent.type === "task.completed" ||
              streamEvent.type === "done") &&
            streamedTask
          )
            setTask(streamedTask);
        }
      }
      await loadWorkspace();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(cause instanceof Error ? cause.message : "任务创建失败");
    } finally {
      executionAbortRef.current = null;
      setBusy("");
    }
  }
  async function runContinuation(
    message: string,
    attachedItems: ComposerContextItem[],
    editMessageId?: string,
  ) {
    if (busy || !task || !message.trim()) return;
    const executionController = new AbortController();
    executionAbortRef.current = executionController;
    executingTaskIdRef.current = task.id;
    setBusy("continue");
    setLiveEvents([]);
    setStreamedContent("");
    const attachedContext = serializeWorkbuddyComposerContext(
      attachedItems,
      contextTypeLabel,
    );
    // A workflow continuation is an explicit user selection, not a routing
    // hint. Send it as control data as well as keeping the durable protocol in
    // the message, so natural-language matching can never override it.
    const requestedCapabilityId =
      parseConversationContinuation(message)?.targetCapabilityId ??
      selectedWorkbuddyCapabilityId(attachedItems);
    if (!editMessageId) {
      setFollowup("");
      setFollowupContextItems([]);
    }
    try {
      const response = await fetch(
        apiPath(`/api/workbuddy/tasks/${task.id}/stream`),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body: JSON.stringify({
            message,
            context: attachedContext,
            editMessageId,
            requestedCapabilityId,
          }),
          signal: executionController.signal,
        },
      );
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error || "继续执行失败");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          const line = block
            .split("\n")
            .find((item) => item.startsWith("data: "));
          if (!line) continue;
          const streamEvent = JSON.parse(line.slice(6)) as LiveExecutionEvent;
          if (streamEvent.type === "error")
            throw new Error(streamEvent.message);
          if (streamEvent.type === "workspace.open" && typeof streamEvent.data?.url === "string")
            setApplicationWorkspace({ url: streamEvent.data.url, title: typeof streamEvent.data.title === "string" ? streamEvent.data.title : "继续当前作品" });
          if (streamEvent.type === "conversation.branched")
            setTask((current) => {
              if (!current) return current;
              const edited = current.messages?.find(
                (item) => item.id === editMessageId,
              );
              const cutoff = edited ? new Date(edited.created_at).getTime() : 0;
              return {
                ...current,
                messages: current.messages?.filter(
                  (item) => new Date(item.created_at).getTime() < cutoff,
                ),
                artifacts: [],
                steps: [],
                approvals: [],
                invocations: [],
              };
            });
          if (streamEvent.type === "content.delta")
            setStreamedContent((value) => value + streamEvent.message);
          else setLiveEvents((value) => [...value, streamEvent]);
          const streamedTask = streamEvent.data?.task as
            WorkbuddyTask | undefined;
          if (
            (streamEvent.type === "task.completed" ||
              streamEvent.type === "done") &&
            streamedTask
          )
            setTask(streamedTask);
        }
      }
      await loadWorkspace();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        if (!editMessageId) {
          setFollowup(message);
          setFollowupContextItems(attachedItems);
        }
        setError(cause instanceof Error ? cause.message : "继续执行失败");
      }
    } finally {
      executionAbortRef.current = null;
      setBusy("");
    }
  }
  async function continueTask(event: FormEvent) {
    event.preventDefault();
    const message = followup.trim();
    if (!message || !task) return;
    if (busy) {
      const queuedContext = serializeWorkbuddyComposerContext(
        followupContextItems,
        contextTypeLabel,
      );
      const queuedCapabilityId = selectedWorkbuddyCapabilityId(
        followupContextItems,
      );
      setFollowup("");
      setPendingUserMessage(message);
      try {
        const response = await fetch(
          apiPath(`/api/workbuddy/tasks/${task.id}`),
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "continue-task",
              message,
              context: queuedContext,
              requestedCapabilityId: queuedCapabilityId,
            }),
          },
        );
        const payload = (await response.json()) as {
          task?: WorkbuddyTask;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "补充要求排队失败");
        setFollowupContextItems([]);
        if (payload.task) setTask(payload.task);
        setLiveEvents((value) => [
          ...value,
          {
            type: "request.queued",
            message: "补充要求已排队，将在当前步骤结束后应用",
            taskId: task.id,
            at: new Date().toISOString(),
          },
        ]);
      } catch (cause) {
        setFollowup(message);
        setError(cause instanceof Error ? cause.message : "补充要求排队失败");
      } finally {
        setPendingUserMessage("");
      }
      return;
    }
    setPendingUserMessage(message);
    await runContinuation(message, followupContextItems);
    setPendingUserMessage("");
  }
  async function stopExecution() {
    executionAbortRef.current?.abort();
    const taskId = executingTaskIdRef.current || task?.id;
    if (!taskId) {
      setBusy("");
      setLiveEvents((value) => [
        ...value,
        {
          type: "task.cancelled",
          message: "已停止建立任务",
          at: new Date().toISOString(),
        },
      ]);
      return;
    }
    try {
      const response = await fetch(apiPath(`/api/workbuddy/tasks/${taskId}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel-task" }),
      });
      const payload = (await response.json()) as { task?: WorkbuddyTask };
      if (payload.task) setTask(payload.task);
      await loadWorkspace();
    } finally {
      setBusy("");
      setLiveEvents((value) => [
        ...value,
        {
          type: "task.cancelled",
          message: "已停止本次执行",
          taskId,
          at: new Date().toISOString(),
        },
      ]);
    }
  }
  const filteredTasks = workspace.tasks.filter((item) =>
    `${item.title} ${item.objective}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const availableSkills = [
    ...buildSystemSkills(systemCapabilities),
    ...buildAppSkills(appUsage),
  ];

  return (
    <div
      className={`wbApp ${task ? "wbTaskMode" : "wbHomeMode"} ${historyOpen ? "wbHistoryOpen" : ""}`}
    >
      <nav className="wbMobileSwitch">
        <button
          className={mobilePane === "list" ? "active" : ""}
          onClick={() => setMobilePane("list")}
        >
          任务
        </button>
        <button
          className={mobilePane === "chat" ? "active" : ""}
          onClick={() => setMobilePane("chat")}
        >
          对话
        </button>
      </nav>
      <aside
        className={`wbTaskRail ${mobilePane === "list" ? "mobileActive" : ""}`}
      >
        <header>
          <div className="wbLogo">
            <i>谷</i>
            <span>
              <strong>任务与空间</strong>
              <small>小谷 Workbuddy</small>
            </span>
            <button
              aria-label="关闭任务抽屉"
              className="wbRailClose"
              onClick={() => setHistoryOpen(false)}
            >
              ×
            </button>
          </div>
          <button
            className="wbNewTask"
            onClick={() => {
              setTask(null);
              setHistoryOpen(false);
              setMobilePane("chat");
              const url = new URL(window.location.href);
              url.searchParams.delete("task");
              window.history.replaceState(null, "", url);
            }}
          >
            ＋ 新建任务
          </button>
        </header>
        <div className="wbRailTabs">
          <button
            className={leftTab === "tasks" ? "active" : ""}
            onClick={() => setLeftTab("tasks")}
          >
            任务
          </button>
          <button
            className={leftTab === "spaces" ? "active" : ""}
            onClick={() => setLeftTab("spaces")}
          >
            空间
          </button>
        </div>
        {leftTab === "tasks" ? (
          <>
            <label className="wbSearch">
              <span>⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索任务"
              />
            </label>
            <div className="wbTaskList">
              {filteredTasks.map((item) => (
                <button
                  className={task?.id === item.id ? "active" : ""}
                  onClick={() => void openTask(item.id)}
                  key={item.id}
                >
                  <span>
                    <i className={`status-${item.status}`} />
                    <strong>{item.title}</strong>
                  </span>
                  <p>{displayMessageContent(item.objective)}</p>
                  <footer>
                    <em>{statusLabels[item.status] || item.status}</em>
                    <time>{formatDate(item.updated_at)}</time>
                  </footer>
                </button>
              ))}
              {!filteredTasks.length ? (
                <p className="wbRailEmpty">还没有任务</p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="wbSpaces">
            <button className="active">
              <i>专</i>
              <span>
                <strong>我的专业工作空间</strong>
                <small>{workspace.tasks.length} 个任务</small>
              </span>
            </button>
            <button>
              <i>＋</i>
              <span>
                <strong>新建工作空间</strong>
                <small>按客户、团队或项目组织任务</small>
              </span>
            </button>
          </div>
        )}
        <footer>
          <a href={appPath("/avatar")}>数字分身</a>
          <a href={appPath("/create")}>创作工具</a>
        </footer>
      </aside>
      <button
        aria-label="关闭任务抽屉"
        className="wbDrawerBackdrop"
        onClick={() => setHistoryOpen(false)}
        type="button"
      />

      <main
        className={`wbConversation ${mobilePane === "chat" ? "mobileActive" : ""}`}
      >
        {error ? (
          <div className="wbError">
            <span>{error}</span>
            <button onClick={() => setError("")}>×</button>
          </div>
        ) : null}
        {task ? (
          <TaskConversation
            task={task}
            busy={busy}
            liveEvents={liveEvents}
            streamedContent={streamedContent}
            followup={followup}
            setFollowup={setFollowup}
            pendingUserMessage={pendingUserMessage}
            onHistory={() => setHistoryOpen(true)}
            onStop={() => void stopExecution()}
            onSubmit={continueTask}
            onEditSend={(messageId, replacement) =>
              runContinuation(replacement, [], messageId)
            }
            onOpenWorkspace={(url, title) =>
              setApplicationWorkspace({ url, title })
            }
          />
        ) : busy === "create" ? (
          <PendingTaskConversation
            objective={submittedObjective}
            setObjective={setSubmittedObjective}
            followup={followup}
            setFollowup={setFollowup}
            contextItems={followupContextItems}
            setContextItems={setFollowupContextItems}
            customers={workspace.customers}
            tasks={workspace.tasks}
            works={mentionWorks}
            events={liveEvents}
            content={streamedContent}
            onHistory={() => setHistoryOpen(true)}
            onStop={() => void stopExecution()}
          />
        ) : (
          <NewTaskComposer
            objective={objective}
            setObjective={setObjective}
            contextItems={contextItems}
            setContextItems={setContextItems}
            scenario={scenario}
            setScenario={setScenario}
            selectedSkill={selectedSkill}
            setSelectedSkill={setSelectedSkill}
            skills={availableSkills}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            taskCount={workspace.tasks.length}
            customers={workspace.customers}
            tasks={workspace.tasks}
            works={mentionWorks}
            setWorks={setMentionWorks}
            onHistory={() => setHistoryOpen(true)}
            onSubmit={createTask}
          />
        )}
        {task ? (
          <FollowupComposer
            value={followup}
            setValue={setFollowup}
            contextItems={followupContextItems}
            setContextItems={setFollowupContextItems}
            customers={workspace.customers}
            tasks={workspace.tasks}
            works={mentionWorks}
            skills={availableSkills}
            running={busy === "create" || busy === "continue"}
            cancelled={task.status === "cancelled"}
            onStop={() => void stopExecution()}
            onSubmit={continueTask}
          />
        ) : null}
        {applicationWorkspace ? (
          <ApplicationWorkspace
            title={applicationWorkspace.title}
            url={applicationWorkspace.url}
            onClose={() => setApplicationWorkspace(null)}
          />
        ) : null}
      </main>
    </div>
  );
}

function ApplicationWorkspace({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  const separator = url.includes("?") ? "&" : "?";
  return (
    <section className="wbApplicationWorkspace" aria-label={`${title}工作区`}>
      <header>
        <button onClick={onClose} type="button">← 返回对话</button>
        <div>
          <small>当前任务 · 应用步骤</small>
          <strong>{title}</strong>
        </div>
        <a href={appPath(url)}>在独立页面打开 ↗</a>
      </header>
      <iframe
        src={appPath(`${url}${separator}embedded=workbuddy`)}
        title={`${title}工作区`}
      />
    </section>
  );
}

function NewTaskComposer(p: {
  objective: string;
  setObjective: (v: string) => void;
  contextItems: ComposerContextItem[];
  setContextItems: (v: ComposerContextItem[]) => void;
  scenario: WorkbuddyScenario;
  setScenario: (v: WorkbuddyScenario) => void;
  selectedSkill: WorkbuddySkill | null;
  setSelectedSkill: (v: WorkbuddySkill | null) => void;
  skills: WorkbuddySkill[];
  busy: string;
  setBusy: (v: string) => void;
  setError: (v: string) => void;
  taskCount: number;
  customers: Workspace["customers"];
  tasks: WorkbuddyTask[];
  works: MentionWork[];
  setWorks: (v: MentionWork[]) => void;
  onHistory: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [attachmentSkillMenu, setAttachmentSkillMenu] = useState<
    "system" | "app" | false
  >(false);
  const [trigger, setTrigger] = useState<{
    mode: "mention" | "command";
    query: string;
    start: number;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState({
    left: 18,
    top: 52,
    above: false,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const query = trigger?.query.toLowerCase() ?? "";
  const mentionCustomers = p.customers
    .filter((item) =>
      `${item.display_name}${item.stage}${item.tags.join("")}`
        .toLowerCase()
        .includes(query),
    )
    .slice(0, 5);
  const mentionTasks = p.tasks
    .filter((item) =>
      `${item.title}${item.objective}`.toLowerCase().includes(query),
    )
    .slice(0, 5);
  const filteredWorks = p.works
    .filter((item) =>
      `${item.title}${item.platform}`.toLowerCase().includes(query),
    )
    .slice(0, 5);
  const commands = p.skills.filter((item) =>
    `${item.title}${item.description}`.toLowerCase().includes(query),
  );
  const menuOptions =
    trigger?.mode === "command"
      ? commands.map((item) => ({
          key: `command-${item.slug}`,
          group: item.kind === "system" ? "系统 Skills" : "应用 Skills",
          icon: item.icon,
          label: `/${item.title}`,
          detail: item.usageCount
            ? `使用过 ${item.usageCount} 次 · ${item.description}`
            : item.description,
          select: () => selectCommand(item),
        }))
      : [
          ...mentionCustomers.map((item) => ({
            key: `customer-${item.id}`,
            group: "客户档案",
            icon: "客",
            label: item.display_name,
            detail: `${item.stage} · ${item.next_action || "暂无下一步"}`,
            select: () =>
              addContext(
                {
                  id: `customer-${item.id}`,
                  type: "customer",
                  label: item.display_name,
                  meta: item.stage,
                  content: `阶段：${item.stage}\n标签：${item.tags.join("、") || "无"}\n需求摘要：${item.needs_summary || "未记录"}\n下一步：${item.next_action || "未记录"}`,
                },
                "customer",
              ),
          })),
          ...mentionTasks.map((item) => ({
            key: `task-${item.id}`,
            group: "历史任务",
            icon: "任",
            label: item.title,
            detail: statusLabels[item.status] || item.status,
            select: () =>
              addContext({
                id: `task-${item.id}`,
                type: "task",
                label: item.title,
                meta: statusLabels[item.status] || item.status,
                content: `原目标：${displayMessageContent(item.objective)}\n任务摘要：${workbuddyUserVisibleText(item.summary || "暂无摘要")}`,
              }),
          })),
          ...filteredWorks.map((item) => ({
            key: `work-${item.id}`,
            group: "创作历史",
            icon: "稿",
            label: item.title,
            detail: item.platform,
            select: () =>
              addContext({
                id: `work-${item.id}`,
                type: "work",
                label: item.title,
                meta: item.platform,
                content: `类型：${item.platform}\n${item.content.slice(0, 12000)}`,
              }),
          })),
        ];
  const setWorks = p.setWorks;
  useEffect(() => {
    if (trigger?.mode !== "mention" || query.length < 1) return;
    const timer = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      void fetch(
        apiPath(
          `/api/creation/hub?view=works&page=1&pageSize=10&search=${encodeURIComponent(query)}`,
        ),
        { cache: "no-store", signal: controller.signal },
      )
        .then((response) => response.json())
        .then((payload: { works?: { items?: MentionWork[] } }) => {
          if (payload.works?.items) setWorks(payload.works.items);
        })
        .catch(() => undefined);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [trigger?.mode, query, setWorks]);
  useEffect(() => {
    function close(event: PointerEvent) {
      if (
        composerRef.current &&
        !composerRef.current.contains(event.target as Node)
      ) {
        setTrigger(null);
        setAttachmentMenu(false);
        setAttachmentSkillMenu(false);
      }
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function replaceTrigger() {
    if (!trigger) return p.objective;
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? p.objective.length;
    return p.objective.slice(0, trigger.start) + p.objective.slice(caret);
  }
  function finishSelection() {
    const next = replaceTrigger();
    p.setObjective(next);
    setTrigger(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        trigger?.start ?? next.length,
        trigger?.start ?? next.length,
      );
    });
  }
  function addContext(
    item: ComposerContextItem,
    nextScenario?: WorkbuddyScenario,
  ) {
    if (!p.contextItems.some((existing) => existing.id === item.id))
      p.setContextItems([...p.contextItems, item]);
    if (nextScenario) p.setScenario(nextScenario);
    finishSelection();
  }
  function rememberSkill(skill: WorkbuddySkill) {
    p.setSelectedSkill(skill);
    p.setScenario(skill.scenario);
    p.setContextItems([
      ...p.contextItems.filter((item) => item.id !== "selected-skill"),
      {
        id: "selected-skill",
        type: "file",
        label: skill.title,
        meta: "Skill",
        content: `用户已明确选择${skill.kind === "system" ? "系统" : "应用"} Skill。能力 ID：${skill.id}。请优先调用“${skill.title}”，不要替换成其他能力。`,
      },
    ]);
  }
  function selectCommand(skill: WorkbuddySkill) {
    rememberSkill(skill);
    finishSelection();
  }
  function selectSkill(skill: WorkbuddySkill) {
    rememberSkill(skill);
    setTrigger(null);
    setAttachmentMenu(false);
    setAttachmentSkillMenu(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }
  function detectTrigger(value: string, caret: number) {
    const before = value.slice(0, caret);
    const match = before.match(/(?:^|\s)([@/])([^\s@/]*)$/);
    if (!match) {
      setTrigger(null);
      return;
    }
    const marker = match[1];
    const start =
      before.length - match[0].length + (match[0].startsWith(" ") ? 1 : 0);
    setActiveIndex(0);
    setTrigger({
      mode: marker === "@" ? "mention" : "command",
      query: match[2],
      start,
    });
    requestAnimationFrame(updateMenuPosition);
  }
  function updateMenuPosition() {
    const textarea = textareaRef.current;
    const composer = composerRef.current;
    if (!textarea || !composer) return;
    const caret = getTextareaCaretPosition(textarea, textarea.selectionStart);
    const textareaRect = textarea.getBoundingClientRect();
    const composerRect = composer.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(
        textareaRect.left - composerRect.left + caret.left,
        composerRect.width - 390,
      ),
    );
    const preferredTop =
      textareaRect.top - composerRect.top + caret.top + caret.lineHeight + 8;
    const roomBelow =
      window.innerHeight - (textareaRect.top + caret.top + caret.lineHeight);
    const above = roomBelow < 300;
    setMenuPosition({
      left,
      top: above
        ? Math.max(8, textareaRect.top - composerRect.top + caret.top - 286)
        : preferredTop,
      above,
    });
  }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (trigger) {
      if (event.key === "Escape") {
        event.preventDefault();
        setTrigger(null);
        return;
      }
      if (!menuOptions.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(
          (value) =>
            (value +
              (event.key === "ArrowDown" ? 1 : -1) +
              menuOptions.length) %
            menuOptions.length,
        );
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        menuOptions[activeIndex]?.select();
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!p.busy && p.objective.trim()) composerRef.current?.requestSubmit();
    }
  }
  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    setAttachmentMenu(false);
    p.setBusy("attachment");
    p.setError("");
    try {
      const parsed = await Promise.all(
        files.map(async (file) => {
          const form = new FormData();
          form.append("file", file);
          const response = await fetch(apiPath("/api/creation/import-text"), {
            method: "POST",
            body: form,
          });
          const payload = (await response.json()) as {
            text?: string;
            error?: string;
          };
          if (!response.ok || !payload.text)
            throw new Error(
              `${file.name}：${payload.error || "没有可读取的文字"}`,
            );
          return {
            id: `file-${file.name}-${file.size}-${file.lastModified}`,
            type: "file" as const,
            label: file.name,
            meta: `${Math.max(1, Math.round(file.size / 1024))} KB`,
            content: payload.text,
          };
        }),
      );
      p.setContextItems([
        ...p.contextItems,
        ...parsed.filter(
          (item) => !p.contextItems.some((existing) => existing.id === item.id),
        ),
      ]);
    } catch (cause) {
      p.setError(cause instanceof Error ? cause.message : "文件上传失败");
    } finally {
      p.setBusy("");
    }
  }
  return (
    <section className="wbNewTaskScreen">
      <div className="wbHomeTop">
        <button
          className="wbTaskDrawerTrigger"
          onClick={p.onHistory}
          type="button"
        >
          <span>☰</span> 任务 {p.taskCount ? <em>{p.taskCount}</em> : null}
        </button>
      </div>
      <div className="wbWelcome">
        <h1>
          <img alt="小谷" src={appPath("/brand/xiaogu-icon.png")} />
          小谷 Workbuddy，我帮你
        </h1>
        <p>说出目标，我会自动选择合适的应用和工作流程</p>
      </div>
      <div className="wbQuickCapabilities">
        {p.skills
          .filter((skill) => skill.kind === "app")
          .slice(0, 6)
          .map((skill) => (
            <button
              aria-pressed={p.selectedSkill?.id === skill.id}
              className={p.selectedSkill?.id === skill.id ? "active" : ""}
              key={skill.id}
              onClick={() => selectSkill(skill)}
              type="button"
            >
              <i>{skill.icon}</i>
              {skill.title}
            </button>
          ))}
      </div>
      <form className="wbBigComposer" onSubmit={p.onSubmit} ref={composerRef}>
        {p.selectedSkill ? (
          <div
            className="wbWorkflowChip"
            role="group"
            aria-label="已选择 Skill"
          >
            <i>{p.selectedSkill.icon}</i>
            <strong>{p.selectedSkill.title}</strong>
            <button
              aria-label="移除已选 Skill"
              onClick={() => {
                p.setSelectedSkill(null);
                p.setScenario("general");
                p.setContextItems(
                  p.contextItems.filter((item) => item.id !== "selected-skill"),
                );
              }}
              type="button"
            >
              ×
            </button>
          </div>
        ) : null}
        <textarea
          aria-activedescendant={
            trigger && menuOptions[activeIndex]
              ? `wb-option-${menuOptions[activeIndex].key}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={trigger ? "wb-composer-menu" : undefined}
          autoFocus
          rows={6}
          maxLength={6000}
          placeholder="今天帮你做些什么？可直接粘贴文字，@ 引用资料，/ 选择 Skill"
          ref={textareaRef}
          value={p.objective}
          onChange={(e) => {
            p.setObjective(e.target.value);
            detectTrigger(e.target.value, e.target.selectionStart);
          }}
          onClick={() =>
            detectTrigger(
              p.objective,
              textareaRef.current?.selectionStart ?? p.objective.length,
            )
          }
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => {
            if (
              !["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(
                event.key,
              )
            )
              updateMenuPosition();
          }}
        />
        {trigger ? (
          <div
            className={`wbMentionMenu ${menuPosition.above ? "above" : ""}`}
            id="wb-composer-menu"
            role="listbox"
            style={{ left: menuPosition.left, top: menuPosition.top }}
          >
            <header>
              <strong>
                {trigger.mode === "mention" ? "引用资料" : "选择 Skill"}
              </strong>
              <kbd>↑↓ 选择　Enter 确认　Esc 关闭</kbd>
            </header>
            {menuOptions.map((item, index) => (
              <div className="wbMenuRow" key={item.key}>
                {index === 0 || menuOptions[index - 1]?.group !== item.group ? (
                  <em>{item.group}</em>
                ) : null}
                <button
                  aria-selected={activeIndex === index}
                  className={activeIndex === index ? "active" : ""}
                  id={`wb-option-${item.key}`}
                  onClick={item.select}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  type="button"
                >
                  <i>{item.icon}</i>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  {activeIndex === index ? <kbd>↵</kbd> : null}
                </button>
              </div>
            ))}
            {!menuOptions.length ? (
              <p>
                {trigger.mode === "mention"
                  ? "没有匹配的客户、任务或作品"
                  : "没有匹配的 Skill"}
              </p>
            ) : null}
          </div>
        ) : null}
        {p.contextItems.some((item) => item.id !== "selected-skill") ? (
          <div className="wbContextChips" aria-label="已引用资料">
            {p.contextItems
              .filter((item) => item.id !== "selected-skill")
              .map((item) => (
                <div className="wbAttachmentChip" key={item.id}>
                  <i>{contextTypeIcon(item.type)}</i>
                  <span>
                    <strong>{item.label}</strong>
                    <small>
                      {contextTypeLabel(item.type)} · {item.meta}
                    </small>
                  </span>
                  <button
                    aria-label={`移除${item.label}`}
                    onClick={() =>
                      p.setContextItems(
                        p.contextItems.filter(
                          (existing) => existing.id !== item.id,
                        ),
                      )
                    }
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        ) : null}
        <footer>
          <div className="wbAttachmentControl">
            <input
              accept=".txt,.md,.csv,.pdf,.docx"
              hidden
              multiple
              onChange={uploadFile}
              ref={fileRef}
              type="file"
            />
            <button
              aria-expanded={attachmentMenu || Boolean(attachmentSkillMenu)}
              aria-label="添加资料或选择 Skill"
              className="wbAddButton"
              type="button"
              onClick={() => {
                setAttachmentMenu((value) => !value);
                setAttachmentSkillMenu(false);
              }}
            >
              ＋
            </button>
            {attachmentMenu ? (
              <div className="wbAttachmentMenu">
                <button onClick={() => fileRef.current?.click()} type="button">
                  <i>↑</i>
                  <span>
                    <strong>添加本地文件</strong>
                    <small>PDF、Word、CSV、TXT、Markdown</small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    setAttachmentMenu(false);
                    setAttachmentSkillMenu("system");
                  }}
                  type="button"
                >
                  <i>✦</i>
                  <span>
                    <strong>系统 Skill</strong>
                    <small>转写、读取、查证与资料分析</small>
                  </span>
                  <b>›</b>
                </button>
                <button
                  onClick={() => {
                    setAttachmentMenu(false);
                    setAttachmentSkillMenu("app");
                  }}
                  type="button"
                >
                  <i>▦</i>
                  <span>
                    <strong>应用 Skill</strong>
                    <small>从应用广场能力中选择</small>
                  </span>
                  <b>›</b>
                </button>
              </div>
            ) : null}
            {attachmentSkillMenu ? (
              <div className="wbAttachmentMenu wbSkillSubmenu">
                <header>
                  <button
                    aria-label="返回"
                    onClick={() => {
                      setAttachmentSkillMenu(false);
                      setAttachmentMenu(true);
                    }}
                    type="button"
                  >
                    ‹
                  </button>
                  <strong>
                    {attachmentSkillMenu === "system"
                      ? "系统 Skill"
                      : "应用 Skill"}
                  </strong>
                </header>
                <div>
                  {p.skills
                    .filter((skill) => skill.kind === attachmentSkillMenu)
                    .map((skill) => (
                      <button
                        className={
                          p.selectedSkill?.id === skill.id ? "active" : ""
                        }
                        key={skill.id}
                        onClick={() => selectSkill(skill)}
                        type="button"
                      >
                        <span>{skill.title}</span>
                        {p.selectedSkill?.id === skill.id ? <b>✓</b> : null}
                      </button>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="wbComposerEnd">
            <span className="wbScenarioAuto">
              {p.busy === "attachment"
                ? "正在解析文件…"
                : p.scenario === "general"
                  ? "✦ 自动识别"
                  : `✦ ${scenarioLabels[p.scenario]}`}
            </span>
            <button
              className="send"
              disabled={Boolean(p.busy) || !p.objective.trim()}
            >
              {p.busy === "create" ? <i /> : "↑"}
            </button>
          </div>
        </footer>
      </form>
      <p className="wbSafety">
        内容由 AI 生成，请核验产品、客户及合规信息后使用。
      </p>
    </section>
  );
}

function PendingTaskConversation({
  objective,
  setObjective,
  followup,
  setFollowup,
  contextItems,
  setContextItems,
  customers,
  tasks,
  works,
  events,
  content,
  onHistory,
  onStop,
}: {
  objective: string;
  setObjective: (value: string) => void;
  followup: string;
  setFollowup: (value: string) => void;
  contextItems: ComposerContextItem[];
  setContextItems: (value: ComposerContextItem[]) => void;
  customers: Workspace["customers"];
  tasks: WorkbuddyTask[];
  works: MentionWork[];
  events: LiveExecutionEvent[];
  content: string;
  onHistory: () => void;
  onStop: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(objective);
  const [copied, setCopied] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [events.length, content]);
  function copy() {
    void navigator.clipboard.writeText(displayMessageContent(objective)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }
  return (
    <div className="wbChat wbPendingTask">
      <header>
        <div className="wbTaskHeading">
          <button
            className="wbTaskDrawerTrigger compact"
            onClick={onHistory}
            type="button"
          >
            <span>☰</span> 任务
          </button>
          <div>
            <span>自主执行</span>
            <h1>{displayMessageContent(objective)}</h1>
          </div>
        </div>
      </header>
      <div className="wbMessages" ref={messagesRef}>
        <article className="user wbMessage">
          <div className="wbMessageBody">
            {editing ? (
              <div className="wbInlineEdit">
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditing(false);
                  }}
                />
                <footer>
                  <span>当前执行已开始，修改会保留为下一条要求</span>
                  <div>
                    <button onClick={() => setEditing(false)} type="button">
                      取消
                    </button>
                    <button
                      disabled={!draft.trim()}
                      onClick={() => {
                        const revised = draft.trim();
                        setObjective(revised);
                        setFollowup(
                          `请以这段修订后的要求为准继续执行：\n${revised}`,
                        );
                        setEditing(false);
                      }}
                      type="button"
                    >
                      保存修改
                    </button>
                  </div>
                </footer>
              </div>
            ) : (
              <div className="wbUserBubble">{displayMessageContent(objective)}</div>
            )}
            <div className="wbMessageActions">
              <button aria-label="复制消息" onClick={copy} type="button">
                {copied ? "✓ 已复制" : "▣ 复制"}
              </button>
              <button
                aria-label="编辑消息"
                onClick={() => {
                  setDraft(objective);
                  setEditing(true);
                }}
                type="button"
              >
                ✎ 编辑
              </button>
            </div>
          </div>
        </article>
        <LiveExecution
          events={
            events.length
              ? events
              : [
                  {
                    type: "request.connecting",
                    message: "正在连接执行服务",
                    at: new Date().toISOString(),
                  },
                ]
          }
          content={content}
          running
        />
      </div>
      <FollowupComposer
        value={followup}
        setValue={setFollowup}
        contextItems={contextItems}
        setContextItems={setContextItems}
        customers={customers}
        tasks={tasks}
        works={works}
        running
        onStop={onStop}
      />
    </div>
  );
}

function FollowupComposer({
  value,
  setValue,
  contextItems,
  setContextItems,
  customers,
  tasks,
  works,
  skills = buildAppSkills(new Map()),
  running,
  cancelled = false,
  onStop,
  onSubmit,
  formRef,
}: {
  value: string;
  setValue: (value: string) => void;
  contextItems: ComposerContextItem[];
  setContextItems: (value: ComposerContextItem[]) => void;
  customers: Workspace["customers"];
  tasks: WorkbuddyTask[];
  works: MentionWork[];
  skills?: WorkbuddySkill[];
  running: boolean;
  cancelled?: boolean;
  onStop: () => void;
  onSubmit?: (event: FormEvent) => void;
  formRef?: React.RefObject<HTMLFormElement | null>;
}) {
  const [menu, setMenu] = useState<
    "attach" | "skills" | "mention" | "command" | null
  >(null);
  const [query, setQuery] = useState("");
  const [triggerStart, setTriggerStart] = useState(-1);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ownFormRef = useRef<HTMLFormElement>(null);
  const activeFormRef = formRef ?? ownFormRef;
  const selectedSkillItem = contextItems.find(
    (item) => item.id === "selected-skill",
  );
  const selectedSkill = selectedSkillItem
    ? (skills.find((skill) => skill.title === selectedSkillItem.label) ?? null)
    : null;
  const normalized = query.toLowerCase();
  const options =
    menu === "command" || menu === "skills"
      ? skills
          .filter((item) =>
            `${item.title}${item.description}`
              .toLowerCase()
              .includes(normalized),
          )
          .map((item) => ({
            key: `cmd-${item.slug}`,
            icon: item.icon,
            label: `/${item.title}`,
            detail: item.usageCount
              ? `使用过 ${item.usageCount} 次 · ${item.description}`
              : item.description,
            select: () => selectSkill(item),
          }))
      : [
          ...customers
            .filter((item) =>
              `${item.display_name}${item.stage}${item.tags.join("")}`
                .toLowerCase()
                .includes(normalized),
            )
            .slice(0, 5)
            .map((item) => ({
              key: `customer-${item.id}`,
              icon: "客",
              label: item.display_name,
              detail: `客户档案 · ${item.stage}`,
              select: () =>
                addContext({
                  id: `customer-${item.id}`,
                  type: "customer" as const,
                  label: item.display_name,
                  meta: item.stage,
                  content: `阶段：${item.stage}\n标签：${item.tags.join("、") || "无"}\n需求摘要：${item.needs_summary || "未记录"}\n下一步：${item.next_action || "未记录"}`,
                }),
            })),
          ...tasks
            .filter((item) =>
              `${item.title}${item.objective}`
                .toLowerCase()
                .includes(normalized),
            )
            .slice(0, 5)
            .map((item) => ({
              key: `task-${item.id}`,
              icon: "任",
              label: item.title,
              detail: `历史任务 · ${statusLabels[item.status] || item.status}`,
              select: () =>
                addContext({
                  id: `task-${item.id}`,
                  type: "task" as const,
                  label: item.title,
                  meta: statusLabels[item.status] || item.status,
                  content: `原目标：${displayMessageContent(item.objective)}\n任务摘要：${workbuddyUserVisibleText(item.summary || "暂无摘要")}`,
                }),
            })),
          ...works
            .filter((item) =>
              `${item.title}${item.platform}`
                .toLowerCase()
                .includes(normalized),
            )
            .slice(0, 5)
            .map((item) => ({
              key: `work-${item.id}`,
              icon: "稿",
              label: item.title,
              detail: `创作历史 · ${item.platform}`,
              select: () =>
                addContext({
                  id: `work-${item.id}`,
                  type: "work" as const,
                  label: item.title,
                  meta: item.platform,
                  content: `类型：${item.platform}\n${item.content.slice(0, 12000)}`,
                }),
            })),
        ];
  function clearTrigger(replacement = "") {
    const caret = inputRef.current?.selectionStart ?? value.length;
    const next =
      triggerStart >= 0
        ? value.slice(0, triggerStart) + replacement + value.slice(caret)
        : value + replacement;
    setValue(next);
    setMenu(null);
    setQuery("");
    setTriggerStart(-1);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function addContext(item: ComposerContextItem) {
    if (!contextItems.some((existing) => existing.id === item.id))
      setContextItems([...contextItems, item]);
    clearTrigger();
  }
  function selectSkill(skill: WorkbuddySkill) {
    setContextItems([
      ...contextItems.filter((item) => item.id !== "selected-skill"),
      {
        id: "selected-skill",
        type: "file",
        label: skill.title,
        meta: "Skill",
        content: `用户已明确选择${skill.kind === "system" ? "系统" : "应用"} Skill。能力 ID：${skill.id}。请优先调用“${skill.title}”，不要替换成其他能力。`,
      },
    ]);
    clearTrigger();
  }
  function detect(next: string, caret: number) {
    const match = next.slice(0, caret).match(/(?:^|\s)([@/])([^\s@/]*)$/);
    if (!match) {
      if (menu !== "attach") setMenu(null);
      return;
    }
    setTriggerStart(
      caret - match[0].length + (match[0].startsWith(" ") ? 1 : 0),
    );
    setQuery(match[2]);
    setMenu(match[1] === "@" ? "mention" : "command");
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 3);
    event.target.value = "";
    if (!files.length) return;
    setUploading(true);
    setMenu(null);
    try {
      const parsed = await Promise.all(
        files.map(async (file) => {
          const form = new FormData();
          form.append("file", file);
          const response = await fetch(apiPath("/api/creation/import-text"), {
            method: "POST",
            body: form,
          });
          const payload = (await response.json()) as {
            text?: string;
            error?: string;
          };
          if (!response.ok || !payload.text)
            throw new Error(payload.error || `${file.name} 无法读取`);
          return {
            id: `file-${file.name}-${file.size}-${file.lastModified}`,
            type: "file" as const,
            label: file.name,
            meta: `${Math.max(1, Math.round(file.size / 1024))} KB`,
            content: payload.text.slice(0, 12000),
          };
        }),
      );
      setContextItems([
        ...contextItems,
        ...parsed.filter(
          (item) => !contextItems.some((existing) => existing.id === item.id),
        ),
      ]);
    } finally {
      setUploading(false);
    }
  }
  return (
    <form
      className="wbFollowup wbUnifiedFollowup"
      onSubmit={onSubmit}
      ref={activeFormRef}
    >
      {selectedSkill ? (
        <div className="wbWorkflowChip" role="group" aria-label="已选择 Skill">
          <i>{selectedSkill.icon}</i>
          <strong>{selectedSkill.title}</strong>
          <button
            aria-label="移除已选 Skill"
            onClick={() =>
              setContextItems(
                contextItems.filter((item) => item.id !== "selected-skill"),
              )
            }
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}
      <textarea
        ref={inputRef}
        rows={1}
        placeholder="继续输入要求，@ 引用资料，/ 选择 Skill"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          detect(event.target.value, event.target.selectionStart);
        }}
        onClick={() =>
          detect(value, inputRef.current?.selectionStart ?? value.length)
        }
        onInput={(event) => {
          event.currentTarget.style.height = "auto";
          event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 168)}px`;
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && menu) {
            event.preventDefault();
            setMenu(null);
            return;
          }
          if (event.key === "Enter" && !event.shiftKey && !menu) {
            event.preventDefault();
            if (value.trim()) event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {contextItems.some((item) => item.id !== "selected-skill") ? (
        <div className="wbContextChips wbFollowupChips">
          {contextItems
            .filter((item) => item.id !== "selected-skill")
            .map((item) => (
              <div className="wbAttachmentChip" key={item.id}>
                <i>{contextTypeIcon(item.type)}</i>
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    {contextTypeLabel(item.type)} · {item.meta}
                  </small>
                </span>
                <button
                  aria-label={`移除${item.label}`}
                  onClick={() =>
                    setContextItems(
                      contextItems.filter(
                        (existing) => existing.id !== item.id,
                      ),
                    )
                  }
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      ) : null}
      {menu === "attach" ? (
        <div className="wbAttachmentMenu wbFollowupMenu">
          <button onClick={() => fileRef.current?.click()} type="button">
            <i>↑</i>
            <span>
              <strong>添加本地文件</strong>
              <small>PDF、Word、CSV、TXT、Markdown</small>
            </span>
          </button>
          <button
            onClick={() => {
              setQuery("");
              setMenu("skills");
            }}
            type="button"
          >
            <i>▦</i>
            <span>
              <strong>选择 Skill</strong>
              <small>当前步骤结束后作为独立新轮执行</small>
            </span>
          </button>
        </div>
      ) : null}
      {menu === "mention" || menu === "command" || menu === "skills" ? (
        <div className="wbMentionMenu wbFollowupMention">
          <header>
            <strong>{menu === "mention" ? "引用资料" : "选择 Skill"}</strong>
            <kbd>点击选择 · Esc 关闭</kbd>
          </header>
          {options.map((option) => (
            <div className="wbMenuRow" key={option.key}>
              <button onClick={option.select} type="button">
                <i>{option.icon}</i>
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
              </button>
            </div>
          ))}
          {!options.length ? <p>没有匹配内容</p> : null}
        </div>
      ) : null}
      <footer>
        <div className="wbFollowupTools">
          <input
            accept=".txt,.md,.csv,.pdf,.docx"
            hidden
            multiple
            onChange={upload}
            ref={fileRef}
            type="file"
          />
          <button
            aria-expanded={menu === "attach"}
            aria-label="添加资料"
            className="wbFollowupAdd"
            onClick={() =>
              setMenu((current) => (current === "attach" ? null : "attach"))
            }
            type="button"
          >
            ＋
          </button>
          <span className="wbComposerHint">
            {uploading ? "正在解析文件…" : running ? "Enter 排队 · 当前步骤结束后自动处理" : "Enter 发送 · Shift+Enter 换行"}
          </span>
        </div>
        <div className="wbFollowupActions">
          {running ? (
          <button
            className="wbInlineStop"
            aria-label="停止执行"
            onClick={onStop}
            type="button"
          >
            ■
          </button>
          ) : null}
          <button
            aria-label={running ? "排队发送" : cancelled ? "继续任务" : "发送消息"}
            className={`send ${cancelled ? "resume" : ""}`}
            disabled={!value.trim() || uploading}
          >
            {running ? "排队" : cancelled ? "继续" : "↑"}
          </button>
        </div>
      </footer>
    </form>
  );
}

function TaskConversation({
  task,
  busy,
  liveEvents,
  streamedContent,
  followup,
  setFollowup,
  pendingUserMessage,
  onHistory,
  onStop,
  onSubmit,
  onEditSend,
  onOpenWorkspace,
}: {
  task: WorkbuddyTask;
  busy: string;
  liveEvents: LiveExecutionEvent[];
  streamedContent: string;
  followup: string;
  setFollowup: (v: string) => void;
  pendingUserMessage: string;
  onHistory: () => void;
  onStop: () => void;
  onSubmit: (e: FormEvent) => void;
  onEditSend: (messageId: string, replacement: string) => Promise<void>;
  onOpenWorkspace: (url: string, title: string) => void;
}) {
  const storedMessages = task.messages?.length
    ? task.messages
    : [
        {
          id: "objective",
          role: "user" as const,
          message_type: "objective",
          content: task.objective,
          metadata_json: {},
          created_at: task.created_at,
        },
      ];
  const messages = pendingUserMessage
    ? [
        ...storedMessages,
        {
          id: "pending-user",
          role: "user" as const,
          message_type: "followup",
          content: pendingUserMessage,
          metadata_json: { pending: true },
          created_at: new Date().toISOString(),
        },
      ]
    : storedMessages;
  const running = busy === "create" || busy === "continue";
  const formRef = useRef<HTMLFormElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [feedbackOverrides, setFeedbackOverrides] = useState<Record<string, "up" | "down" | null>>({});
  const persistedFeedback = Object.fromEntries((task.messages ?? []).flatMap(message => message.metadata_json?.feedback === "up" || message.metadata_json?.feedback === "down" ? [[message.id, message.metadata_json.feedback]] : [])) as Record<string, "up" | "down">;
  const feedback = { ...persistedFeedback, ...feedbackOverrides };
  const currentExecutionFailed = liveEvents.some(
    (event) => event.type === "task.failed" || event.type === "error",
  );
  const persistedExecutionFailed =
    !liveEvents.length && task.status === "failed";
  const executionAnchor =
    running || currentExecutionFailed || persistedExecutionFailed
      ? -1
      : messages.findLastIndex((message) => message.role === "assistant");
  const executionNode =
    liveEvents.length || streamedContent ? (
      <LiveExecution
        events={liveEvents}
        content={streamedContent}
        running={running}
      />
    ) : task.steps?.length || persistedExecutionFailed ? (
      <ExecutionHistory task={task} />
    ) : null;
  useEffect(() => {
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, liveEvents.length, streamedContent]);
  function copyMessage(id: string, content: string) {
    void navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      window.setTimeout(
        () => setCopiedId((value) => (value === id ? "" : value)),
        1400,
      );
    });
  }
  function prepareAndSend(message: string) {
    if (running) return;
    if (editingId && editDraft.trim()) {
      const messageId = editingId;
      const replacement = editDraft.trim();
      setEditingId("");
      void onEditSend(messageId, replacement);
      return;
    }
    setFollowup(message);
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }
  async function toggleFeedback(messageId: string, rating: "up" | "down") {
    const previous = feedback[messageId];
    const next = previous === rating ? undefined : rating;
    setFeedbackOverrides((value) => {
      const updated = { ...value };
      if (next) updated[messageId] = next;
      else updated[messageId] = null;
      return updated;
    });
    const response = await fetch(apiPath(`/api/workbuddy/tasks/${task.id}`), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "message-feedback",
        messageId,
        rating: next ?? null,
      }),
    }).catch(() => null);
    if (!response?.ok)
      setFeedbackOverrides((value) => {
        const updated = { ...value };
        if (previous) updated[messageId] = previous;
        else delete updated[messageId];
        return updated;
      });
  }
  return (
    <div className="wbChat">
      <header>
        <div className="wbTaskHeading">
          <button
            className="wbTaskDrawerTrigger compact"
            onClick={onHistory}
            type="button"
          >
            <span>☰</span> 任务
          </button>
          <div>
            <span>{scenarioLabels[task.scenario]}</span>
            <h1>{task.title}</h1>
          </div>
        </div>
      </header>
      <div className="wbMessages" ref={messagesRef}>
        {messages.map((message, index) => (
          <Fragment key={message.id}>
            {index === executionAnchor ? executionNode : null}
            <article
              className={
                message.role === "user"
                  ? "user wbMessage"
                  : "assistant wbMessage"
              }
            >
              {message.role === "assistant" ? <XiaoguAvatar /> : null}
              <div className="wbMessageBody">
                {editingId === message.id ? (
                  <div className="wbInlineEdit">
                    <textarea
                      autoFocus
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setEditingId("");
                        if (
                          event.key === "Enter" &&
                          (event.metaKey || event.ctrlKey)
                        ) {
                          event.preventDefault();
                          if (editDraft.trim())
                            prepareAndSend(
                              `请以这段修订后的要求为准重新执行：\n${editDraft.trim()}`,
                            );
                        }
                      }}
                    />
                    <footer>
                      <span>⌘/Ctrl + Enter 发送 · Esc 取消</span>
                      <div>
                        <button onClick={() => setEditingId("")} type="button">
                          取消
                        </button>
                        <button
                          disabled={!editDraft.trim() || running}
                          onClick={() => {
                            prepareAndSend(
                              `请以这段修订后的要求为准重新执行：\n${editDraft.trim()}`,
                            );
                            setEditingId("");
                          }}
                          type="button"
                        >
                          发送修改
                        </button>
                      </div>
                    </footer>
                  </div>
                ) : message.role === "user" ? (
                  <div className="wbUserBubble">
                    {displayMessageContent(message.content)}
                  </div>
                ) : (
                  <>
                    <strong>小谷</strong>
                    <MessagePresentation
                      content={message.content}
                      metadata={message.metadata_json}
                      onChoice={(value) => prepareAndSend(value)}
                      onOpenWorkspace={onOpenWorkspace}
                      sourceContent={
                        task.artifacts?.find(
                          (artifact) =>
                            artifact.id ===
                            message.metadata_json?.sourceArtifactId,
                        )?.content
                      }
                    />
                  </>
                )}
                <div className="wbMessageActions">
                  <button
                    aria-label="复制消息"
                    onClick={() =>
                      copyMessage(
                        message.id,
                        displayMessageContent(message.content),
                      )
                    }
                    title="复制"
                    type="button"
                  >
                    {copiedId === message.id ? "✓ 已复制" : "▣ 复制"}
                  </button>
                  {message.role === "user" &&
                  !message.content.includes("[应用参数:") ? (
                    <button
                      aria-label="编辑消息"
                      disabled={running}
                      onClick={() => {
                        setEditingId(message.id);
                        setEditDraft(message.content);
                      }}
                      title="编辑并重新发送"
                      type="button"
                    >
                      ✎ 编辑
                    </button>
                  ) : message.role === "assistant" ? (
                    <>
                      <button
                        aria-label="回答有帮助"
                        className={
                          feedback[message.id] === "up" ? "active" : ""
                        }
                        onClick={() => void toggleFeedback(message.id, "up")}
                        title="回答有帮助"
                        type="button"
                      >
                        ♡
                      </button>
                      <button
                        aria-label="回答需改进"
                        className={
                          feedback[message.id] === "down" ? "active" : ""
                        }
                        onClick={() => void toggleFeedback(message.id, "down")}
                        title="回答需改进"
                        type="button"
                      >
                        △
                      </button>
                      <button
                        aria-label="重新生成回答"
                        disabled={running}
                        onClick={() =>
                          prepareAndSend(
                            "请重新检查原始目标和全部上下文，换一种更准确、完整的方式重新生成本轮结果。如果原始目标没有指定平台、内容形态或数量，先给候选方案并询问我选择，不要擅自补充。",
                          )
                        }
                        title="重新生成"
                        type="button"
                      >
                        ↻ 重新生成
                      </button>
                    </>
                  ) : null}
                </div>
                {message.role === "user" ? (
                  <time>{formatTime(message.created_at)}</time>
                ) : null}
              </div>
            </article>
          </Fragment>
        ))}
        {executionAnchor < 0 ? executionNode : null}
      </div>
      <form className="wbFollowup" onSubmit={onSubmit} ref={formRef}>
        <textarea
          rows={1}
          placeholder={
            running
              ? "输入后可排队到当前步骤结束…"
              : task.status === "cancelled"
                ? "输入要求后继续任务…"
                : "继续输入要求…"
          }
          value={followup}
          onChange={(e) => setFollowup(e.target.value)}
          onInput={(event) => {
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`;
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (followup.trim()) event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <footer>
          <div>
            <span className="wbComposerHint">
              {running
                ? "Enter 排队补充 · Shift+Enter 换行"
                : "Enter 发送 · Shift+Enter 换行"}
            </span>
          </div>
          {running ? (
            <>
              <button
                aria-label="排队补充要求"
                className="send"
                disabled={!followup.trim()}
              >
                ↑
              </button>
              <button
                className="wbInlineStop"
                aria-label="停止执行"
                onClick={onStop}
                type="button"
              >
                ■
              </button>
            </>
          ) : (
            <button
              aria-label={task.status === "cancelled" ? "继续任务" : "发送消息"}
              className={`send ${task.status === "cancelled" ? "resume" : ""}`}
              disabled={!followup.trim()}
            >
              {task.status === "cancelled" ? "继续" : "↑"}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}

type MarkdownSegment =
  | { type: "markdown"; content: string }
  | { type: "table"; columns: string[]; rows: string[][] };
function MarkdownContent({ content }: { content: string }) {
  const normalized = normalizeReportHeadings(content);
  const sections = splitAncillaryResearchSection(normalized);
  const render = (value: string) =>
    splitMarkdownTables(value).map((segment, index) =>
      segment.type === "markdown" ? (
        <ReactMarkdown key={index}>{segment.content}</ReactMarkdown>
      ) : (
        <div className="wbMarkdownTable" key={index}>
          <table>
            <thead>
              <tr>
                {segment.columns.map((column, columnIndex) => (
                  <th key={`${column}-${columnIndex}`}>
                    <ReactMarkdown>{column}</ReactMarkdown>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {segment.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {segment.columns.map((_, cellIndex) => (
                    <td key={cellIndex}>
                      <ReactMarkdown>{row[cellIndex] || ""}</ReactMarkdown>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    );
  return (
    <div
      className={`wbMarkdownBlock ${content.length > 900 ? "wbLongform" : ""}`}
    >
      {render(sections.main)}
      {sections.ancillary ? (
        <details className="wbAncillaryResearch">
          <summary>
            {sections.ancillary.title}
            <span>点击展开</span>
          </summary>
          <div>{render(sections.ancillary.content)}</div>
        </details>
      ) : null}
    </div>
  );
}
function normalizeReportHeadings(content: string) {
  return content
    .replace(/^\s*\d+[)）.]\s*[【\[]([^】\]]+)[】\]]\s*$/gm, "## $1")
    .replace(
      /^\s*[【\[]((?:第[一二三四五六七八九十]+部分|博主风格画像|推荐标题(?:\+|与)标签)[^】\]]*)[】\]]\s*$/gm,
      "## $1",
    );
}
function splitMarkdownTables(content: string): MarkdownSegment[] {
  const lines = content.split("\n");
  const segments: MarkdownSegment[] = [];
  let markdown: string[] = [];
  const flush = () => {
    if (markdown.length) {
      segments.push({ type: "markdown", content: markdown.join("\n") });
      markdown = [];
    }
  };
  for (let index = 0; index < lines.length;) {
    const header = parseTableRow(lines[index]);
    const divider = parseTableRow(lines[index + 1] || "");
    if (
      header.length &&
      divider.length === header.length &&
      divider.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      flush();
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const row = parseTableRow(lines[index]);
        if (!row.length) break;
        rows.push(row);
        index += 1;
      }
      segments.push({ type: "table", columns: header, rows });
      continue;
    }
    markdown.push(lines[index]);
    index += 1;
  }
  flush();
  return segments.length ? segments : [{ type: "markdown", content }];
}
function parseTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|") || !trimmed.startsWith("|")) return [];
  return trimmed
    .replace(/^\|/g, "")
    .replace(/\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function ChoiceBlock({
  block,
  onChoice,
  onOpenWorkspace,
}: {
  block: Extract<WorkbuddyPresentationBlock, { type: "choices" }>;
  onChoice: (value: string) => void;
  onOpenWorkspace: (url: string, title: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const multiple = Boolean(block.multiple);
  const min = block.minSelections ?? 1;
  const max = block.maxSelections ?? block.options.length;
  function toggle(value: string) {
    if (!multiple) {
      onChoice(value);
      return;
    }
    setSelected((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : current.length >= max
          ? current
          : [...current, value],
    );
  }
  function submit() {
    if (selected.length < min) return;
    const joined = selected.join("，");
    onChoice(
      `${block.valuePrefix ?? ""}${joined}${block.valuePrefix ? "\n请按以上设置继续生成完整口播文案。" : ""}`,
    );
  }
  return (
    <section className={`wbPrimitive wbChoices ${multiple ? "multiple" : ""}`}>
      <strong>{block.question}</strong>
      <div>
        {block.options.map((option) => {
          const active = selected.includes(option.value);
          if (shouldOpenEmbeddedContinuation(option)) return (
            <button className="wbChoiceLink" key={option.value} onClick={() => onOpenWorkspace(option.href || "", option.label)} type="button">
              <i aria-hidden="true">→</i>
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          );
          if (shouldContinueInsideConversation(option)) return (
            <button className="wbChoiceLink" key={option.value} onClick={() => onChoice(conversationContinuationMessage(option))} type="button">
              <i aria-hidden="true">→</i>
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          );
          if (option.continuation) return (
            <button className="wbChoiceLink" key={option.value} onClick={() => onChoice(conversationContinuationMessage(option))} type="button">
              <i aria-hidden="true">→</i>
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          );
          return (
            <button
              aria-pressed={active}
              className={active ? "active" : ""}
              key={option.value}
              onClick={() => toggle(option.value)}
              type="button"
            >
              <i aria-hidden="true">{multiple ? (active ? "✓" : "") : "→"}</i>
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          );
        })}
      </div>
      {multiple ? (
        <footer>
          <span>
            已选 {selected.length}/{max}
          </span>
          <button
            disabled={selected.length < min}
            onClick={submit}
            type="button"
          >
            {block.submitLabel || "确认选择"}
          </button>
        </footer>
      ) : null}
    </section>
  );
}

type WorkbuddyFormField = Extract<
  WorkbuddyPresentationBlock,
  { type: "form" }
>["fields"][number];
function ApplicationOptionField({
  field,
  value,
  onUpdate,
  onToggle,
}: {
  field: WorkbuddyFormField;
  value: string | string[];
  onUpdate: (value: string) => void;
  onToggle: (value: string) => void;
}) {
  const options = field.options ?? [];
  const hasPreviews = options.some((option) => Boolean(option.previewUrl));
  const compact =
    field.type === "single" &&
    !hasPreviews &&
    (options.length >= 5 || field.id.startsWith("traffic_coach_override_"));
  const [expanded, setExpanded] = useState(false);
  const collapsible = hasPreviews && options.length > 8;
  const visibleOptions =
    collapsible && !expanded ? options.slice(0, 8) : options;
  if (compact)
    return (
      <label className="wbAppCompactSelect">
        <select
          aria-label={field.label}
          value={String(value ?? "")}
          onChange={(event) => onUpdate(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <i>⌄</i>
      </label>
    );
  return (
    <>
      <div className="wbAppOptionGrid">
        {visibleOptions.map((option) => {
          const active = Array.isArray(value)
            ? value.includes(option.value)
            : value === option.value;
          const previewUrl = option.previewUrl?.startsWith(
            "/examples/image-card-styles/",
          )
            ? `${option.previewUrl}?v=20260830-refresh`
            : option.previewUrl;
          return (
            <button
              aria-pressed={active}
              className={active ? "active" : ""}
              key={option.value}
              onClick={() =>
                field.type === "multiple"
                  ? onToggle(option.value)
                  : onUpdate(option.value)
              }
              type="button"
            >
              {previewUrl ? <img alt="" src={appPath(previewUrl)} /> : null}
              <i>{active ? "✓" : ""}</i>
              <span>
                <strong>{option.label}</strong>
                {option.description ? (
                  <small>{option.description}</small>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {collapsible ? (
        <button
          className="wbAppMoreOptions"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "收起风格" : `更多风格（${options.length - 8}）`}{" "}
          <i>{expanded ? "⌃" : "⌄"}</i>
        </button>
      ) : null}
    </>
  );
}

function TrafficTopicPicker({
  field,
  coachFields,
  values,
  onToggle,
  onUpdate,
}: {
  field: WorkbuddyFormField;
  coachFields: WorkbuddyFormField[];
  values: Record<string, string | string[]>;
  onToggle: (value: string) => void;
  onUpdate: (id: string, value: string) => void;
}) {
  const [editingCoach, setEditingCoach] = useState("");
  const selected = Array.isArray(values[field.id])
    ? (values[field.id] as string[])
    : [];
  return (
    <div className="wbTrafficTopicGrid">
      {field.options?.map((topic) => {
        const active = selected.includes(topic.value);
        const coachField = coachFields.find(
          (item) => item.id === `traffic_topic_coach_${topic.value}`,
        );
        const coachId = String(
          coachField
            ? (values[coachField.id] ?? coachField.initialValue ?? "")
            : "",
        );
        const coach = coachField?.options?.find(
          (option) => option.value === coachId,
        );
        const editing = editingCoach === topic.value;
        return (
          <article className={active ? "active" : ""} key={topic.value}>
            <button
              className="wbTrafficTopicMain"
              onClick={() => {
                onToggle(topic.value);
                if (active) setEditingCoach("");
              }}
              type="button"
            >
              <i>{active ? "✓" : ""}</i>
              <span>
                <strong>{topic.label}</strong>
                {topic.description ? <small>{topic.description}</small> : null}
              </span>
            </button>
            {active && coachField ? (
              <section className="wbInlineCoach">
                <header>
                  <span>
                    <em>正文教练</em>
                    <strong>{coach?.label || "小谷教练"}</strong>
                    {coach?.description ? (
                      <small>{coach.description}</small>
                    ) : null}
                  </span>
                  <button
                    onClick={() => setEditingCoach(editing ? "" : topic.value)}
                    type="button"
                  >
                    {editing ? "收起" : "更换教练"}
                  </button>
                </header>
                {editing ? (
                  <div>
                    {coachField.options?.map((option) => (
                      <button
                        className={option.value === coachId ? "active" : ""}
                        key={option.value}
                        onClick={() => {
                          onUpdate(coachField.id, option.value);
                          setEditingCoach("");
                        }}
                        type="button"
                      >
                        <i>{option.value === coachId ? "✓" : ""}</i>
                        <span>
                          <strong>{option.label}</strong>
                          {option.description ? (
                            <small>{option.description}</small>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function ApplicationFormBlock({
  block,
  onSubmit,
}: {
  block: Extract<WorkbuddyPresentationBlock, { type: "form" }>;
  onSubmit: (value: string) => void;
}) {
  const initial = Object.fromEntries(
    block.fields.map((field) => [
      field.id,
      field.initialValue ?? (field.type === "multiple" ? [] : ""),
    ]),
  ) as Record<string, string | string[]>;
  const [values, setValues] =
    useState<Record<string, string | string[]>>(initial);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const visibleFields = visibleCreationFields(block.fields, values);
  function update(id: string, value: string | string[]) {
    setValues((current) => ({ ...current, [id]: value }));
    setError("");
  }
  function toggle(fieldId: string, value: string) {
    const current = Array.isArray(values[fieldId])
      ? (values[fieldId] as string[])
      : [];
    const max =
      fieldId === "creative_coach_version_ids"
        ? 2
        : fieldId === "traffic_selected_topic_ids"
          ? 3
          : Number.POSITIVE_INFINITY;
    update(
      fieldId,
      current.includes(value)
        ? current.filter((item) => item !== value)
        : current.length >= max
          ? current
          : [...current, value],
    );
  }
  async function upload(
    field:
      | Extract<(typeof block.fields)[number], { type: "file" }>
      | (typeof block.fields)[number],
    files: File[],
  ) {
    const selected = files.slice(
      0,
      field.maxFiles ?? (field.multiple ? files.length : 1),
    );
    if (!selected.length) return;
    setUploading(field.id);
    setError("");
    try {
      if (selected.every((file) => file.type.startsWith("image/"))) {
        const form = new FormData();
        selected.forEach((file) => form.append("files", file));
        const response = await fetch(apiPath("/api/avatar/photos"), {
          method: "POST",
          body: form,
        });
        const payload = (await response.json()) as {
          photos?: Array<{ content_url?: string }>;
          error?: string;
          errors?: Array<{ error: string }>;
        };
        const urls = (payload.photos ?? []).flatMap((photo) =>
          photo.content_url ? [photo.content_url] : [],
        );
        if (!response.ok || !urls.length)
          throw new Error(
            payload.error || payload.errors?.[0]?.error || "图片上传失败",
          );
        update(
          field.id,
          field.multiple || Number(field.maxFiles) > 1 ? urls : urls[0],
        );
        return;
      }
      const file = selected[0];
      if (field.id === "policy_document") {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch(
          apiPath("/api/creation/policy-renewal-extract"),
          { method: "POST", body: form },
        );
        const payload = (await response.json()) as {
          fields?: Record<string, string>;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "保单解析失败");
        setValues((current) => ({
          ...current,
          [field.id]: file.name,
          ...(payload.fields ?? {}),
        }));
        return;
      }
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(apiPath("/api/creation/import-text"), {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        text?: string;
        error?: string;
      };
      if (!response.ok || !payload.text)
        throw new Error(payload.error || "文件无法读取");
      update(field.id, payload.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "上传失败");
    } finally {
      setUploading("");
    }
  }
  const formState = resolveConversationFormState(
    block.fields,
    values,
    Boolean(uploading),
  );
  function submit() {
    const eligibleFields = formState.eligibleFields;
    const missing = formState.missingFields;
    if (missing.length) {
      setError(`请先完成：${missing.map((field) => field.label).join("、")}`);
      return;
    }
    const submittedIds = new Set(eligibleFields.map((field) => field.id));
    const submittedValues = Object.fromEntries(
      Object.entries(values).filter(
        ([id, value]) =>
          submittedIds.has(id) &&
          (Array.isArray(value) ? value.length : String(value ?? "").trim()),
      ),
    );
    const summary = visibleFields.flatMap((field) => {
      const value = submittedValues[field.id];
      if (value === undefined) return [];
      const labels = Array.isArray(value)
        ? value
            .map(
              (item) =>
                field.options?.find((option) => option.value === item)?.label ||
                item,
            )
            .join("、")
        : field.options?.find((option) => option.value === value)?.label ||
          (field.type === "file" ? "已添加文件" : String(value).slice(0, 80));
      return [`${field.label}：${labels}`];
    });
    const visible = `已确认“${block.title}”的创作设置：\n${summary.map((item) => `- ${item}`).join("\n")}\n\n开始生成。`;
    const message = `${visible}\n\n[应用参数:${block.appSlug}]\n${JSON.stringify(submittedValues)}`;
    if (message.length > 6000) {
      setError("参数内容过长，请精简文本或改用 + 号把资料作为附件引用。");
      return;
    }
    onSubmit(message);
  }
  const coachFields = block.fields.filter((field) =>
    field.id.startsWith("traffic_topic_coach_"),
  );
  return (
    <section className="wbPrimitive wbAppForm">
      <header>
        <i>✦</i>
        <span>
          <strong>{block.title}</strong>
          {block.description ? <small>{block.description}</small> : null}
        </span>
      </header>
      <div className="wbAppFormFields">
        {visibleFields.map((field) =>
          field.id.startsWith("traffic_topic_coach_") ? null : (
            <fieldset data-step={field.step} key={field.id}>
              <legend>
                {field.label}
                {field.required ? <em>*</em> : null}
              </legend>
              {field.helper ? <p>{field.helper}</p> : null}
              {field.id === "traffic_selected_topic_ids" ? (
                <TrafficTopicPicker
                  field={field}
                  coachFields={coachFields}
                  values={values}
                  onToggle={(value) => toggle(field.id, value)}
                  onUpdate={(id, value) => update(id, value)}
                />
              ) : field.type === "single" || field.type === "multiple" ? (
                <ApplicationOptionField
                  field={field}
                  value={values[field.id]}
                  onUpdate={(value) => update(field.id, value)}
                  onToggle={(value) => toggle(field.id, value)}
                />
              ) : field.type === "textarea" ? (
                <textarea
                  maxLength={6000}
                  placeholder={field.placeholder}
                  value={String(values[field.id] ?? "")}
                  onChange={(event) => update(field.id, event.target.value)}
                />
              ) : field.type === "text" ? (
                <input
                  maxLength={1000}
                  placeholder={field.placeholder}
                  value={String(values[field.id] ?? "")}
                  onChange={(event) => update(field.id, event.target.value)}
                />
              ) : (
                <div className="wbAppUpload">
                  <label>
                    <input
                      accept={field.accept}
                      hidden
                      multiple={field.multiple || Number(field.maxFiles) > 1}
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        event.target.value = "";
                        if (files.length) void upload(field, files);
                      }}
                      type="file"
                    />
                    <span>
                      {uploading === field.id
                        ? "正在上传并解析…"
                        : Number(field.maxFiles) > 1
                          ? `选择文件（最多 ${field.maxFiles} 个）`
                          : "选择文件"}
                    </span>
                  </label>
                  {Array.isArray(values[field.id]) ? (
                    (values[field.id] as string[]).length ? (
                      <small>
                        ✓ 已添加 {(values[field.id] as string[]).length} 个文件
                      </small>
                    ) : (
                      <small>
                        {field.placeholder ||
                          "文件会先上传或解析，再随参数提交"}
                      </small>
                    )
                  ) : String(values[field.id] ?? "") ? (
                    <small>✓ 已添加，可继续填写或重新上传</small>
                  ) : (
                    <small>
                      {field.placeholder || "文件会先上传或解析，再随参数提交"}
                    </small>
                  )}
                  {field.type === "file" &&
                  !field.accept?.startsWith("image/") ? (
                    <textarea
                      placeholder="也可以直接粘贴文字内容"
                      value={String(values[field.id] ?? "")}
                      onChange={(event) => update(field.id, event.target.value)}
                    />
                  ) : null}
                </div>
              )}
            </fieldset>
          ),
        )}
      </div>
      {error ? <p className="wbAppFormError">{error}</p> : null}
      <footer>
        <span>
          {visibleFields.length <
          block.fields.filter((field) => field.presentation !== "data").length
            ? "完成当前设置后会继续显示相关选项"
            : "确认后才会调用应用并扣除相应点数"}
        </span>
        <button
          disabled={formState.submitDisabled}
          onClick={submit}
          type="button"
        >
          {block.submitLabel || "确认并执行"}
        </button>
      </footer>
    </section>
  );
}

function downloadWorkbuddyImage(url: string, index: number) {
  const link = document.createElement("a");
  link.href = url;
  link.download = `小谷配图-${index + 1}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
function WorkbuddyGeneratedImages({
  workId,
  resultUrl,
  initialImages,
  onOpenWorkspace,
}: {
  workId: string;
  resultUrl: string;
  initialImages?: Array<{ id: string; url: string }>;
  onOpenWorkspace: (url: string, title: string) => void;
}) {
  const [images, setImages] = useState<Array<{ id: string; url: string }>>(initialImages ?? []);
  const [expandedImage, setExpandedImage] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiPath(`/api/works/${workId}`), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          payload: {
            work?: { content_json?: { xiaohongshuStudioState?: { headImage?: unknown; cards?: unknown[] } }; app_run?: { result_json?: { images?: unknown[] } } };
          } | null,
        ) => {
          const studio = payload?.work?.content_json?.xiaohongshuStudioState;
          const raw = Array.isArray(payload?.work?.app_run?.result_json?.images)
            ? payload.work.app_run.result_json.images
            : [studio?.headImage, ...(studio?.cards ?? [])].filter(Boolean);
          if (!Array.isArray(raw)) return;
          const resolved = raw.flatMap((item, index) =>
              item &&
              typeof item === "object" &&
              typeof (item as { url?: unknown }).url === "string"
                ? [
                    {
                      id:
                        typeof (item as { id?: unknown }).id === "string"
                          ? (item as { id: string }).id
                          : `image-${index + 1}`,
                      url: (item as { url: string }).url,
                    },
                  ]
                : [],
            );
          if (resolved.length) setImages(resolved);
        },
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [workId]);
  if (!images.length) return null;
  return (
    <section className="wbGeneratedImages">
      <div>
        {images.map((item, index) => (
          <figure key={`${workId}:${index}:${item.id}`}>
            <button className="wbGeneratedImagePreview" onClick={() => setExpandedImage(item)} type="button">
              <img alt={`生成的配图 ${index + 1}`} src={item.url} />
            </button>
            <figcaption>
              <button
                onClick={() => downloadWorkbuddyImage(item.url, index)}
                type="button"
              >
                下载这张
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      <footer>
        <span>已生成 {images.length} 张图片</span>
        {resultUrl ? <button className="wbResultLink" onClick={() => onOpenWorkspace(resultUrl, "编辑当前作品")} type="button">进入作品编辑 →</button> : null}
      </footer>
      {expandedImage ? (
        <div className="wbImageLightbox" onClick={() => setExpandedImage(null)} role="presentation">
          <button aria-label="关闭图片预览" onClick={() => setExpandedImage(null)} type="button">×</button>
          <img alt="配图大图预览" onClick={(event) => event.stopPropagation()} src={expandedImage.url} />
          <button onClick={(event) => { event.stopPropagation(); downloadWorkbuddyImage(expandedImage.url, Math.max(0, images.indexOf(expandedImage))); }} type="button">下载这张</button>
        </div>
      ) : null}
    </section>
  );
}

function deliveredImagesFromMetadata(metadata: Record<string, unknown>) {
  const contentJson = metadata.contentJson && typeof metadata.contentJson === "object" ? metadata.contentJson as Record<string, unknown> : null;
  const raw = Array.isArray(contentJson?.images) ? contentJson.images : [];
  return raw.flatMap((item, index) => item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string"
    ? [{ id: typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : `delivered-image-${index + 1}`, url: (item as { url: string }).url }]
    : []);
}

function MessagePresentation({
  content,
  metadata,
  onChoice,
  sourceContent,
  onOpenWorkspace,
}: {
  content: string;
  metadata: Record<string, unknown>;
  onChoice: (value: string) => void;
  sourceContent?: string;
  onOpenWorkspace: (url: string, title: string) => void;
}) {
  const visibleSourceContent =
    (typeof metadata.workId === "string" ||
      typeof metadata.resultUrl === "string") &&
    !sourceContent?.trimStart().startsWith("实时热点候选")
      ? sourceContent
      : undefined;
  const workId = typeof metadata.workId === "string" ? metadata.workId : "";
  const deliveredImages = deliveredImagesFromMetadata(metadata);
  const resultUrl =
    typeof metadata.resultUrl === "string" ? metadata.resultUrl : "";
  const resultLink = resultUrl && !workId ? (
    isWorkbuddyWorkspaceUrl(resultUrl) ? (
      <button className="wbResultLink" onClick={() => onOpenWorkspace(resultUrl, "继续处理成果")} type="button">
        打开应用继续处理 →
      </button>
    ) : (
      <a className="wbResultLink" href={appPath(resultUrl)}>打开独立工作台 →</a>
    )
  ) : null;
  const rawPresentation = metadata.presentation;
  const parsedBlocks = Array.isArray(rawPresentation)
    ? (rawPresentation as WorkbuddyPresentationBlock[])
    : rawPresentation &&
        typeof rawPresentation === "object" &&
        Array.isArray((rawPresentation as { blocks?: unknown }).blocks)
      ? (rawPresentation as { blocks: WorkbuddyPresentationBlock[] }).blocks
      : null;
  if (!parsedBlocks?.length)
    return (
      <div className="wbPresentation">
        {workId ? (
          <WorkbuddyGeneratedImages
            workId={workId}
            initialImages={deliveredImages}
            onOpenWorkspace={onOpenWorkspace}
            resultUrl={
              typeof metadata.resultUrl === "string" ? metadata.resultUrl : ""
            }
          />
        ) : null}
        {resultLink}
        <MarkdownContent
          content={
            visibleSourceContent &&
            visibleSourceContent.trim() !== content.trim()
              ? `${content}\n\n${visibleSourceContent}`
              : content
          }
        />
      </div>
    );
  const blocks = [...parsedBlocks].filter((block) => block.type !== "artifact");
  if (
    visibleSourceContent?.trim() &&
    visibleSourceContent.trim() !== content.trim() &&
    !blocks.some(
      (block) =>
        block.type === "markdown" &&
        block.content.includes(visibleSourceContent.trim().slice(0, 120)),
    )
  )
    blocks.push({ type: "markdown", content: visibleSourceContent });
  return (
    <div className="wbPresentation">
      {workId ? (
        <WorkbuddyGeneratedImages
          workId={workId}
          initialImages={deliveredImages}
          onOpenWorkspace={onOpenWorkspace}
          resultUrl={
            typeof metadata.resultUrl === "string" ? metadata.resultUrl : ""
          }
        />
      ) : null}
      {resultLink}
      {blocks.map((block, index) => {
        if (block.type === "markdown")
          return <MarkdownContent content={block.content} key={index} />;
        if (block.type === "table")
          return (
            <section className="wbPrimitive wbPrimitiveTable" key={index}>
              {block.title ? <h3>{block.title}</h3> : null}
              <div>
                <table>
                  <thead>
                    <tr>
                      {block.columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {block.columns.map((_, cellIndex) => (
                          <td key={cellIndex}>
                            {String(row[cellIndex] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        if (block.type === "callout")
          return (
            <aside
              className={`wbPrimitive wbCallout ${block.tone}`}
              key={index}
            >
              {block.title ? <strong>{block.title}</strong> : null}
              <MarkdownContent content={block.content} />
            </aside>
          );
        if (block.type === "steps")
          return (
            <section className="wbPrimitive wbSequence" key={index}>
              {block.title ? <h3>{block.title}</h3> : null}
              <ol>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <i>{itemIndex + 1}</i>
                    <span>
                      <strong>{item.title}</strong>
                      {item.detail ? <small>{item.detail}</small> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          );
        if (block.type === "timeline")
          return (
            <section className="wbPrimitive wbSequence" key={index}>
              {block.title ? <h3>{block.title}</h3> : null}
              <ol>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <i>{item.time}</i>
                    <span>
                      <strong>{item.title}</strong>
                      {item.detail ? <small>{item.detail}</small> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          );
        if (block.type === "flow")
          return (
            <section className="wbPrimitive wbFlow" key={index}>
              {block.title ? <h3>{block.title}</h3> : null}
              <div>
                {block.nodes.map((node, nodeIndex) => (
                  <Fragment key={nodeIndex}>
                    <span>
                      <strong>{node.label}</strong>
                      {node.detail ? <small>{node.detail}</small> : null}
                    </span>
                    {nodeIndex < block.nodes.length - 1 ? <i>→</i> : null}
                  </Fragment>
                ))}
              </div>
            </section>
          );
        if (block.type === "chart") {
          const max = Math.max(
            ...block.data.map((item) => Math.abs(item.value)),
            1,
          );
          return (
            <section className="wbPrimitive wbChart" key={index}>
              <h3>{block.title}</h3>
              {block.data.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <i
                    style={{
                      width: `${Math.max(3, (Math.abs(item.value) / max) * 100)}%`,
                    }}
                  />
                  <strong>
                    {item.value}
                    {block.unit || ""}
                  </strong>
                </div>
              ))}
            </section>
          );
        }
        if (block.type === "sources")
          return (
            <details
              className="wbPrimitive wbSources wbCollapsedSources"
              key={index}
            >
              <summary>
                {block.title || "参考来源"}
                <span>{block.items.length} 项</span>
              </summary>
              <ol>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <a href={item.url} rel="noreferrer" target="_blank">
                      {item.title}
                    </a>
                    {item.publishedAt ? <time>{item.publishedAt}</time> : null}
                  </li>
                ))}
              </ol>
            </details>
          );
        if (block.type === "choices")
          return <ChoiceBlock block={block} key={index} onChoice={onChoice} onOpenWorkspace={onOpenWorkspace} />;
        if (block.type === "form")
          return (
            <ApplicationFormBlock
              block={block}
              key={index}
              onSubmit={onChoice}
            />
          );
        return null;
      })}
    </div>
  );
}
function LiveExecution({
  events,
  content,
  running,
}: {
  events: LiveExecutionEvent[];
  content: string;
  running: boolean;
}) {
  const [manualExpanded, setManualExpanded] = useState(false);
  const visibleEvents = events
    .filter((event) => !["task.completed", "done"].includes(event.type))
    .filter(
      (event, index, array) =>
        index === 0 ||
        event.type !== array[index - 1].type ||
        event.message !== array[index - 1].message,
    );
  const failed = visibleEvents.some(
    (event) => event.type === "task.failed" || event.type === "error",
  );
  const started = events.find((event) => event.at)?.at;
  const ended = [...events].reverse().find((event) => event.at)?.at;
  const duration =
    started && ended
      ? Math.max(
          0,
          Math.round(
            (new Date(ended).getTime() - new Date(started).getTime()) / 1000,
          ),
        )
      : 0;
  const expanded = running || failed || manualExpanded;
  const icon = (type: string) =>
    type.startsWith("search")
      ? "⌕"
      : type.startsWith("compliance")
        ? "审"
        : type === "agent.thinking"
          ? "✦"
          : type === "agent.synthesizing"
            ? "写"
            : type === "tool.started"
              ? "↗"
              : type === "tool.failed" ||
                  type === "task.failed" ||
                  type === "error"
                ? "!"
                : type.includes("cancelled")
                  ? "■"
                  : "✓";
  return (
    <article
      className={`assistant wbLiveExecution ${expanded ? "expanded" : "collapsed"} ${failed ? "failed" : ""}`}
    >
      <XiaoguAvatar />
      <div>
        <button
          className="wbExecutionSummary"
          onClick={() => setManualExpanded((value) => !value)}
          type="button"
        >
          <span>
            <strong>
              {running
                ? "小谷正在自主执行"
                : failed
                  ? "本轮执行未完成"
                  : "Agent 执行过程"}
            </strong>
            <small>
              {running
                ? `已产生 ${visibleEvents.length} 条行动记录`
                : failed
                  ? "查看原因后可直接重试"
                  : `${visibleEvents.length} 条行动 · 用时 ${formatDuration(duration)}`}
            </small>
          </span>
          <i>{expanded ? "⌃" : "⌄"}</i>
        </button>
        {expanded ? (
          <>
            <ol>
              {visibleEvents.map((event, index) => (
                <li
                  className={
                    index === visibleEvents.length - 1 && (running || failed)
                      ? "active"
                      : ""
                  }
                  key={`${event.type}-${index}`}
                >
                  <i>{icon(event.type)}</i>
                  <span>{friendlyExecutionError(event.message)}</span>
                </li>
              ))}
            </ol>
            {content ? (
              <div className="wbStreamedContent">
                <ReactMarkdown>{content}</ReactMarkdown>
                {running ? <i className="wbStreamCursor" /> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}
function ExecutionHistory({ task }: { task: WorkbuddyTask }) {
  const failed = task.status === "failed";
  const [expanded, setExpanded] = useState(failed);
  const duration = Math.max(
    0,
    Math.round(
      (new Date(task.updated_at).getTime() -
        new Date(task.created_at).getTime()) /
        1000,
    ),
  );
  return (
    <article
      className={`assistant wbLiveExecution wbPersistedExecution ${expanded ? "expanded" : "collapsed"} ${failed ? "failed" : ""}`}
    >
      <XiaoguAvatar />
      <div>
        <button
          className="wbExecutionSummary"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <span>
            <strong>
              {failed ? "本轮执行未完成" : `已处理 ${formatDuration(duration)}`}
            </strong>
            <small>
              {failed
                ? "查看原因后可直接重试"
                : `${task.steps?.length || 0} 次工具调用`}
            </small>
          </span>
          <i>{expanded ? "⌃" : "⌄"}</i>
        </button>
        {expanded ? (
          <ol>
            {task.steps?.map((step) => (
              <li key={step.id}>
                <i>
                  {step.status === "completed"
                    ? "✓"
                    : step.status === "failed"
                      ? "!"
                      : "·"}
                </i>
                <span>
                  <strong>{step.title}</strong>
                  {workbuddyUserVisibleText(step.output_summary || step.description)}
                </span>
              </li>
            ))}
            {failed && task.error_message ? (
              <li className="active">
                <i>!</i>
                <span>{friendlyExecutionError(task.error_message)}</span>
              </li>
            ) : null}
          </ol>
        ) : null}
      </div>
    </article>
  );
}
function contextTypeLabel(type: ComposerContextItem["type"]) {
  return {
    customer: "客户档案",
    task: "历史任务",
    work: "创作历史",
    file: "本地文件",
  }[type];
}
function contextTypeIcon(type: ComposerContextItem["type"]) {
  return { customer: "客", task: "任", work: "稿", file: "文" }[type];
}
function getTextareaCaretPosition(
  textarea: HTMLTextAreaElement,
  position: number,
) {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const properties = [
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontFamily",
    "lineHeight",
    "letterSpacing",
    "textTransform",
    "textAlign",
    "textIndent",
    "textDecoration",
    "wordSpacing",
    "tabSize",
  ] as const;
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  properties.forEach((property) => {
    mirror.style.setProperty(
      property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
      style[property],
    );
  });
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(position) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const left = marker.offsetLeft - textarea.scrollLeft;
  const top = marker.offsetTop - textarea.scrollTop;
  const lineHeight =
    Number.parseFloat(style.lineHeight) ||
    Number.parseFloat(style.fontSize) * 1.5;
  mirror.remove();
  return { left, top, lineHeight };
}
function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
}
function formatDate(v: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
}
function formatTime(v: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
}
