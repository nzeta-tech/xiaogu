export async function GET() {
  if (process.env.LOCAL_AGENT_EXECUTOR !== "1") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, executor: true }, { headers: { "cache-control": "no-store" } });
}
