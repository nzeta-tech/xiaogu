import { query } from "@/lib/db/client";
import { parseQingshanCreatorPayload } from "@/lib/viral-creator-sources";
import { persistCreatorDiscovery } from "@/lib/viral-creator-task";

export async function importQingshanCreators(payload: unknown, trigger = "qingshan-one-time") {
  const creators = parseQingshanCreatorPayload(payload);
  const run = await query<{ id: string }>(
    `insert into viral_creator_discovery_runs(trigger_type,target_per_platform)
     values($1,100) returning id`,
    [trigger.slice(0, 80)],
  );
  const runId = run.rows[0].id;
  try {
    const upsertedCount = await persistCreatorDiscovery(runId, creators);
    const coverage = creators.reduce<Record<string, number>>((counts, creator) => {
      counts[creator.platform] = (counts[creator.platform] ?? 0) + 1;
      return counts;
    }, {});
    const evidenceCount = creators.reduce((total, creator) => total + (creator.evidenceCount ?? 1), 0);
    const diagnostics = { source: "qingshan_popular", coverage, evidenceCount, lockedItemsSkipped: true };
    await query(
      `update viral_creator_discovery_runs set status='succeeded',completed_at=now(),
         discovered_count=$2,upserted_count=$3,diagnostics=$4::jsonb where id=$1`,
      [runId, creators.length, upsertedCount, JSON.stringify(diagnostics)],
    );
    return { runId, discoveredCount: creators.length, upsertedCount, coverage, evidenceCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Qingshan import failure";
    await query(
      `update viral_creator_discovery_runs set status='failed',completed_at=now(),error_message=$2 where id=$1`,
      [runId, message.slice(0, 2000)],
    ).catch(() => undefined);
    throw error;
  }
}
