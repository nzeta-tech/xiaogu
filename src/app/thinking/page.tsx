"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { ProfilePageClient } from "@/components/pages/ProfilePageClient";

export default function ThinkingPage() {
  return (
    <AuthGuard>
      <AppShell>
        <ProfilePageClient />
      </AppShell>
    </AuthGuard>
  );
}
