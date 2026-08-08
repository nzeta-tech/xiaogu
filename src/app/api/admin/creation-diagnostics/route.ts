import { requireSessionUser } from "@/lib/auth/session";
import { listCreationDiagnostics } from "@/lib/creation/diagnostics-log";

export async function GET(request: Request) {
  const admin = await requireSessionUser();
  if (admin instanceof Response) return admin;
  if (admin.role !== "admin") return Response.json({ error: "无权查看创作诊断记录" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const traceId = searchParams.get("traceId")?.trim() ?? "";
  if (!email && !traceId) return Response.json({ error: "请提供邮箱或 traceId" }, { status: 400 });
  return Response.json({ diagnostics: await listCreationDiagnostics({ email, traceId }) });
}
