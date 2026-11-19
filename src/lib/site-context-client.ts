import { OVERPASS_URLS } from "@/models/place-area";
import { drawsFrom, siteContextQuery, type SiteContext, type SiteEl } from "@/models/site-context";

/** The place's height above sea level (for the mountain constraint); null when the weather service does not answer. */
async function elevationOf(lat: number, lng: number): Promise<number | null> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { elevation?: number[] };
    return typeof j.elevation?.[0] === "number" ? j.elevation[0] : null;
  } catch { return null; }
}

/** What is around the place, asked by the phone to the open map servers in turn (15 s each); throws when none answers. */
export async function loadSiteContext(lat: number, lng: number): Promise<SiteContext> {
  const query = siteContextQuery(lat, lng);
  const elevation = elevationOf(lat, lng);
  for (const url of OVERPASS_URLS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { elements?: SiteEl[] };
      const els = j.elements ?? [];
      return { draws: drawsFrom(els, lat, lng), els, lat, lng, elevation: await elevation };
    } catch { /* next server */ }
  }
  throw new Error("map servers unreachable");
}
