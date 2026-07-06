"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiPath } from "@/lib/client/url";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type WritingStyleMode = "general" | "traffic" | "marketing";

type Topic = {
  id: string;
  title: string;
  summary: string;
  source: string;
  heat: string;
  category: string;
  insuranceRelevance: string;
  recommendedAngle: string;
  riskNote: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourcePublishedAt?: string;
  evidence?: string;
};

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const starterMessages: Message[] = [
  {
    role: "assistant",
    content: "你好，我是小谷。把热点、产品资料或客户画像发给我，我会按你的账号人设生成可用的保险内容。",
  },
];

const quickActions = ["今天有哪些适合保险经纪人的热点选题？"];

const writingModes: Array<{ mode: WritingStyleMode; label: string; prefix: string }> = [
  {
    mode: "traffic",
    label: "写流量文案",
    prefix: "流量文案：",
  },
  {
    mode: "marketing",
    label: "写营销文案",
    prefix: "营销文案：",
  },
];

const dailyQuotes = [
  "真正专业的内容，不是把风险说重，而是把选择说清。",
  "先帮客户看懂家庭责任，再谈产品，信任会走得更稳。",
  "好文案不是催促成交，而是让客户愿意认真规划一次。",
  "保险内容的温度，藏在克制、准确和替客户多想一步里。",
];

const topicCacheKey = "ica:last-topics";

export function ChatWorkspace() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicOffset, setTopicOffset] = useState(0);
  const [topicLoading, setTopicLoading] = useState(true);
  const [topicError, setTopicError] = useState("");
  const [topicRefreshedAt, setTopicRefreshedAt] = useState<string | null>(null);
  const [userName, setUserName] = useState("经纪人");
  const [expandedTopicIds, setExpandedTopicIds] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [voiceSupported] = useState(() => Boolean(getSpeechRecognitionConstructor()));
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [quota, setQuota] = useState(0);
  const [styleMode, setStyleMode] = useState<WritingStyleMode>("traffic");
  const [copiedMessageKey, setCopiedMessageKey] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const streamQueueRef = useRef("");
  const streamTimerRef = useRef<number | null>(null);

  const canUseQuota = quota >= Number.MAX_SAFE_INTEGER || quota > 0;
  const visibleTopics = useMemo(() => {
    if (topics.length <= 10) return topics;
    return Array.from({ length: 10 }, (_, index) => topics[(topicOffset + index) % topics.length]);
  }, [topics, topicOffset]);
  const quote = useMemo(() => dailyQuotes[new Date().getDate() % dailyQuotes.length], []);

  async function loadBalance() {
    const response = await fetch(apiPath("/api/billing/balance"));
    const payload = (await response.json()) as { balance?: number };
    setQuota(payload.balance ?? 0);
  }

  async function loadUserName() {
    const response = await fetch(apiPath("/api/auth/me"));
    const payload = (await response.json()) as { user?: { name?: string; email?: string } };
    setUserName(payload.user?.name || payload.user?.email || "经纪人");
  }

  async function openConversation(id: string) {
    const response = await fetch(apiPath(`/api/conversations/${id}`));
    const payload = (await response.json()) as { conversation?: { id: string; messages: Message[] } };
    if (!payload.conversation) return;
    setConversationId(payload.conversation.id);
    setMessages(payload.conversation.messages.length ? payload.conversation.messages : starterMessages);
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages(starterMessages);
    setInput("");
    setStyleMode("traffic");
    window.dispatchEvent(new Event("ica:conversation-cleared"));
  }

  function copyMessage(content: string, key: string) {
    if (!content.trim()) return;
    try {
      const setCopied = (k: string) => {
        setCopiedMessageKey(k);
        window.setTimeout(() => setCopiedMessageKey((current) => (current === k ? "" : current)), 1200);
      };
      if (navigator.clipboard && window.isSecureContext) {
        void navigator.clipboard.writeText(content).then(() => setCopied(key)).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    } catch {
      fallbackCopy();
    }

    function fallbackCopy() {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
        setCopiedMessageKey(key);
        window.setTimeout(() => setCopiedMessageKey((current) => (current === key ? "" : current)), 1200);
      } catch {
        // All copy methods failed.
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  function toggleTopicDetails(topicId: string) {
    setExpandedTopicIds((current) =>
      current.includes(topicId) ? current.filter((id) => id !== topicId) : [...current, topicId],
    );
  }

  function startVoiceInput() {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition || listening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .flatMap((result) => Array.from(result).map((item) => item.transcript))
        .join("")
        .trim();
      if (transcript) setInput((current) => `${current}${current ? " " : ""}${transcript}`);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  async function loadTopics(announce = true, refresh = false, skipQuotaGuard = false) {
    if (!skipQuotaGuard && !canUseQuota) return;
    setTopicLoading(true);
    setTopicError("");
    try {
      const response = await fetch(apiPath(`/api/topics${refresh ? "?refresh=1" : ""}`));
      const payload = (await response.json()) as { topics?: Topic[]; refreshedAt?: string | null; error?: string };
      if (!response.ok || !payload.topics) {
        setTopicError(payload.error ?? "话题榜暂时无法加载。");
        if (announce) {
          setMessages((current) => [...current, { role: "assistant", content: payload.error ?? "热点服务暂不可用。" }]);
        }
        return;
      }
      setTopics(payload.topics);
      cacheTopics(payload.topics, payload.refreshedAt ?? new Date().toISOString());
      setTopicOffset(0);
      setTopicRefreshedAt(payload.refreshedAt ?? new Date().toISOString());
      await loadBalance();
    } finally {
      setTopicLoading(false);
    }
  }

  async function sendMessage(text = input, overrideStyleMode?: WritingStyleMode) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const nextMessages: Message[] = [...messages, userMessage];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(apiPath("/api/chat/stream"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          action: "write_script",
          conversationId,
          styleMode: overrideStyleMode ?? styleMode,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json()) as { error?: string };
        replaceStreamingMessage(payload.error ?? "请求失败，请稍后再试。");
        return;
      }

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
            .find((item) => item.startsWith("data:") || item.trim().startsWith("{"));
          if (!line) continue;
          const data = line.startsWith("data:") ? line.replace(/^data:\s*/, "") : line;
          const event = JSON.parse(data) as { type: string; content?: string; conversationId?: string };
          if (event.type === "meta" && event.conversationId) setConversationId(event.conversationId);
          if (event.type === "delta" && event.content) appendStreamingMessage(event.content);
          if (event.type === "error" && event.content) replaceStreamingMessage(event.content);
        }
      }

      await loadBalance();
      window.dispatchEvent(new Event("ica:conversations-updated"));
    } finally {
      setLoading(false);
    }
  }

  function activateWritingMode(mode: WritingStyleMode, prefix: string) {
    setStyleMode(mode);
    setInput((current) => (current.trim() ? current : prefix));
  }

  function appendStreamingMessage(chunk: string) {
    streamQueueRef.current += chunk;
    if (streamTimerRef.current) return;
    streamTimerRef.current = window.setInterval(() => {
      const nextChunk = streamQueueRef.current.slice(0, 8);
      streamQueueRef.current = streamQueueRef.current.slice(8);
      if (!nextChunk) {
        if (streamTimerRef.current) window.clearInterval(streamTimerRef.current);
        streamTimerRef.current = null;
        return;
      }
      appendStreamingChunk(nextChunk);
    }, 24);
  }

  function appendStreamingChunk(chunk: string) {
    setMessages((current) => {
      const next = [...current];
      const last = next.at(-1);
      if (last?.role === "assistant") {
        next[next.length - 1] = { ...last, content: `${last.content}${chunk}` };
      }
      return next;
    });
  }

  function replaceStreamingMessage(content: string) {
    streamQueueRef.current = "";
    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    setMessages((current) => {
      const next = [...current];
      const last = next.at(-1);
      if (last?.role === "assistant") next[next.length - 1] = { role: "assistant", content };
      return next;
    });
  }

  useEffect(() => {
    async function bootstrap() {
      const cached = readCachedTopics();
      if (cached?.topics.length) {
        setTopics(cached.topics);
        setTopicRefreshedAt(cached.refreshedAt);
        setTopicLoading(false);
      }
      void loadBalance();
      void loadUserName();
      await loadTopics(false, false, true);
      void loadTopics(false, true, true);
    }

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) window.clearInterval(streamTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function handleOpenConversation(event: Event) {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (detail?.conversationId) void openConversation(detail.conversationId);
    }

    window.addEventListener("ica:open-conversation", handleOpenConversation);
    return () => window.removeEventListener("ica:open-conversation", handleOpenConversation);
  }, []);

  useEffect(() => {
    function handleNewConversation() {
      startNewConversation();
    }

    window.addEventListener("ica:new-conversation", handleNewConversation);
    return () => window.removeEventListener("ica:new-conversation", handleNewConversation);
  }, []);

  useEffect(() => {
    const urlConversationId = searchParams.get("conversationId");
    const newConversation = searchParams.get("newConversation");
    let timer: number | null = null;
    if (urlConversationId) {
      timer = window.setTimeout(() => {
        void openConversation(urlConversationId);
      }, 0);
    } else if (newConversation === "1") {
      timer = window.setTimeout(() => {
        startNewConversation();
      }, 0);
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [searchParams]);

  return (
    <div className="agentDesk">
      <section className="chatSurface">
        <div className="chatToolbar">
          <span className="dailyQuote"><strong>Hi，{userName}</strong><em>{quote}</em></span>
        </div>

        <div className="messages">
          {messages.map((message, index) => (
            <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
              {message.content ? (
                <button
                  className={`messageCopyButton ${copiedMessageKey === `${message.role}-${index}` ? "copied" : ""}`}
                  onClick={() => void copyMessage(message.content, `${message.role}-${index}`)}
                  title={copiedMessageKey === `${message.role}-${index}` ? "已复制" : "复制"}
                  type="button"
                >
                  <CopyIcon />
                </button>
              ) : null}
              <MessageContent
                content={message.content || (message.role === "assistant" && loading ? "小谷正在加速思考…" : "")}
                role={message.role}
              />
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="composer">
          <div className="quickActions">
            {writingModes.map((mode) => (
              <button
                className={`chip modeChip ${styleMode === mode.mode ? "active" : ""}`}
                key={mode.mode}
                onClick={() => activateWritingMode(mode.mode, mode.prefix)}
                disabled={loading}
              >
                {mode.label}
              </button>
            ))}
            {quickActions.map((action) => (
              <button className="chip" key={action} onClick={() => void sendMessage(action)} disabled={loading}>
                {action}
              </button>
            ))}
          </div>
          <div className="composerRow">
            <textarea
              className="composerInput"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={
                styleMode === "traffic"
                  ? "输入热点材料或事件背景，小谷会默认按流量文案结构写。"
                  : styleMode === "marketing"
                    ? "输入客户画像、产品亮点、既往症规则或方案材料，小谷会默认按营销文案写。"
                    : "输入热点材料、事件背景或客户问题，小谷会默认按流量文案结构写。"
              }
            />
            <div className="composerActions">
              <button
                className={`voiceButton iconButton ${listening ? "listening" : ""}`}
                onClick={startVoiceInput}
                disabled={!voiceSupported || listening || loading}
                title={voiceSupported ? "语音输入" : "当前浏览器不支持语音输入"}
                type="button"
              >
                <MicIcon />
              </button>
              <button className="sendButton" onClick={() => void sendMessage()} disabled={loading || !canUseQuota} title="发送">
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="topicRail">
        <div className="panelHeader compactHeader">
          <div>
            <h2>话题雷达</h2>
            <p>
              来自实时热榜，小谷会转成稳妥的保险内容角度。
              {topicRefreshedAt ? ` 更新于 ${formatRefreshTime(topicRefreshedAt)}` : ""}
            </p>
          </div>
          <button className="textButton strong" onClick={() => void loadTopics(false, true, true)} disabled={topicLoading}>
            {topicLoading ? "刷新中" : "刷新"}
          </button>
        </div>
        <div className="sideBody">
          {topicLoading && visibleTopics.length === 0 ? (
            <div className="topicLoading">
              <strong>小谷正在整理今日话题榜</strong>
              <span>正在筛选热榜、判断保险相关度，并生成合规切入角度。</span>
            </div>
          ) : null}
          {!topicLoading && topicError ? <div className="emptyMini">{topicError}</div> : null}
          {!topicLoading && !topicError && visibleTopics.length === 0 ? <div className="emptyMini">暂无可展示话题。</div> : null}
          {!topicError ? visibleTopics.map((topic, index) => {
            const expanded = expandedTopicIds.includes(topic.id);
            return (
            <article className={`topic topicCard ${expanded ? "expanded" : ""}`} key={topic.id}>
              <div className="topicTitleRow">
                <span className="topicRank">TOP {String(topicOffset + index + 1).padStart(2, "0")}</span>
                <strong>{topic.title}</strong>
              </div>
              {expanded ? (
                <div className="topicDetails">
                  <div className="topicMeta">
                    <span>{topic.source}</span>
                    <span>{topic.heat}热度</span>
                    <span>{topic.category}</span>
                    <span>{topic.insuranceRelevance}相关</span>
                  </div>
                  <div className="topicRisk">
                    <span>切入角度</span>
                    <em>{topic.recommendedAngle}</em>
                  </div>
                  {topic.evidence ? <p className="topicEvidence">{topic.evidence}</p> : null}
                  {topic.sourceTitle || topic.sourceUrl ? (
                    <div className="topicSource">
                      <span>来源</span>
                      <em>{topic.sourceTitle ?? topic.sourceUrl}</em>
                    </div>
                  ) : null}
                  <div className="topicRisk">
                    <span>合规提示</span>
                    <em>{topic.riskNote}</em>
                  </div>
                </div>
              ) : null}
              <div className="topicActions">
                <button className="textButton" onClick={() => toggleTopicDetails(topic.id)}>
                  {expanded ? "收起" : "展开详情"}
                </button>
                <button
                  className="textButton strong"
                  onClick={() =>
                    void sendMessage(
                      `流量文案：围绕“${topic.title}”写一条适合社交媒体传播的文案。背景：${topic.summary} 保险角度：${topic.recommendedAngle}`,
                      "traffic",
                    )
                  }
                >
                  写流量稿
                </button>
                <button
                  className="textButton strong"
                  onClick={() =>
                    void sendMessage(
                      `营销文案：围绕“${topic.title}”写一条适合保险经纪人获客的营销稿。背景：${topic.summary} 保险角度：${topic.recommendedAngle}`,
                      "marketing",
                    )
                  }
                >
                  写营销稿
                </button>
              </div>
            </article>
            );
          }) : null}
        </div>
      </aside>
    </div>
  );
}

function readCachedTopics() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(topicCacheKey);
    if (!raw) return null;
    const payload = JSON.parse(raw) as { topics?: Topic[]; refreshedAt?: string };
    if (!Array.isArray(payload.topics)) return null;
    return {
      topics: payload.topics,
      refreshedAt: payload.refreshedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function cacheTopics(topics: Topic[], refreshedAt: string) {
  if (typeof window === "undefined" || topics.length === 0) return;
  try {
    window.localStorage.setItem(topicCacheKey, JSON.stringify({ topics, refreshedAt }));
  } catch {
    // Ignore storage limits; database snapshots still back the topic rail.
  }
}

function MessageContent({ content, role }: { content: string; role: Message["role"] }) {
  if (!content) return null;
  return <div className={role === "assistant" ? "markdownMessage" : "messagePlain"}>{renderMarkdown(content)}</div>;
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

function formatRefreshTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function MicIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15">
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="2" width="14" x="8" y="8" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="m5 12 14-7-7 14-2-5-5-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="m10 14 4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}
