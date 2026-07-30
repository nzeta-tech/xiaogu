import { notFound } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { CreationAppPageClient } from "@/components/pages/CreationAppPageClient";
import { PptMakerPageClient } from "@/components/pages/PptMakerPageClient";
import { tryGetCreationAppBySlug, trySyncCreationCatalog } from "@/lib/db/repositories";

export default async function CreationAppPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await trySyncCreationCatalog();
  const app = await tryGetCreationAppBySlug(slug);
  if (!app) notFound();

  return (
    <AuthGuard>
      <AppShell>
        {app.slug === "ppt-maker" ? <PptMakerPageClient /> : <CreationAppPageClient app={app} />}
      </AppShell>
    </AuthGuard>
  );
}
