"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { FeedbackPageClient } from "@/components/pages/FeedbackPageClient";

export default function FeedbackPage() {
  return (
    <AuthGuard>
      <AppShell>
        <FeedbackPageClient />
      </AppShell>
    </AuthGuard>
  );
}
