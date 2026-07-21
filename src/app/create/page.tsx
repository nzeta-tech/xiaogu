"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { CreationHubPageClient } from "@/components/pages/CreationHubPageClient";

export default function CreatePage() {
  return (
    <AuthGuard>
      <AppShell>
        <CreationHubPageClient />
      </AppShell>
    </AuthGuard>
  );
}
