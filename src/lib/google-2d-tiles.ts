/**
 * Google's own satellite tiles for the 2D map (Map Tiles API, 2D tiles), so the 2D and 3D maps show the same imagery:
 * a session is asked once with the browser key (satellite with the road and place names over it, in Italian), kept
 * for the browser session until it expires, and its tile URL handed to the 2D map. Null when there is no key or the
 * key is refused: the 2D map then keeps its open imagery.
 */
export type GoogleTiles = { url: string; tileSize: number };
const KEY = "mdt-g2d-session-v1";

export async function googleTiles(apiKey: string | undefined): Promise<GoogleTiles | null> {
  if (!apiKey) return null;
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { session: string; expiry: number; size: number; key: string } | null;
    if (kept && kept.key === apiKey && kept.expiry * 1000 > Date.now() + 3600_000) return tilesOf(kept.session, kept.size, apiKey);
  } catch { /* no storage: ask again */ }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ mapType: "satellite", language: "it-IT", region: "IT", layerTypes: ["layerRoadmap"] }),
    }).finally(() => clearTimeout(t));
    if (!r.ok) return null;
    const s = (await r.json()) as { session?: string; expiry?: string | number; tileWidth?: number };
    if (!s.session) return null;
    const size = s.tileWidth ?? 256;
    try { sessionStorage.setItem(KEY, JSON.stringify({ session: s.session, expiry: Number(s.expiry ?? 0), size, key: apiKey })); } catch { /* memory only */ }
    return tilesOf(s.session, size, apiKey);
  } catch { return null; }
}

const tilesOf = (session: string, size: number, key: string): GoogleTiles => ({
  url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`,
  tileSize: size,
});
