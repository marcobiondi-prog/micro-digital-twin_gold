import { raceOverpass, timeout } from "@/lib/overpass-race";
import { drawsFromCounts, probePoints, ringTag, siteConstraintsQuery, siteDrawsQuery, siteParksQuery, type SiteContext, type SiteEl } from "@/models/site-context";
import type { Ring } from "@/models/place-area";

/** The place's height above sea level (for the mountain constraint): the highest of its points (a drawn area's middle and corners); null when the weather service does not answer. */
async function elevationOf(pts: Ring): Promise<number | null> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map((p) => p[0].toFixed(4)).join(",")}&longitude=${pts.map((p) => p[1].toFixed(4)).join(",")}`, { signal: timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { elevation?: number[] };
    const hs = (j.elevation ?? []).filter((v) => typeof v === "number");
    return hs.length ? Math.max(...hs) : null;
  } catch { return null; }
}

/** One query to every map server at once (see lib/overpass-race). */
const ask = (query: string, ms = 14000) => raceOverpass<SiteEl>(query, ms);

/** The surroundings already read for a place, kept on the phone for a week (they change slowly). */
const KEEP = "mdt-site-v3";
const keyOf = (lat: number, lng: number, ring?: Ring | null) => `${lat.toFixed(4)},${lng.toFixed(4)},${ringTag(ring)}`;
function kept(lat: number, lng: number, ring?: Ring | null): SiteContext | null {
  try { const all = JSON.parse(localStorage.getItem(KEEP) ?? "{}") as Record<string, { at: number; v: SiteContext }>; const e = all[keyOf(lat, lng, ring)]; return e && Date.now() - e.at < 7 * 864e5 ? e.v : null; } catch { return null; }
}
function keep(v: SiteContext) {
  try {
    const all = JSON.parse(localStorage.getItem(KEEP) ?? "{}") as Record<string, { at: number; v: SiteContext }>;
    all[keyOf(v.lat, v.lng, v.ring)] = { at: Date.now(), v };
    const recent = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 30);
    localStorage.setItem(KEEP, JSON.stringify(Object.fromEntries(recent)));
  } catch { /* full or private */ }
}

/** What is around the place: kept on the phone when read before, else asked (what draws people, then the constraints). */
export async function loadSiteContext(lat: number, lng: number, ring?: Ring | null, fresh = false): Promise<SiteContext> {
  const old = fresh ? null : kept(lat, lng, ring);
  if (old) return old;
  const elevation = elevationOf(probePoints(lat, lng, ring));
  // The three asked together (the parks one optional and shorter), so the card waits for the slowest, not their sum.
  const [dr, cr, pr] = await Promise.allSettled([ask(siteDrawsQuery(lat, lng, ring)), ask(siteConstraintsQuery(lat, lng, ring)), ask(siteParksQuery(lat, lng, ring), 9000)]);
  let draws = dr.status === "fulfilled" ? dr.value : null;
  const cons = cr.status === "fulfilled" ? cr.value : null;
  // The servers answered the constraints but not the counts in time: asked once more by itself, with more time.
  if (!draws && cons) { try { draws = await ask(siteDrawsQuery(lat, lng, ring), 22000); } catch { /* said below */ } }
  const parks = pr.status === "fulfilled" ? pr.value : [];
  const why = !draws && dr.status === "rejected" ? (dr.reason as Error).message : "", consWhy = cr.status === "rejected" ? (cr.reason as Error).message : "";
  if (!draws && !cons) throw new Error(why || consWhy || "nessuna risposta");
  const v: SiteContext = { draws: drawsFromCounts(draws ?? []), els: [...(cons ?? []), ...parks], lat, lng, ...(ring ? { ring } : {}), elevation: await elevation, drawsOk: !!draws, constraintsOk: !!cons, ...(consWhy || why ? { why: consWhy || why } : {}) };
  if (draws && cons) keep(v);
  return v;
}
