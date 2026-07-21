"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { DraftsPageClient } from "@/components/pages/DraftsPageClient";

export default function WorksPage() {
  return (
    <AuthGuard>
      <AppShell>
        <DraftsPageClient />
      </AppShell>
    </AuthGuard>
  );
}
