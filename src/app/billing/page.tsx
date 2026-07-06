"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { BillingPageClient } from "@/components/pages/BillingPageClient";

export default function BillingPage() {
  return (
    <AuthGuard>
      <AppShell>
        <BillingPageClient />
      </AppShell>
    </AuthGuard>
  );
}
