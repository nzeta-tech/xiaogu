export async function resolveAndCacheViralCover(input) {
  if (input.providedThumbnail) {
    try {
      await input.cache(input.providedThumbnail);
      return "provider";
    } catch (error) {
      input.onProviderRejected?.(error);
    }
  }
  const inspectedThumbnail = await input.inspect();
  if (!inspectedThumbnail) throw new Error("viral cover enrichment returned no thumbnail");
  await input.cache(inspectedThumbnail);
  return "original_work";
}
