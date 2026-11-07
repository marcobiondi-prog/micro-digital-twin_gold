import { createServerFn } from "@tanstack/react-start";
import { geocodingDeniedMessage } from "@/models/google-errors";
import { z } from "zod";

const geocodeInput = z.object({ query: z.string().trim().min(3).max(160) });

type GoogleGeocodeResult = {
  formatted_address?: string;
  address_components?: Array<{ long_name: string; types: string[] }>;
  geometry?: { location?: { lat?: number; lng?: number } };
};

export type SearchedLocation = { label: string; lat: number; lng: number; pending?: boolean };

type AddressPart = { longText: string; types: string[] };

function locationLabel(name: string, formattedAddress: string | undefined, parts: AddressPart[]) {
  const part = (type: string) => parts.find((item) => item.types.includes(type))?.longText;
  const street = [part("route"), part("street_number")].filter(Boolean).join(" ");
  const city = part("locality") ?? part("postal_town") ?? part("administrative_area_level_3");
  const region = part("administrative_area_level_1");
  const displayName = (name === part("route") && street ? street : name).replace(/,\s*(\d)/, " $1");
  const address = [street, city, region].filter((item): item is string => Boolean(item));
  const detail = address.length ? address : formattedAddress ? [formattedAddress] : [];
  return [displayName, ...detail.filter((item) => item.toLocaleLowerCase("it") !== displayName.toLocaleLowerCase("it"))].join(" · ");
}

function geocodeLabel(result: GoogleGeocodeResult, fallback: string) {
  const parts = (result.address_components ?? []).map(({ long_name, types }) => ({ longText: long_name, types }));
  const name = parts.find((part) => part.types.includes("point_of_interest"))?.longText
    ?? parts.find((part) => part.types.includes("route"))?.longText
    ?? result.formatted_address?.split(",")[0]
    ?? fallback;
  return locationLabel(name, result.formatted_address, parts);
}

export const searchGoogleLocation = createServerFn({ method: "POST" })
  .inputValidator((data) => geocodeInput.parse(data))
  .handler(async ({ data }): Promise<{ location?: SearchedLocation; error?: string }> => {
    const googleMapsApiKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!googleMapsApiKey) return { error: "Ricerca Google Maps non configurata." };

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("key", googleMapsApiKey);
    url.searchParams.set("address", data.query);
    url.searchParams.set("language", "it");
    url.searchParams.set("region", "it");

    const response = await fetch(url);

    if (response.status === 403) {
      const body = await response.json().catch(() => ({})) as { error?: { details?: Array<{ reason?: string }> } };
      const reason = body.error?.details?.find((detail) => detail.reason)?.reason;
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") return { error: "La chiave server Google Maps non consente richieste dal server." };
      if (reason === "API_KEY_SERVICE_BLOCKED") return { error: "La chiave Google Maps non abilita la geocodifica." };
      return { error: "Google Maps ha rifiutato la ricerca." };
    }
    if (!response.ok) {
      const body = await response.text();
      console.error(`Google Maps geocoding failed [${response.status}]: ${body}`);
      return { error: "Ricerca della zona non disponibile." };
    }

    const body = await response.json() as { status?: string; error_message?: string; results?: GoogleGeocodeResult[] };
    // The direct Geocoding API reports key problems as 200 + REQUEST_DENIED.
    if (body.status === "REQUEST_DENIED") {
      console.error(`Google Maps geocoding denied: ${body.error_message ?? ""}`);
      return { error: geocodingDeniedMessage(body.error_message) };
    }
    const first = body.results?.[0];
    const lat = first?.geometry?.location?.lat;
    const lng = first?.geometry?.location?.lng;
    if (body.status === "ZERO_RESULTS" || !first || typeof lat !== "number" || typeof lng !== "number") {
      return { error: "Nessuna zona trovata. Prova con un indirizzo più preciso." };
    }
    return { location: { label: geocodeLabel(first, data.query), lat, lng } };
  });
const reverseInput = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const reverseGoogleLocation = createServerFn({ method: "POST" })
  .inputValidator((data) => reverseInput.parse(data))
  .handler(async ({ data }): Promise<{ location?: SearchedLocation; error?: string }> => {
    const googleMapsApiKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!googleMapsApiKey) return { error: "Ricerca Google Maps non configurata." };
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("key", googleMapsApiKey);
    url.searchParams.set("latlng", `${data.lat},${data.lng}`);
    url.searchParams.set("language", "it");
    const response = await fetch(url);
    if (!response.ok) { console.error(`Reverse geocoding failed [${response.status}]: ${await response.text()}`); return { error: "Indirizzo non disponibile." }; }
    const body = await response.json() as { results?: GoogleGeocodeResult[] };
    const first = body.results?.[0];
    // Named by its street (or town) rather than "La mia posizione", so the page's title says where one is.
    const parts = (first?.address_components ?? []).map(({ long_name, types }) => ({ longText: long_name, types }));
    const named = parts.find((p) => p.types.includes("route"))?.longText ?? parts.find((p) => p.types.includes("locality"))?.longText ?? "La mia posizione";
    return { location: { label: first ? locationLabel(named, first.formatted_address, parts) : "La mia posizione", lat: data.lat, lng: data.lng } };
  });

const suggestInput = z.object({ query: z.string().trim().min(2).max(160), sessionToken: z.string().max(64).optional() });
export type LocationSuggestion = { placeId: string; text: string };

export const suggestGoogleLocations = createServerFn({ method: "POST" })
  .inputValidator((data) => suggestInput.parse(data))
  .handler(async ({ data }): Promise<{ suggestions: LocationSuggestion[]; error?: string }> => {
    const googleMapsApiKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!googleMapsApiKey) return { suggestions: [], error: "Ricerca Google Maps non configurata." };
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "X-Goog-Api-Key": googleMapsApiKey, "Content-Type": "application/json", "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text" },
      body: JSON.stringify({ input: data.query, sessionToken: data.sessionToken, languageCode: "it", includedRegionCodes: ["it", "va", "sm"] }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Autocomplete failed [${response.status}]: ${body}`);
      // Places API (New) is a separate service from Geocoding: a key that only enables the latter is refused here.
      if (/SERVICE_DISABLED|has not been used|is disabled/.test(body)) return { suggestions: [], error: "Places API (New) non abilitata per la chiave Google Maps." };
      if (/API_KEY_SERVICE_BLOCKED/.test(body)) return { suggestions: [], error: "La chiave Google Maps non abilita Places API (New)." };
      if (/API_KEY_HTTP_REFERRER_BLOCKED/.test(body)) return { suggestions: [], error: "La chiave server Google Maps non consente richieste dal server." };
      return { suggestions: [], error: "Suggerimenti non disponibili." };
    }
    const body = await response.json() as { suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }> };
    return { suggestions: (body.suggestions ?? []).flatMap((s) => s.placePrediction?.placeId && s.placePrediction.text?.text ? [{ placeId: s.placePrediction.placeId, text: s.placePrediction.text.text }] : []).slice(0, 6) };
  });

const placeInput = z.object({ placeId: z.string().min(3).max(300), sessionToken: z.string().max(64).optional() });

export const getGooglePlace = createServerFn({ method: "POST" })
  .inputValidator((data) => placeInput.parse(data))
  .handler(async ({ data }): Promise<{ location?: SearchedLocation; error?: string }> => {
    const googleMapsApiKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!googleMapsApiKey) return { error: "Ricerca Google Maps non configurata." };
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(data.placeId)}`);
    if (data.sessionToken) url.searchParams.set("sessionToken", data.sessionToken);
    url.searchParams.set("languageCode", "it");
    const response = await fetch(url, { headers: { "X-Goog-Api-Key": googleMapsApiKey, "X-Goog-FieldMask": "displayName,formattedAddress,addressComponents,location" } });
    if (!response.ok) { console.error(`Place details failed [${response.status}]: ${await response.text()}`); return { error: "Dettagli della zona non disponibili." }; }
    const body = await response.json() as { displayName?: { text?: string }; formattedAddress?: string; addressComponents?: AddressPart[]; location?: { latitude?: number; longitude?: number } };
    const lat = body.location?.latitude, lng = body.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return { error: "Zona senza coordinate." };
    return { location: { label: locationLabel(body.displayName?.text ?? body.formattedAddress?.split(",")[0] ?? "Zona selezionata", body.formattedAddress, body.addressComponents ?? []), lat, lng } };
  });
