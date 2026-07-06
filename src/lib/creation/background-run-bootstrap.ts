import { ensureBackgroundWorkRun } from "@/lib/creation/background-run-registry";
import { tryListRecoverableRunningWorks } from "@/lib/db/repositories";

let bootstrapped = false;

export function bootstrapBackgroundWorkRecovery() {
  if (bootstrapped) return;
  bootstrapped = true;

  queueMicrotask(() => {
    void recoverRunningWorks();
  });
}

async function recoverRunningWorks() {
  const works = await tryListRecoverableRunningWorks(30);
  for (const work of works) {
    if (!work.input_payload || typeof work.input_payload !== "object") continue;

    void ensureBackgroundWorkRun({
      workId: work.work_id,
      slug: work.source_channel,
      userId: work.user_id,
      values: work.input_payload as Record<string, string | string[]>,
      quotaCost: Number(work.quota_cost ?? 0),
      existingRunId: work.app_run_id ?? null,
    });
  }
}
