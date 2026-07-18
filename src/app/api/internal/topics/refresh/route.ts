import { refreshTopicCache } from "@/lib/topics/cache-refresh";

export async function POST(request: Request) {
  const secret = process.env.TOPIC_REFRESH_SECRET;
  if (!secret) {
    return Response.json({ error: "TOPIC_REFRESH_SECRET is not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-topic-refresh-secret");
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  if (bearerToken !== secret && headerSecret !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshTopicCache({ force: true });
    return Response.json({
      ok: true,
      refreshedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "话题刷新失败" },
      { status: 503 },
    );
  }
}
