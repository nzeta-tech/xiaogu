import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { PptJobResultPageClient } from "@/components/pages/PptJobResultPageClient";

export default async function PptJobResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <AuthGuard><AppShell><PptJobResultPageClient jobId={id} /></AppShell></AuthGuard>;
}
