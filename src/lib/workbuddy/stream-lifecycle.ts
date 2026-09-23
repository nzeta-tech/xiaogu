export const WORKBUDDY_STREAM_HEARTBEAT_MS = 15_000;

export function startWorkbuddyStreamHeartbeat(
  sendComment: () => void,
  intervalMs = WORKBUDDY_STREAM_HEARTBEAT_MS,
) {
  const timer = setInterval(sendComment, intervalMs);
  return () => clearInterval(timer);
}
