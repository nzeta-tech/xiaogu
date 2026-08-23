export async function waitForTopicRefresh<T>(refresh: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const boundedTimeoutMs = Math.min(Math.max(timeoutMs, 100), 30_000);
  try {
    return await Promise.race([
      refresh.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), boundedTimeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
