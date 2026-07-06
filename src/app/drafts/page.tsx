"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { DraftsPageClient } from "@/components/pages/DraftsPageClient";

export default function DraftsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <DraftsPageClient />
      </AppShell>
    </AuthGuard>
  );
}
