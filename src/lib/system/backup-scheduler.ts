import { createDatabaseBackup } from "@/lib/system/backup";
import type { SystemSettings } from "@/lib/system/settings";
import { Cron } from "croner";

const schedulerState = globalThis as typeof globalThis & { xiaoguBackupCron?: Cron; xiaoguBackupExpression?: string };

export function configureBackupScheduler(settings: SystemSettings) {
  const expression = settings.backup.cronExpression || `0 */${Math.max(1, settings.backup.intervalHours)} * * *`;
  if (schedulerState.xiaoguBackupCron && (!settings.backup.scheduleEnabled || schedulerState.xiaoguBackupExpression !== expression)) {
    schedulerState.xiaoguBackupCron.stop();
    schedulerState.xiaoguBackupCron = undefined;
  }
  if (settings.backup.scheduleEnabled && !schedulerState.xiaoguBackupCron) {
    schedulerState.xiaoguBackupExpression = expression;
    schedulerState.xiaoguBackupCron = new Cron(expression, { timezone: "Asia/Shanghai", protect: true }, () => void createDatabaseBackup(null, "scheduled").catch(() => undefined));
  }
}
