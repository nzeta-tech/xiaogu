import { requireSessionUser } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

export async function GET(request: Request) {
  const admin = await requireSessionUser();
  if (admin instanceof Response) return admin;
  if (admin.role !== "admin") return Response.json({ error: "无权查看创作诊断记录" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const traceId = searchParams.get("traceId")?.trim() ?? "";
  if (!email && !traceId) return Response.json({ error: "请提供邮箱或 traceId" }, { status: 400 });
  const result = await query(`select d.trace_id,d.request_id,d.app_slug,d.event_type,d.outcome,d.error_code,d.detail,d.created_at,u.email
    from creation_diagnostics d left join users u on u.id=d.user_id
    where ($1 = '' or lower(u.email) = $1) and ($2 = '' or d.trace_id = $2)
    order by d.created_at desc limit 200`, [email, traceId]);
  return Response.json({ diagnostics: result.rows });
}
