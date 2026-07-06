"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { QuestionnairePageClient } from "@/components/pages/QuestionnairePageClient";

export default function QuestionnairePage() {
  return (
    <AuthGuard>
      <AppShell>
        <QuestionnairePageClient />
      </AppShell>
    </AuthGuard>
  );
}
