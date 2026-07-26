import { requireSessionUser } from "@/lib/auth/session";
import { tryListUsageLogs } from "@/lib/db/repositories";
import { getCreationAppBySlug } from "@/lib/apps/catalog";

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  const usage = (await tryListUsageLogs(user.id)).map((item) => ({
    ...item,
    display_name: getUsageDisplayName(item.action_type, item.app_slug, item.work_title),
  }));

  return Response.json({
    usage,
    mode: "server",
  });
}

function getUsageDisplayName(actionType: string, appSlug: string | null, workTitle: string | null) {
  if (actionType === "creation_app_run") return getCreationAppBySlug(appSlug ?? "")?.name ?? workTitle ?? "创作内容";

  const labels: Record<string, string> = {
    hot_topics: "热点整理",
    topic_angles: "选题生成",
    write_script: "智能创作",
    rewrite: "内容改写",
    rewrite_script: "内容改写",
    compliance_check: "合规检查",
    deep_research: "深度研究",
  };
  return labels[actionType] ?? "内容服务";
}
