import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { WorkDetailPageClient } from "@/components/pages/WorkDetailPageClient";

export default async function WorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AuthGuard>
      <AppShell>
        <WorkDetailPageClient workId={id} />
      </AppShell>
    </AuthGuard>
  );
}
