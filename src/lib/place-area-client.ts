import { OVERPASS_URLS, placeAreaQuery, placeAreaResult, vineyardAreaQuery, type PlaceAreaResult } from "@/models/place-area";

type Ask = (d: { lat: number; lng: number; kind?: "piazza" | "vigneto" }) => Promise<PlaceAreaResult>;

/**
 * The place's mapped shape (surface and centre for the pin): asked to the app's server, which tries the map servers in
 * turn; when none answered it (the server's address turned away), the phone asks them itself, so the pin still goes to
 * the middle of the square instead of the address's point.
 */
export async function loadPlaceArea(ask: Ask, lat: number, lng: number, kind: "piazza" | "vigneto" = "piazza"): Promise<PlaceAreaResult> {
  try { return await ask(kind === "vigneto" ? { lat, lng, kind } : { lat, lng }); } catch { /* the phone asks below */ }
  const query = kind === "vigneto" ? vineyardAreaQuery(lat, lng) : placeAreaQuery(lat, lng);
  for (const url of OVERPASS_URLS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { elements?: Parameters<typeof placeAreaResult>[0] };
      return placeAreaResult(j.elements ?? [], lat, lng);
    } catch { /* next server */ }
  }
  return null;
}
