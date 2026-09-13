export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build" || process.env.LOCAL_AGENT_EXECUTOR === "1") return;
  const { startViralExampleScheduler } = await import("@/lib/viral-examples-cache");
  const { startCreativeCoachTrainingScheduler } = await import("@/lib/avatar/creative-coach-training-orchestrator");
  const { startViralDataPreparationScheduler } = await import("@/lib/viral-data-scheduler");
  const { configureTopicRefreshScheduler } = await import("@/lib/topics/topic-scheduler");
  startViralExampleScheduler();
  startCreativeCoachTrainingScheduler();
  startViralDataPreparationScheduler();
  configureTopicRefreshScheduler();
}
