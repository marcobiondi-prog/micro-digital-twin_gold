/**
 * Ground heights of many points at once, for laying merged 3D models on a slope (views/v10/g3d-models): Google's own
 * elevation (the same ground the photographic 3D stands on) when the key allows it, else the open elevation service.
 * Kept for the session, by point rounded to about a metre. A point without an answer has no height (the model's group
 * then keeps it level).
 */
type G = { maps?: { ElevationService?: new () => { getElevationForLocations: (r: { locations: Array<{ lat: number; lng: number }> }) => Promise<{ results: Array<{ elevation: number }> }> } } };
const known = new Map<string, number>();
const keyOf = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

export function heightAt(p: { lat: number; lng: number }): number | undefined { return known.get(keyOf(p)); }

export async function loadHeights(points: Array<{ lat: number; lng: number }>): Promise<void> {
  const need = [...new Map(points.filter((p) => !known.has(keyOf(p))).map((p) => [keyOf(p), p])).values()];
  if (!need.length) return;
  const g = (globalThis as unknown as { google?: G & { maps?: { importLibrary?: (n: string) => Promise<{ ElevationService?: unknown }> } } }).google;
  let Svc = g?.maps?.ElevationService;
  if (!Svc && g?.maps?.importLibrary) {
    try { Svc = (await g.maps.importLibrary("elevation")).ElevationService as typeof Svc; } catch { /* not offered */ }
  }
  for (let i = 0; i < need.length; i += 200) {
    const part = need.slice(i, i + 200);
    let done = false;
    if (Svc) {
      try {
        const { results } = await new Svc().getElevationForLocations({ locations: part });
        results.forEach((r, j) => known.set(keyOf(part[j]!), r.elevation));
        done = results.length === part.length;
      } catch { /* Elevation not allowed for the key: the open service below */ }
    }
    if (done) continue;
    for (let k = 0; k < part.length; k += 100) {
      const chunk = part.slice(k, k + 100);
      try {
        const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p.lat.toFixed(5)).join(",")}&longitude=${chunk.map((p) => p.lng.toFixed(5)).join(",")}`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const { elevation } = (await res.json()) as { elevation?: number[] };
        elevation?.forEach((e, j) => { if (typeof e === "number") known.set(keyOf(chunk[j]!), e); });
      } catch { /* offline: kept level */ }
    }
  }
}
