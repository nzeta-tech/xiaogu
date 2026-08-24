export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build" || process.env.LOCAL_AGENT_EXECUTOR === "1") return;
  const { startViralDataPreparationScheduler } = await import("@/lib/viral-data-scheduler");
  const { configureTopicRefreshScheduler } = await import("@/lib/topics/topic-scheduler");
  startViralDataPreparationScheduler();
  configureTopicRefreshScheduler();
}
