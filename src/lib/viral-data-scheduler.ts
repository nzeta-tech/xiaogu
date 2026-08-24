type PreparationRunner = (options: { trigger: string }) => Promise<unknown>;
type IntervalRegistrar = (callback: () => void, delay: number) => ReturnType<typeof setInterval>;

const defaultIntervalMs = 6 * 60 * 60 * 1000;
const schedulerState = globalThis as typeof globalThis & {
  xiaoguViralDataSchedulerStarted?: boolean;
};

export function viralDataScheduleIntervalMs(value = process.env.VIRAL_PREPARATION_INTERVAL_MS) {
  const configured = Number(value ?? defaultIntervalMs);
  return Number.isFinite(configured)
    ? Math.min(Math.max(configured, 60 * 60 * 1000), 24 * 60 * 60 * 1000)
    : defaultIntervalMs;
}

export function startViralDataPreparationScheduler(options: {
  run?: PreparationRunner;
  registerInterval?: IntervalRegistrar;
  intervalMs?: number;
} = {}) {
  if (schedulerState.xiaoguViralDataSchedulerStarted) return false;
  schedulerState.xiaoguViralDataSchedulerStarted = true;

  const run = options.run ?? (async (input) => {
    const { runViralDataPreparation } = await import("@/lib/viral-data-task");
    return runViralDataPreparation(input);
  });
  const invoke = (trigger: string) => void run({ trigger }).catch((error) => {
    console.error("[viral-data-scheduler] preparation failed", error instanceof Error ? error.message : error);
  });
  invoke("web-startup");
  (options.registerInterval ?? setInterval)(() => invoke("web-interval"), options.intervalMs ?? viralDataScheduleIntervalMs());
  return true;
}

export function resetViralDataPreparationSchedulerForTest() {
  schedulerState.xiaoguViralDataSchedulerStarted = false;
}
