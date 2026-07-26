const endpoint = process.env.VIRAL_CREATOR_DISCOVERY_URL ?? "http://app:3000/api/internal/viral-data/discover-creators";
const secret = process.env.VIRAL_PREPARATION_SECRET || process.env.CRON_SECRET;
const configuredInterval = Number(process.env.VIRAL_CREATOR_DISCOVERY_INTERVAL_MS ?? 24 * 60 * 60 * 1000);
const intervalMs = Number.isFinite(configuredInterval) ? Math.max(configuredInterval, 60 * 60 * 1000) : 24 * 60 * 60 * 1000;

if (!secret) {
  console.error("VIRAL_PREPARATION_SECRET or CRON_SECRET is required");
  process.exit(1);
}

async function triggerDiscovery() {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ trigger: "creator-worker" }),
      signal: AbortSignal.timeout(Number(process.env.VIRAL_CREATOR_DISCOVERY_TIMEOUT_MS ?? 5 * 60 * 1000)),
    });
    const body = await response.text();
    if (!response.ok) {
      console.error(`[viral-creator-worker] ${new Date().toISOString()} HTTP ${response.status}: ${body.slice(0, 1000)}`);
      return false;
    }
    console.log(`[viral-creator-worker] ${new Date().toISOString()} ${body}`);
    return true;
  } catch (error) {
    console.error(`[viral-creator-worker] ${new Date().toISOString()} ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

while (!(await triggerDiscovery())) await new Promise((resolve) => setTimeout(resolve, 30_000));
setInterval(triggerDiscovery, intervalMs);
