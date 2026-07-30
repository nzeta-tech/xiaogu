import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { PptHistoryPageClient } from "@/components/pages/PptHistoryPageClient";

export default function PptHistoryPage() {
  return <AuthGuard><AppShell><PptHistoryPageClient /></AppShell></AuthGuard>;
}
