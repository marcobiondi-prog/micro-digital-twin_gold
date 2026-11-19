import { placeAreaQuery, placeAreaResult, vineyardAreaQuery, type PlaceAreaResult } from "@/models/place-area";
import { raceOverpass } from "@/lib/overpass-race";

type Ask = (d: { lat: number; lng: number; kind?: "piazza" | "vigneto" }) => Promise<PlaceAreaResult>;

/** Shapes already read, kept on the phone for a month (they rarely change): the 60 latest places. */
const KEEP = "mdt-place-area-v1";
const keyOf = (lat: number, lng: number, kind: string) => `${kind}:${lat.toFixed(5)},${lng.toFixed(5)}`;
function kept(k: string): PlaceAreaResult | undefined {
  try { const all = JSON.parse(localStorage.getItem(KEEP) ?? "{}") as Record<string, { at: number; v: PlaceAreaResult }>; const e = all[k]; return e && Date.now() - e.at < 30 * 864e5 ? e.v : undefined; } catch { return undefined; }
}
function keep(k: string, v: PlaceAreaResult) {
  try {
    const all = JSON.parse(localStorage.getItem(KEEP) ?? "{}") as Record<string, { at: number; v: PlaceAreaResult }>;
    all[k] = { at: Date.now(), v };
    localStorage.setItem(KEEP, JSON.stringify(Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 60))));
  } catch { /* full or private */ }
}

/**
 * The place's mapped shape (surface and centre for the pin): kept on the phone when read before; else the app's server
 * and the phone ask together (the phone sends the query to every map server at once) and the first answer wins, so a
 * busy server no longer leaves "Misuro la piazza…" turning for a minute. null when no shape is there or none answered.
 */
export async function loadPlaceArea(ask: Ask, lat: number, lng: number, kind: "piazza" | "vigneto" = "piazza"): Promise<PlaceAreaResult> {
  const k = keyOf(lat, lng, kind);
  const old = typeof window === "undefined" ? undefined : kept(k);
  if (old !== undefined) return old;
  const query = kind === "vigneto" ? vineyardAreaQuery(lat, lng) : placeAreaQuery(lat, lng);
  const fromServer = ask(kind === "vigneto" ? { lat, lng, kind } : { lat, lng });
  const fromPhone = raceOverpass<Parameters<typeof placeAreaResult>[0][number]>(query, 14000).then((els) => placeAreaResult(els, lat, lng));
  try {
    const v = await Promise.any([fromServer, fromPhone]);
    if (typeof window !== "undefined") keep(k, v);
    return v;
  } catch { return null; }
}
