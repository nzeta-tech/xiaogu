"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/client/url";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const response = await fetch(apiPath("/api/auth/me"));
        const payload = (await response.json()) as { user: unknown };
        if (payload.user) {
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
  }, [router]);

  if (!ready) return null;
  return children;
}
