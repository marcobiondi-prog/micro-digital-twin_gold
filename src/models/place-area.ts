/** A ring of [lat, lng] points, closed or not. */
export type Ring = Array<[number, number]>;
export type AreaCandidate = { rings: Ring[]; kind: "piazza" | "pedonale" | "parco" | "altro"; name?: string | undefined };

const EARTH = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Plane area in m² of one ring (shoelace on a local equirectangular projection, exact enough for a square). */
export function ringAreaM2(ring: Ring): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((s, [lat]) => s + lat, 0) / ring.length;
  const k = Math.cos(rad(lat0));
  let twice = 0;
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLng] = ring[i]!, [bLat, bLng] = ring[(i + 1) % ring.length]!;
    const ax = rad(aLng) * k * EARTH, ay = rad(aLat) * EARTH, bx = rad(bLng) * k * EARTH, by = rad(bLat) * EARTH;
    twice += ax * by - bx * ay;
  }
  return Math.abs(twice) / 2;
}

/** Ray casting: is the point inside the ring? */
export function ringContains(ring: Ring, lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]!, [yj, xj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const RANK: Record<AreaCandidate["kind"], number> = { piazza: 0, pedonale: 1, parco: 2, altro: 3 };

/**
 * The surface of the chosen place: among the mapped shapes around the point, the one that contains it, a square
 * before a pedestrian area before a park, the smallest first. Null when none contains the point: no area is invented.
 */
export function placeArea(candidates: AreaCandidate[], lat: number, lng: number): { m2: number; kind: AreaCandidate["kind"]; name?: string | undefined; centre: [number, number] } | null {
  const hits = candidates
    .filter((c) => c.rings.some((r) => ringContains(r, lat, lng)))
    .map((c) => ({ kind: c.kind, name: c.name, rings: c.rings, m2: c.rings.reduce((s, r) => s + ringAreaM2(r), 0) }))
    .filter((c) => c.m2 >= 50 && c.m2 <= 500_000)
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.m2 - b.m2);
  const best = hits[0];
  if (!best) return null;
  // The centre of the mapped shape (its largest ring): where the place's pin stands, not the address's point.
  const ring = [...best.rings].sort((a, b) => ringAreaM2(b) - ringAreaM2(a))[0]!;
  return { m2: Math.round(best.m2), kind: best.kind, name: best.name, centre: ringCentroid(ring) };
}

/**
 * Where the place's pin stands: the centre of the shape that contains the point (as placeArea picks it) or, when the
 * address's point falls just outside every shape (on the road beside the square), the centre of the nearest one — a
 * square before a pedestrian area before a park — within 120 m. Null without any shape around.
 */
export function placeCentre(candidates: AreaCandidate[], lat: number, lng: number): [number, number] | null {
  const inside = placeArea(candidates, lat, lng);
  if (inside) return inside.centre;
  const k = Math.cos((lat * Math.PI) / 180);
  const near = candidates
    .map((c) => {
      const ring = [...c.rings].sort((a, b) => ringAreaM2(b) - ringAreaM2(a))[0]!;
      const m2 = c.rings.reduce((s, r) => s + ringAreaM2(r), 0);
      // Distance to the shape's nearest corner or edge middle (a close enough measure of how near it is).
      const pts = ring.flatMap((p, i) => { const q = ring[(i + 1) % ring.length]!; return [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as [number, number]]; });
      const d = Math.min(...pts.map(([a, b]) => Math.hypot((a - lat) * 111_320, (b - lng) * 111_320 * k)));
      return { kind: c.kind, ring, m2, d };
    })
    .filter((c) => c.d <= 120 && c.m2 >= 50 && c.m2 <= 500_000)
    .sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.d - b.d);
  return near[0] ? ringCentroid(near[0].ring) : null;
}

/** The centroid of a ring (area-weighted, the middle of the shape, not the mean of its corners). */
export function ringCentroid(ring: Ring): [number, number] {
  const lat0 = ring[0]![0], lng0 = ring[0]![1];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [y1, x1] = [ring[i]![0] - lat0, ring[i]![1] - lng0], [y2, x2] = [ring[(i + 1) % ring.length]![0] - lat0, ring[(i + 1) % ring.length]![1] - lng0];
    const cross = x1 * y2 - x2 * y1;
    a += cross; cx += (x1 + x2) * cross; cy += (y1 + y2) * cross;
  }
  if (Math.abs(a) < 1e-14) return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  return [lat0 + cy / (3 * a), lng0 + cx / (3 * a)];
}

/** Overpass query: closed shapes within 80 m that can be a public space. */
export function placeAreaQuery(lat: number, lng: number): string {
  const at = `(around:80,${lat.toFixed(6)},${lng.toFixed(6)})`;
  return `[out:json][timeout:20];(way${at}[place=square];relation${at}[place=square];way${at}[highway=pedestrian][area=yes];way${at}["area:highway"=pedestrian];way${at}[leisure~"^(park|garden|playground)$"];relation${at}[highway=pedestrian];);out geom;`;
}

/** Overpass query for a vineyard: the mapped vineyard plots (landuse=vineyard) within 150 m. */
export function vineyardAreaQuery(lat: number, lng: number): string {
  const at = `(around:150,${lat.toFixed(6)},${lng.toFixed(6)})`;
  return `[out:json][timeout:20];(way${at}[landuse=vineyard];relation${at}[landuse=vineyard];);out geom;`;
}

type OsmEl = { type: string; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }>; members?: Array<{ role?: string; geometry?: Array<{ lat: number; lon: number }> }> };

/** Reads the Overpass reply into candidates (ways as one ring, relations as their closed outer rings). */
export function areaCandidates(elements: OsmEl[]): AreaCandidate[] {
  const ring = (g?: Array<{ lat: number; lon: number }>): Ring | null => {
    if (!g || g.length < 4) return null;
    const first = g[0]!, last = g[g.length - 1]!;
    return first.lat === last.lat && first.lon === last.lon ? g.map((p) => [p.lat, p.lon]) : null;
  };
  const kindOf = (t: Record<string, string> = {}): AreaCandidate["kind"] =>
    t["place"] === "square" ? "piazza" : t["highway"] === "pedestrian" || t["area:highway"] === "pedestrian" ? "pedonale" : t["leisure"] ? "parco" : "altro";
  return elements.flatMap((el) => {
    const rings = el.type === "way" ? [ring(el.geometry)] : (el.members ?? []).filter((m) => m.role === "outer").map((m) => ring(m.geometry));
    const closed = rings.filter((r): r is Ring => r !== null);
    return closed.length ? [{ rings: closed, kind: kindOf(el.tags), name: el.tags?.["name"] }] : [];
  });
}
