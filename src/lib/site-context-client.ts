import { OVERPASS_URLS } from "@/models/place-area";
import { drawsFromCounts, siteConstraintsQuery, siteDrawsQuery, siteParksQuery, type SiteContext, type SiteEl } from "@/models/site-context";

/** The place's height above sea level (for the mountain constraint); null when the weather service does not answer. */
async function elevationOf(lat: number, lng: number): Promise<number | null> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`, { signal: timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { elevation?: number[] };
    return typeof j.elevation?.[0] === "number" ? j.elevation[0] : null;
  } catch { return null; }
}

/** A signal that aborts after ms (AbortSignal.timeout is missing on some older phones). */
function timeout(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) return AbortSignal.timeout(ms);
  const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal;
}

/** The map servers asked by the phone: the app's usual ones plus two steady mirrors. */
const SERVERS = [...new Set([...OVERPASS_URLS, "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.osm.jp/api/interpreter"])];

/**
 * One query to every map server at once (14 s each): the first good answer wins and the others are cancelled, so a
 * server that keeps the request queued no longer holds the card for minutes ("Riprova" asks again).
 */
async function ask(query: string, ms = 14000): Promise<SiteEl[]> {
  let reason = "nessuna risposta";
  for (let round = 0; round < 1; round++) {
    const ctrl = new AbortController();
    try {
      return await Promise.any(SERVERS.map(async (url) => {
        const sig = timeout(ms);
        const both = new AbortController();
        const stop = () => both.abort();
        sig.addEventListener("abort", stop); ctrl.signal.addEventListener("abort", stop);
        try {
          const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: query }), signal: both.signal });
          if (!r.ok) { reason = `risposta ${r.status}`; throw new Error(reason); }
          return ((await r.json()) as { elements?: SiteEl[] }).elements ?? [];
        } catch (e) {
          if (both.signal.aborted && sig.aborted) reason = "tempo scaduto";
          else if (typeof navigator !== "undefined" && navigator.onLine === false) reason = "senza rete";
          else if (!(e instanceof Error && e.message.startsWith("risposta"))) reason = "server non raggiungibile";
          throw e;
        }
      }));
    } catch { /* every server failed this round */ } finally { ctrl.abort(); }
  }
  throw new Error(reason);
}

/** The surroundings already read for a place, kept on the phone for a week (they change slowly). */
const KEEP = "mdt-site-v2";
const keyOf = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
function kept(lat: number, lng: number): SiteContext | null {
  try { const all = JSON.parse(localStorage.getItem(KEEP) ?? "{}") as Record<string, { at: number; v: SiteContext }>; const e = all[keyOf(lat, lng)]; return e && Date.now() - e.at < 7 * 864e5 ? e.v : null; } catch { return null; }
}
function keep(v: SiteContext) {
  try {
    const all = JSON.parse(localStorage.getItem(KEEP) ?? "{}") as Record<string, { at: number; v: SiteContext }>;
    all[keyOf(v.lat, v.lng)] = { at: Date.now(), v };
    const recent = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 30);
    localStorage.setItem(KEEP, JSON.stringify(Object.fromEntries(recent)));
  } catch { /* full or private */ }
}

/** What is around the place: kept on the phone when read before, else asked (what draws people, then the constraints). */
export async function loadSiteContext(lat: number, lng: number, fresh = false): Promise<SiteContext> {
  const old = fresh ? null : kept(lat, lng);
  if (old) return old;
  const elevation = elevationOf(lat, lng);
  // The three asked together (the parks one optional and shorter), so the card waits for the slowest, not their sum.
  const [dr, cr, pr] = await Promise.allSettled([ask(siteDrawsQuery(lat, lng)), ask(siteConstraintsQuery(lat, lng)), ask(siteParksQuery(lat, lng), 9000)]);
  let draws = dr.status === "fulfilled" ? dr.value : null;
  const cons = cr.status === "fulfilled" ? cr.value : null;
  // The servers answered the constraints but not the counts in time: asked once more by itself, with more time.
  if (!draws && cons) { try { draws = await ask(siteDrawsQuery(lat, lng), 22000); } catch { /* said below */ } }
  const parks = pr.status === "fulfilled" ? pr.value : [];
  const why = !draws && dr.status === "rejected" ? (dr.reason as Error).message : "", consWhy = cr.status === "rejected" ? (cr.reason as Error).message : "";
  if (!draws && !cons) throw new Error(why || consWhy || "nessuna risposta");
  const v: SiteContext = { draws: drawsFromCounts(draws ?? []), els: [...(cons ?? []), ...parks], lat, lng, elevation: await elevation, drawsOk: !!draws, constraintsOk: !!cons, ...(consWhy || why ? { why: consWhy || why } : {}) };
  if (draws && cons) keep(v);
  return v;
}
