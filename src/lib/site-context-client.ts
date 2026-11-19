import { OVERPASS_URLS } from "@/models/place-area";
import { drawsFrom, siteConstraintsQuery, siteDrawsQuery, type SiteContext, type SiteEl } from "@/models/site-context";

/** The place's height above sea level (for the mountain constraint); null when the weather service does not answer. */
async function elevationOf(lat: number, lng: number): Promise<number | null> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { elevation?: number[] };
    return typeof j.elevation?.[0] === "number" ? j.elevation[0] : null;
  } catch { return null; }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One query to the open map servers: each in turn, twice over, waiting a little after a "too many requests" or a
 * timeout (the app asks them for other things too); the last reason when none answers.
 */
async function ask(query: string): Promise<SiteEl[]> {
  let reason = "nessuna risposta";
  for (let round = 0; round < 2; round++) {
    for (const url of OVERPASS_URLS) {
      try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(25000) });
        if (r.ok) return ((await r.json()) as { elements?: SiteEl[] }).elements ?? [];
        reason = `risposta ${r.status}`;
        if (r.status === 429 || r.status === 504) await wait(1500 + round * 1500);
      } catch (e) {
        reason = e instanceof DOMException && e.name === "TimeoutError" ? "tempo scaduto" : navigator.onLine === false ? "senza rete" : "server non raggiungibile";
      }
    }
  }
  throw new Error(reason);
}

/** What is around the place, asked by the phone: what draws people, then what can bring a constraint (one after the other). */
export async function loadSiteContext(lat: number, lng: number): Promise<SiteContext> {
  const elevation = elevationOf(lat, lng);
  let draws: SiteEl[] | null = null, cons: SiteEl[] | null = null, why = "";
  try { draws = await ask(siteDrawsQuery(lat, lng)); } catch (e) { why = (e as Error).message; }
  try { cons = await ask(siteConstraintsQuery(lat, lng)); } catch (e) { why = why || (e as Error).message; }
  if (!draws && !cons) throw new Error(why || "nessuna risposta");
  const els = [...(draws ?? []), ...(cons ?? [])];
  return { draws: drawsFrom(draws ?? [], lat, lng), els, lat, lng, elevation: await elevation, drawsOk: !!draws, constraintsOk: !!cons };
}
