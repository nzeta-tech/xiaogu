import { notFound } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { CreationExamplePageClient } from "@/components/pages/CreationExamplePageClient";
import { tryGetCreationAppBySlug, tryGetCreationExampleBySlug, trySyncCreationCatalog } from "@/lib/db/repositories";

export default async function CreationExamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await trySyncCreationCatalog();
  const example = await tryGetCreationExampleBySlug(slug);
  if (!example) notFound();

  const app = await tryGetCreationAppBySlug(example.appSlug);
  if (!app) notFound();

  return (
    <AuthGuard>
      <AppShell>
        <CreationExamplePageClient app={app} example={example} />
      </AppShell>
    </AuthGuard>
  );
}
