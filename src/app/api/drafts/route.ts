export async function GET() {
  return Response.json({ error: "旧草稿接口已停用，请使用 /api/creation/hub?view=works" }, { status: 410 });
}

export async function POST() {
  return Response.json({ error: "旧草稿创建接口已停用，请从创作应用创建作品" }, { status: 410 });
}
