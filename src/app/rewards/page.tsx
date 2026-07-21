"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { BenefitsPageClient } from "@/components/pages/BenefitsPageClient";

export default function RewardsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <BenefitsPageClient />
      </AppShell>
    </AuthGuard>
  );
}
