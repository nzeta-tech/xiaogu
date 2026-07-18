export async function GET() {
  return Response.json({ error: "旧资料接口已停用，请使用 /api/thinking" }, { status: 410 });
}

export async function POST() {
  return Response.json({ error: "旧资料接口已停用，请使用 /api/thinking" }, { status: 410 });
}
