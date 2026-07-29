import { requireSessionUser } from "@/lib/auth/session";
import { tryListAdminCreditChangeEmailOutbox } from "@/lib/db/repositories";
import { filterAndPaginateAdminRows, parseAdminListQuery } from "@/lib/admin/list-query";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return Response.json({ error: "无权访问发件箱" }, { status: 403 });

  const messages = await tryListAdminCreditChangeEmailOutbox(500);
  const result = filterAndPaginateAdminRows(
    messages,
    parseAdminListQuery(request, { defaultLimit: 20, maxLimit: 200 }),
    (item) => `${item.user_name} ${item.user_email} ${item.change_label} ${item.change_kind} ${item.event_key}`,
    (item) => item.status,
  );
  return Response.json({ messages: result.rows, pagination: result.pagination });
}
