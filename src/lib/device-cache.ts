/**
 * The device's cache: the offline copies of the app's pages, files and map tiles (the browser's Cache Storage) and the
 * looked-up crests and logos. Emptying it frees space and nothing of the user's is lost — simulations, history,
 * settings and the photos waiting on the phone stay —; the app fetches what it needs again from the network.
 */
const LOOKUP_KEYS = ["mdt-crest-v1", "mdt-gnss-logo-v1", "mdt-service-logo-v1"];

/** Bytes the cache takes, as the browser reports it (null where it does not say). */
export async function deviceCacheBytes(): Promise<number | null> {
  try {
    const est = (await navigator.storage?.estimate?.()) as (StorageEstimate & { usageDetails?: { caches?: number } }) | undefined;
    if (est?.usageDetails && typeof est.usageDetails.caches === "number") return est.usageDetails.caches;
  } catch { /* not reported */ }
  if (typeof caches === "undefined") return null;
  // Without the browser's breakdown: add up what the caches hold (their declared sizes).
  let total = 0;
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      const len = Number(res?.headers.get("content-length") ?? 0);
      total += Number.isFinite(len) ? len : 0;
    }
  }
  return total;
}

/** Empties the cache; returns the bytes freed when known. */
export async function clearDeviceCache(): Promise<number | null> {
  const before = await deviceCacheBytes();
  if (typeof caches !== "undefined") for (const name of await caches.keys()) await caches.delete(name);
  try { LOOKUP_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* storage off */ }
  const after = await deviceCacheBytes();
  return before === null ? null : Math.max(0, before - (after ?? 0));
}
