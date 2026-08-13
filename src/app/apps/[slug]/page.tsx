import { notFound } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { CreationAppPageClient } from "@/components/pages/CreationAppPageClient";
import { PptMakerPageClient } from "@/components/pages/PptMakerPageClient";
import { WechatStudioPageClient } from "@/components/pages/WechatStudioPageClient";
import { XiaohongshuStudioPageClient } from "@/components/pages/XiaohongshuStudioPageClient";
import { tryGetCreationAppBySlug, trySyncCreationCatalog } from "@/lib/db/repositories";
import { tryGetWorkDetail } from "@/lib/db/repositories";
import { getSessionUser } from "@/lib/auth/session";
import type { StudioBootstrapWork } from "@/lib/creation/studio-bootstrap";

export default async function CreationAppPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const query = await searchParams;
  await trySyncCreationCatalog();
  const app = await tryGetCreationAppBySlug(slug);
  if (!app) notFound();
  const workId = typeof query.workId === "string" ? query.workId.trim() : "";
  const sessionUser = workId && (app.slug === "wechat-studio" || app.slug === "xiaohongshu-studio") ? await getSessionUser() : null;
  const initialWork = sessionUser && workId
    ? await tryGetWorkDetail({ userId: sessionUser.id, workId }) as StudioBootstrapWork | null
    : null;

  return (
    <AuthGuard>
      <AppShell>
        {app.slug === "ppt-maker" ? <PptMakerPageClient /> : app.slug === "wechat-studio" ? <WechatStudioPageClient app={app} initialWork={initialWork} /> : app.slug === "xiaohongshu-studio" ? <XiaohongshuStudioPageClient app={app} initialWork={initialWork} /> : <CreationAppPageClient app={app} />}
      </AppShell>
    </AuthGuard>
  );
}
