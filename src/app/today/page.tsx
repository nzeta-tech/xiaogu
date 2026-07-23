"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { TodayPageClient } from "@/components/pages/TodayPageClient";

export default function TodayPage() {
  return (
    <AuthGuard>
      <AppShell>
        <TodayPageClient />
      </AppShell>
    </AuthGuard>
  );
}
