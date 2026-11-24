export type Camera = {
  center: { lat: number; lng: number; altitude: number };
  range: number;
  tilt: number;
  heading: number;
};

/**
 * Oblique view centred on the reference point, so buildings and trees read in depth; a taller panel
 * sits a little closer. `altitude` is the ground elevation in metres above sea level: Map3DElement
 * centres are absolute, so a sea-level centre under a 700 m town looks underground and, tilted,
 * frames a spot more than a kilometre away from the place.
 */
export function frameCamera(lat: number, lng: number, height: number, altitude = 0): Camera {
  return {
    center: { lat, lng, altitude },
    range: height >= 260 ? 300 : 380,
    tilt: 62,
    heading: 20,
  };
}

/** Ground elevation from an Open-Meteo elevation response, or undefined when it is missing or invalid. */
export function parseElevation(body: unknown): number | undefined {
  const value = (body as { elevation?: unknown } | null)?.elevation;
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "number" && Number.isFinite(first) && first > -500 && first < 9000 ? first : undefined;
}

const elevations = new Map<string, Promise<number>>();

/** Ground elevation of a point (Open-Meteo, keyless, cached); 0 when the service does not answer within 3 s. */
export function groundElevation(lat: number, lng: number, fetcher: typeof fetch = fetch): Promise<number> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  let pending = elevations.get(key);
  if (!pending) {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;
    pending = fetcher(url, { signal: AbortSignal.timeout(3000) })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((body) => parseElevation(body) ?? 0)
      .catch(() => 0);
    // A failed lookup is not cached, so the next open tries again.
    void pending.then((value) => { if (value === 0) elevations.delete(key); });
    elevations.set(key, pending);
  }
  return pending;
}
