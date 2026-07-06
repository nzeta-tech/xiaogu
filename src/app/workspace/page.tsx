"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { CreationHubPageClient } from "@/components/pages/CreationHubPageClient";

export default function WorkspacePage() {
  return (
    <AuthGuard>
      <AppShell>
        <CreationHubPageClient />
      </AppShell>
    </AuthGuard>
  );
}
