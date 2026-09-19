// Drain in-flight work before rejecting so callers can safely remove temporary files.
export async function mapVideoWork(values, limit, work) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid concurrency limit");
  const results = new Array(values.length);
  let next = 0, failed = false, failure;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (!failed && next < values.length) {
      const index = next++;
      try { results[index] = await work(values[index], index); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }));
  if (failed) throw failure;
  return results;
}
