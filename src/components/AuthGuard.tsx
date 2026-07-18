"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath, appPath } from "@/lib/client/url";

export function AuthGuard({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loginPath = () => {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      return appPath(`/login?next=${encodeURIComponent(next)}`);
    };

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
        router.replace(loginPath());
        return;
      }

      router.replace(loginPath());
    }

    void check();
  }, [router, requireAdmin]);

  if (!ready) return null;
  return children;
}
