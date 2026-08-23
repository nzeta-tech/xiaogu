import { Cron } from "croner";
import { refreshTopicCache } from "./cache-refresh";

const schedulerState = globalThis as typeof globalThis & {
  xiaoguTopicRefreshCron?: Cron;
  xiaoguTopicRefreshExpression?: string;
};

/**
 * One scheduler is started per app process. In a multi-instance deployment the
 * database advisory lock inside refreshTopicCache lets exactly one instance run
 * each hourly collection.
 */
export function configureTopicRefreshScheduler() {
  const enabled = process.env.TOPIC_REFRESH_SCHEDULE_ENABLED !== "0";
  const expression = process.env.TOPIC_REFRESH_CRON?.trim() || "0 * * * *";

  if (schedulerState.xiaoguTopicRefreshCron && (!enabled || schedulerState.xiaoguTopicRefreshExpression !== expression)) {
    schedulerState.xiaoguTopicRefreshCron.stop();
    schedulerState.xiaoguTopicRefreshCron = undefined;
  }
  if (!enabled || schedulerState.xiaoguTopicRefreshCron) return;

  schedulerState.xiaoguTopicRefreshExpression = expression;
  schedulerState.xiaoguTopicRefreshCron = new Cron(
    expression,
    { timezone: "Asia/Shanghai", protect: true },
    () => void refreshTopicCache({ force: true }).catch((error) => console.error("[topic-refresh] scheduled run failed", error)),
  );
}
