import { z } from "zod";
import { requireSessionUser } from "@/lib/auth/session";
import { ensureBackgroundWorkRun } from "@/lib/creation/background-run-registry";
import { parseCreationOutput } from "@/lib/creation/output";
import { tryGetWorkDetail, tryUpdateWorkContent, tryUpdateWorkStatus } from "@/lib/db/repositories";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await context.params;
  const work = await tryGetWorkDetail({ userId: user.id, workId: id });
  if (!work) {
    return Response.json({ error: "作品不存在或无权访问" }, { status: 404 });
  }
  const normalizedWork = normalizeWorkDetail(work);

  const payload = normalizedWork.app_run?.input_payload;
  if (
    normalizedWork.app_run?.status === "running" &&
    payload &&
    typeof payload === "object" &&
    Object.keys(payload).length > 0
  ) {
    const runPromise = ensureBackgroundWorkRun({
      workId: normalizedWork.id,
      slug: normalizedWork.platform,
      userId: user.id,
      values: payload as Record<string, string | string[]>,
      quotaCost: Number(normalizedWork.app_run?.quota_cost ?? 0),
      existingRunId: normalizedWork.app_run?.id ?? null,
    });

    const shouldWaitForRecovery =
      !normalizedWork.content.trim() ||
      normalizedWork.title.includes("正在生成") ||
      normalizedWork.app_run?.status === "running";

    if (shouldWaitForRecovery) {
      await Promise.race([
        runPromise,
        new Promise((resolve) => setTimeout(resolve, 12000)),
      ]);
      const refreshed = await tryGetWorkDetail({ userId: user.id, workId: id });
      if (refreshed) {
        return Response.json({ work: normalizeWorkDetail(refreshed), mode: "server" });
      }
    }
  }

  return Response.json({ work: normalizedWork, mode: "server" });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const { id } = await context.params;
  const body = await request.json();
  const editSchema = z.object({
    status: z.string().trim().optional(),
    title: z.string().trim().optional(),
    content: z.string().optional(),
    contentJson: z.record(z.string(), z.unknown()).optional(),
  });
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "请求参数不合法" }, { status: 400 });
  }

  const { status, title, content, contentJson } = parsed.data;
  if (typeof content === "string") {
    const updated = await tryUpdateWorkContent({
      userId: user.id,
      workId: id,
      title: title || undefined,
      status: status || undefined,
      content,
      contentJson: contentJson ?? parseCreationOutput(content),
    });
    if (!updated) {
      return Response.json({ error: "作品内容保存失败" }, { status: 404 });
    }
    const work = await tryGetWorkDetail({ userId: user.id, workId: id });
    return Response.json({ ok: true, work });
  }

  if (!status) {
    return Response.json({ error: "缺少状态字段" }, { status: 400 });
  }

  const updated = await tryUpdateWorkStatus({ userId: user.id, workId: id, status });
  if (!updated) {
    return Response.json({ error: "作品状态更新失败" }, { status: 404 });
  }

  return Response.json({ ok: true, work: updated });
}

function normalizeWorkDetail<T extends {
  platform?: string;
  content: string;
  content_json?: { batches?: unknown[] } | null;
}>(work: T): T {
  if (!shouldRebuildContentJson(work.platform)) return work;
  if (work.platform === "general-content") {
    return {
      ...work,
      content_json: parseCreationOutput(work.content),
    };
  }
  if (Array.isArray(work.content_json?.batches) && work.content_json.batches.length > 0) {
    return work;
  }
  return {
    ...work,
    content_json: parseCreationOutput(work.content),
  };
}

function shouldRebuildContentJson(platform?: string) {
  return platform === "write-copy" || platform === "general-content" || platform === "lead-copy" || platform === "traffic-copy" || platform === "marketing-copy" || platform === "video-script-polish" || platform === "wechat-article-polish" || platform === "topic-picker";
}
