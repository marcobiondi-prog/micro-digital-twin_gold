import { OVERPASS_URLS, type Ring } from "@/models/place-area";
import { realObjectsFrom, realObjectsQuery, type RealObject } from "@/models/real-objects";

/** What already stands in the drawn area, asked by the phone to the open map servers in turn (12 s each); [] when none answers. */
export async function loadRealObjects(area: Ring): Promise<RealObject[]> {
  const query = realObjectsQuery(area);
  for (const url of OVERPASS_URLS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { elements?: Parameters<typeof realObjectsFrom>[0] };
      return realObjectsFrom(j.elements ?? [], area);
    } catch { /* next server */ }
  }
  throw new Error("map servers unreachable");
}
