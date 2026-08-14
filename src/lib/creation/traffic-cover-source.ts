type TrafficCoverSourceWork = {
  content?: unknown;
  content_json?: unknown;
};

export function resolveTrafficCoverSource(work: TrafficCoverSourceWork, batchId?: string) {
  const contentJson = work.content_json && typeof work.content_json === "object"
    ? work.content_json as { batches?: unknown }
    : null;
  const batches = Array.isArray(contentJson?.batches) ? contentJson.batches : [];
  const normalizedBatches = batches.filter((batch): batch is { id?: unknown; items?: unknown } => Boolean(batch && typeof batch === "object"));
  const selectedBatch = normalizedBatches.find((batch) => batch.id === batchId) ?? normalizedBatches[0];
  const items = Array.isArray(selectedBatch?.items) ? selectedBatch.items : [];
  const selectedBody = items.find((item) => item && typeof item === "object" && typeof (item as { body?: unknown }).body === "string") as { body?: string } | undefined;
  const body = selectedBody?.body?.trim();
  if (body) return body;
  return typeof work.content === "string" ? work.content.trim() : "";
}
