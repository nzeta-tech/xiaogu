import { redirect } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { WorkDetailPageClient } from "@/components/pages/WorkDetailPageClient";
import { getSessionUser } from "@/lib/auth/session";
import { getRemixCapabilityDefinition } from "@/lib/creation/remix-capability-registry";
import { tryGetWorkDetail } from "@/lib/db/repositories";

export default async function WorkDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = await searchParams;
  const isAdminPreview = query.admin === "1" || query.from === "admin";
  if (!isAdminPreview) {
    const user = await getSessionUser();
    const work = user ? await tryGetWorkDetail({ userId: user.id, workId: id }) : null;
    if (work?.platform === "link-remix") {
      const contentJson = work.content_json as { effectiveAppSlug?: unknown; remixTarget?: unknown } | null;
      const storedTarget = work.app_run?.input_payload?.remix_target ?? contentJson?.remixTarget;
      const targetSlug = typeof contentJson?.effectiveAppSlug === "string"
        ? contentJson.effectiveAppSlug
        : storedTarget
          ? getRemixCapabilityDefinition(storedTarget).appSlug
          : "";
      if (targetSlug === "wechat-studio" || targetSlug === "xiaohongshu-studio") {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        redirect(`${basePath}/apps/${targetSlug}?workId=${encodeURIComponent(id)}&from=link-remix`);
      }
    }
  }

  return (
    <AuthGuard>
      <AppShell>
        <WorkDetailPageClient key={id} workId={id} />
      </AppShell>
    </AuthGuard>
  );
}
