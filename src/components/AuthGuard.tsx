"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/client/url";

export function AuthGuard({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const response = await fetch(apiPath("/api/auth/me"));
        const payload = (await response.json()) as { user: unknown };
        const user = payload.user as { role?: string } | null | undefined;
        if (user) {
          if (requireAdmin && user.role !== "admin") {
            router.replace("/workspace");
            return;
          }
          setReady(true);
          return;
        }
      } catch {
        router.replace("/login");
        return;
      }

      router.replace("/login");
    }

    void check();
  }, [router, requireAdmin]);

  if (!ready) return null;
  return children;
}
