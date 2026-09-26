export function taskLeaseHeartbeatIntervalMs(leaseSeconds) {
  const leaseMs = Math.max(60, Number(leaseSeconds) || 600) * 1000;
  // Renew frequently enough that a transient 30-second API timeout cannot put
  // the next attempt on the lease-expiry boundary.
  return Math.max(15_000, Math.min(60_000, Math.floor(leaseMs / 4)));
}
