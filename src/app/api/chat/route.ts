export async function POST() {
  return Response.json(
    {
      error: "非流式聊天接口已停用，请使用 /api/chat/stream。",
      streamEndpoint: "/api/chat/stream",
    },
    { status: 410 },
  );
}
