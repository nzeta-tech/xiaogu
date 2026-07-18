import { requireSessionUser } from "@/lib/auth/session";
import { requireQuota } from "@/lib/billing/enforce";
import { executeCreationAppRun } from "@/lib/creation/execute-app-run";
import { tryGetCreationAppBySlug, tryGetSystemSettings, trySyncCreationCatalog } from "@/lib/db/repositories";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  await trySyncCreationCatalog();
  const app = await tryGetCreationAppBySlug(slug);
  if (!app) {
    return Response.json({ error: "应用不存在" }, { status: 404 });
  }
  const settings = await tryGetSystemSettings();
  if (!settings.features.imageGenerationEnabled && (app.resultType === "image" || app.resultType === "image-plan")) return Response.json({ error: "图片生成功能当前已关闭" }, { status: 403 });

  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const body = (await request.json()) as { values?: Record<string, string | string[]>; workId?: string };
  const values = body.values ?? {};
  const workId = body.workId?.trim();

  const quota = await requireQuota(user, "write_script", app.points);
  if (!quota.ok) return quota.response;

  const encoder = new TextEncoder();
  const encodeEvent = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      let result = "";
      let streamClosed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const safeClose = () => {
        if (streamClosed) return;
        streamClosed = true;
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      };

      const safeEnqueue = (payload: Uint8Array) => {
        if (streamClosed) return false;
        try {
          controller.enqueue(payload);
          return true;
        } catch (error) {
          if (error instanceof Error && error.message.includes("Controller is already closed")) {
            streamClosed = true;
            return false;
          }
          throw error;
        }
      };

      try {
        safeEnqueue(encoder.encode(": stream\n\n"));
        heartbeat = setInterval(() => {
          safeEnqueue(encoder.encode(": heartbeat\n\n"));
        }, 15000);
        await executeCreationAppRun({
          slug: app.slug,
          userId: user.id,
          values,
          workId,
          quotaCost: quota.quotaCost,
          onEvent: async (payload) => {
            if (payload.type === "meta") {
              safeEnqueue(encodeEvent({ type: "meta", app: { slug: app.slug, name: app.name }, runId: payload.runId ?? null }));
              return;
            }
            if (payload.type === "delta" && payload.content) {
              result += payload.content;
              safeEnqueue(encodeEvent({ type: "delta", content: payload.content }));
              return;
            }
            if (payload.type === "images") {
              safeEnqueue(encodeEvent({
                type: "images",
                images: payload.images ?? [],
                imageMode: payload.imageMode ?? null,
                retryable: payload.retryable ?? false,
              }));
              return;
            }
            if (payload.type === "done") {
              result = payload.content ?? result;
              safeEnqueue(encodeEvent({
                type: "done",
                work: payload.work ?? (workId ? { id: workId, title: app.name } : null),
                result,
                contentJson: null,
                images: payload.images ?? [],
                imageMode: payload.imageMode ?? null,
                retryable: payload.retryable ?? false,
              }));
              return;
            }
            if (payload.type === "error") {
              safeEnqueue(encodeEvent({ type: "error", content: payload.content ?? "内容生成失败" }));
            }
          },
        });
      } catch {
        safeClose();
        return;
      }
      safeClose();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
