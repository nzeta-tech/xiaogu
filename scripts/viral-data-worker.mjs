const endpoint = process.env.VIRAL_PREPARATION_URL ?? "http://app:3000/api/internal/viral-data/prepare";
const secret = process.env.VIRAL_PREPARATION_SECRET || process.env.CRON_SECRET;
const configuredInterval = Number(process.env.VIRAL_PREPARATION_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
const intervalMs = Number.isFinite(configuredInterval) ? Math.max(configuredInterval, 60 * 60 * 1000) : 6 * 60 * 60 * 1000;

if (!secret) {
  console.error("VIRAL_PREPARATION_SECRET or CRON_SECRET is required");
  process.exit(1);
}

async function triggerPreparation() {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ trigger: "worker" }),
      signal: AbortSignal.timeout(Number(process.env.VIRAL_PREPARATION_TIMEOUT_MS ?? 5 * 60 * 1000)),
    });
    const body = await response.text();
    if (!response.ok) {
      console.error(`[viral-data-worker] ${new Date().toISOString()} HTTP ${response.status}: ${body.slice(0, 1000)}`);
      return false;
    }
    console.log(`[viral-data-worker] ${new Date().toISOString()} ${body}`);
    return true;
  } catch (error) {
    console.error(`[viral-data-worker] ${new Date().toISOString()} ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

while (!(await triggerPreparation())) {
  await new Promise((resolve) => setTimeout(resolve, 30_000));
}
setInterval(triggerPreparation, intervalMs);
