"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { WorkbuddyPageClient } from "@/components/pages/WorkbuddyPageClient";

export default function WorkbuddyPage() {
  return <AuthGuard><AppShell><WorkbuddyPageClient /></AppShell></AuthGuard>;
}
