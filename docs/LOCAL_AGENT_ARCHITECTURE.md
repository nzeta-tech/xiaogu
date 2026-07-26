# Xiaogu local Agent architecture

## Deployment boundary

The three existing AWS `t3.micro` instances remain interchangeable Web nodes
behind the existing ALB. Their image is the default `runner`/`web-runner`
Docker target and contains only the standalone Next.js runtime.

The user's computer runs the base Compose file with an explicit production or
test override. It contains:

- `local-agent`: task poller, Chromium profiles, FFmpeg, yt-dlp, complete WeRSS,
  complete WechatSogou, and the existing Xiaogu extraction adapters.
- `transcriber`: `faster-whisper`, CPU `int8`; no external transcription API.
- `wx-channel`: the existing Video Channels browser parsing dependency.

The local stack has no production `DATABASE_URL` and does not accept inbound
traffic from AWS. It only makes outbound HTTPS requests to the ALB.

## Availability heartbeat

The Agent reports dependency health every 15 seconds through
`POST /api/internal/local-agent/heartbeat`. A node is eligible for new remix
tasks only when the local executor, transcription, Video Channels Chromium,
and yt-dlp are healthy. WeRSS, WechatSogou, and Xiaohongshu are optional health
signals and cannot disable Douyin/Video Channels remix. AWS
stores presence in `local_agent_nodes`; if no eligible heartbeat has arrived
for 45 seconds, the creation hub disables the link-remix action and both task
creation endpoints return `LOCAL_AGENT_OFFLINE`. The open hub refreshes this
small availability status every 15 seconds, so no page reload is required.

## Online request flow

1. Web validates the submitted public URL and inserts a `source.inspect` task.
2. The browser polls the task status endpoint owned by the signed-in user.
3. Local Agent leases one task with `LOCAL_AGENT_TOKEN`.
4. The local executor parses/downloads/transcribes the source and returns
   normalized fields. Media files remain local and are not relayed through AWS.
5. Web stores the JSON result in PostgreSQL and the browser fills the remix form.
6. Xiaogu's normal text model performs the final remix on AWS.

### Streaming transcription

For video sources the local executor returns metadata and a media reference
without blocking on transcription. The Agent consumes the transcriber's real
`/transcribe/stream` SSE response, batches new text every 400ms, and uploads it
to the leased task event endpoint. PostgreSQL keeps ordered `reset`, `status`,
and `delta` events for seven days. The signed-in browser subscribes only to the
AWS SSE endpoint; it never connects to the local computer. Event IDs support
replay after a connection break, while the completed task result remains the
canonical full transcript for page reload recovery.

Leases expire and are recovered automatically. Active tasks are deduplicated by
user and canonical URL, and high-priority online tasks are ordered before offline
collection tasks.

## Offline task types

The shared task protocol reserves these independently coalesced task types:

- `creator.discover`: query/provider-level author discovery.
- `creator.refresh`: refresh one known author profile.
- `work.discover`: discover recent works for one author.
- `work.enrich`: fetch content and normalized metadata for one work.
- `metrics.snapshot`: capture current public metrics for one work.

Only capabilities listed in `LOCAL_AGENT_CAPABILITIES` can be leased. The first
operational rollout advertises `source.inspect`; offline capability names must be
enabled only together with their result ingestion handlers, so an intermittent
computer never drains work it cannot persist.

## Configuration

AWS Web environment:

```dotenv
LOCAL_AGENT_ENABLED=1
LOCAL_AGENT_TOKEN=<same-long-random-token-as-local>
```

Local `.env`:

```dotenv
LOCAL_AGENT_BASE_URL=https://<existing-alb-or-domain>
LOCAL_AGENT_TOKEN=<same-long-random-token-as-aws>
LOCAL_AGENT_ID=xiaogu-local
LOCAL_AGENT_CAPABILITIES=source.inspect
LOCAL_AGENT_PROTOCOL_VERSION=1
WHISPER_MODEL=small
```

Production and test are deliberately isolated:

| Boundary | Production | Test |
| --- | --- | --- |
| Compose project | `xiaogu-agent-prod` | `xiaogu-agent-test` |
| Agent ID | `macbook-prod` | `macbook-test` |
| env file | `~/.config/xiaogu-agent/prod.env` | repository `.env` |
| VNC port | `6080` | `16080` |
| provider ports | `8001`, `8010` | `18001`, `18010` |
| volumes/networks | production project scope | test project scope |

Run the test stack:

```bash
docker compose -f docker-compose.local-agent.yml -f docker-compose.local-agent.test.yml up -d --build
docker compose -f docker-compose.local-agent.yml -f docker-compose.local-agent.test.yml logs -f local-agent
```

Use `http://127.0.0.1:6080/vnc.html` for one-time platform login and verification.
WeRSS and WechatSogou remain part of the local Agent image and are available on
localhost ports `8001` and `8010`; they are not standalone provider deployments.

Production never runs from the mutable Git checkout. Promotion builds and tests
Git-SHA-tagged images, writes `~/.xiaogu-agent/releases/<git-sha>`, switches the
`current` symlink, and starts with `--no-build`. Docker restarts failed
containers, while launchd reconciles the stack every 60 seconds after macOS
login. The executor and task poller are critical siblings; either process
exiting terminates the container so Docker can restart it.

Before enabling delegation on AWS, apply `migrations/028_local_agent_tasks.sql`
through `migrations/032_local_agent_release_control.sql`. Migration 032 leaves
the database-backed `features.localAgentEnabled` gate off. Enable it only after
all three Web nodes and a protocol-compatible production Agent pass release
probes. This single database value switches all Web nodes consistently.

Link remix accepts only Douyin and Video Channels URLs. The complete WeRSS,
WechatSogou, and Xiaohongshu collection code remains in the Agent image for
offline discovery, but those providers are weak dependencies of online remix.
The production override disables their processes by default; set the matching
`VIRAL_*_ENABLED` and `WERSS_ENABLED` variables only for an offline collection
run or provider maintenance window.
