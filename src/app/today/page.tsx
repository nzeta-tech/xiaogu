"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { WorkbenchPageClient } from "@/components/pages/WorkbenchPageClient";

export default function TodayPage() {
  return (
    <AuthGuard>
      <AppShell>
        <WorkbenchPageClient />
      </AppShell>
    </AuthGuard>
  );
}
