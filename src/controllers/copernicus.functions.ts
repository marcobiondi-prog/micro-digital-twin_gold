import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { latestValue, ndviRequest, surfaceTempRequest, type CopernicusReading } from "@/models/copernicus";

const TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics";

let token: { value: string; expires: number } | undefined;
// Satellite passes are days apart: a few hours of cache per place saves the free quota.
const cache = new Map<string, { at: number; reading: CopernicusReading }>();
const CACHE_MS = 6 * 3_600_000;

async function accessToken(id: string, secret: string) {
  if (token && token.expires > Date.now() + 30_000) return token.value;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  if (!response.ok) throw new Error(`token ${response.status}`);
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("token missing");
  token = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 300) * 1000 };
  return token.value;
}

async function statistics(bearer: string, request: unknown) {
  const response = await fetch(STATS_URL, { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(request) });
  if (!response.ok) {
    console.error(`Copernicus statistics failed [${response.status}]: ${(await response.text()).slice(0, 500)}`);
    throw new Error(String(response.status));
  }
  return response.json() as Promise<unknown>;
}

/** Premium (signed-in): Sentinel-2 NDVI and Sentinel-3 surface temperature around a place. */
export const getCopernicusReading = createServerFn({ method: "POST" })
  .middleware([optionalSupabaseAuth])
  .inputValidator((d) => z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(d))
  .handler(async ({ data }): Promise<CopernicusReading & { configured: boolean }> => {
    const id = process.env["CDSE_CLIENT_ID"], secret = process.env["CDSE_CLIENT_SECRET"];
    if (!id || !secret) return { configured: false, ndvi: null, surfaceTemp: null, errors: [] };
    const key = `${data.lat.toFixed(3)},${data.lng.toFixed(3)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return { configured: true, ...hit.reading };
    let bearer: string;
    try { bearer = await accessToken(id, secret); }
    catch (error) {
      console.error("Copernicus token failed", error);
      return { configured: true, ndvi: null, surfaceTemp: null, errors: ["Accesso a Copernicus rifiutato: verifica CDSE_CLIENT_ID e CDSE_CLIENT_SECRET."] };
    }
    const [ndvi, temp] = await Promise.allSettled([statistics(bearer, ndviRequest(data.lat, data.lng)), statistics(bearer, surfaceTempRequest(data.lat, data.lng))]);
    const errors: string[] = [];
    if (ndvi.status === "rejected") errors.push("Indice di vegetazione Sentinel-2 non disponibile.");
    if (temp.status === "rejected") errors.push("Temperatura superficiale Sentinel-3 non disponibile.");
    const reading: CopernicusReading = {
      ndvi: ndvi.status === "fulfilled" ? latestValue(ndvi.value, "ndvi") : null,
      surfaceTemp: temp.status === "fulfilled" ? latestValue(temp.value, "temp") : null,
      errors,
    };
    if (!errors.length) cache.set(key, { at: Date.now(), reading });
    return { configured: true, ...reading };
  });
