const authEntryPaths = new Set(["/login", "/register", "/forgot-password", "/reset-password"]);

export function safeAuthRedirect(value: string | null | undefined, fallback = "/today") {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return fallback;

  try {
    const parsed = new URL(candidate, "http://xiaogu.local");
    if (parsed.origin !== "http://xiaogu.local" || authEntryPaths.has(parsed.pathname)) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
