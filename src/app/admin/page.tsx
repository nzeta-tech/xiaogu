"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AdminPageClient } from "@/components/pages/AdminPageClient";

export default function AdminPage() {
  return (
    <AuthGuard requireAdmin>
      <AdminPageClient />
    </AuthGuard>
  );
}
