"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { AdminPageClient } from "@/components/pages/AdminPageClient";

export default function AdminPage() {
  return (
    <AuthGuard>
      <AppShell>
        <AdminPageClient />
      </AppShell>
    </AuthGuard>
  );
}
