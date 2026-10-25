import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SearchedLocation } from "@/controllers/geo.functions";
import { photonSuggestions, photonUrl, type OsmSuggestion } from "@/models/osm-suggest";
import { areaCandidates, placeArea, placeAreaQuery } from "@/models/place-area";

// Ricerca gratuita per ospiti tramite OpenStreetMap (Nominatim): nessun costo Google.
const UA = { "User-Agent": "MicroDigitalTwin/1.0", "Accept-Language": "it" };

type NomItem = { lat: string; lon: string; display_name?: string; name?: string; address?: { road?: string; house_number?: string; city?: string; town?: string; village?: string; municipality?: string; state?: string } };

function label(item: NomItem, fallback: string) {
  const a = item.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(" ");
  const city = a.city ?? a.town ?? a.village ?? a.municipality;
  const name = item.name || street || item.display_name?.split(",")[0] || fallback;
  const parts = [street, city, a.state].filter((p): p is string => !!p && p.toLowerCase() !== name.toLowerCase());
  return [name, ...parts].join(" · ");
}

export const searchOsmLocation = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().trim().min(3).max(160) }).parse(d))
  .handler(async ({ data }): Promise<{ location?: SearchedLocation; error?: string }> => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", data.query); url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1"); url.searchParams.set("addressdetails", "1"); url.searchParams.set("countrycodes", "it,va,sm");
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) return { error: "Ricerca della zona non disponibile." };
      const [first] = (await r.json()) as NomItem[];
      if (!first) return { error: "Nessuna zona trovata. Prova con un indirizzo più preciso." };
      return { location: { label: label(first, data.query), lat: Number(first.lat), lng: Number(first.lon) } };
    } catch { return { error: "Ricerca della zona non disponibile." }; }
  });

export const reverseOsmLocation = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(d))
  .handler(async ({ data }): Promise<{ location?: SearchedLocation }> => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${data.lat}&lon=${data.lng}&format=jsonv2&addressdetails=1`, { headers: UA });
      if (!r.ok) return {};
      const item = (await r.json()) as NomItem;
      return { location: { label: label({ ...item, name: "La mia posizione" }, "La mia posizione"), lat: data.lat, lng: data.lng } };
    } catch { return {}; }
  });

// Suggestions while typing via Photon (OpenStreetMap, built for autocomplete).
export const suggestOsmLocations = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ query: z.string().trim().min(2).max(160) }).parse(d))
  .handler(async ({ data }): Promise<{ suggestions: OsmSuggestion[] }> => {
    try {
      const r = await fetch(photonUrl(data.query), { headers: UA, signal: AbortSignal.timeout(6000) });
      if (!r.ok) { console.error(`Photon [${r.status}]`); return { suggestions: [] }; }
      return { suggestions: photonSuggestions(await r.json(), data.query) };
    } catch (error) { console.error("Photon", error); return { suggestions: [] }; }
  });

/** Surface of the chosen place from its mapped shape (square, pedestrian area or park containing the point); none, no number. */
export const getPlaceArea = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(d))
  .handler(async ({ data }): Promise<{ m2: number; name?: string | undefined } | null> => {
    try {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": UA["User-Agent"] },
        body: new URLSearchParams({ data: placeAreaQuery(data.lat, data.lng) }),
      });
      if (!r.ok) { console.error(`Place area failed [${r.status}]`); return null; }
      const j = (await r.json()) as { elements?: Parameters<typeof areaCandidates>[0] };
      const area = placeArea(areaCandidates(j.elements ?? []), data.lat, data.lng);
      return area ? { m2: area.m2, name: area.name } : null;
    } catch { return null; }
  });
