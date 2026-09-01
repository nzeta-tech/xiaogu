export type AuthSessionConfirmation = "confirmed" | "rejected" | "unavailable";

type ConfirmAuthSessionOptions = {
  attempts?: number;
  delayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  waitImpl?: (delayMs: number) => Promise<void>;
};

export async function confirmAuthSession(
  url: string,
  options: ConfirmAuthSessionOptions = {},
): Promise<AuthSessionConfirmation> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delayMs = Math.max(0, options.delayMs ?? 180);
  const timeoutMs = Math.max(1, options.timeoutMs ?? 2500);
  const fetchImpl = options.fetchImpl ?? fetch;
  const waitImpl = options.waitImpl ?? ((delay) => new Promise((resolve) => window.setTimeout(resolve, delay)));
  let unavailable = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        const payload = await response.json() as { authenticated?: boolean };
        if (payload.authenticated) return "confirmed";
      } else if (response.status >= 500) {
        unavailable = true;
      }
    } catch {
      unavailable = true;
    }

    if (attempt < attempts - 1) await waitImpl(delayMs);
  }

  return unavailable ? "unavailable" : "rejected";
}
