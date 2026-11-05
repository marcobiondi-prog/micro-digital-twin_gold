/**
 * Laying shapes on a hilly ground in the 3D view. Google's 3D shapes put each vertex at its height over the ground
 * under it, but fill and edges run straight between vertices: on a slope or a ridge a big polygon cut into the hill
 * and vanished, and a long edge ran under it. So a big shape is cut into small tiles (each follows the ground at its
 * own corners) and its outline into short pieces. Pure geometry in [lat, lng].
 */
export type LL = [number, number];
const M = 111_320;
const kOf = (lat: number) => M * Math.cos((lat * Math.PI) / 180);

/** The ring's surface (m²), by the shoelace formula on a local metre frame. */
export function ringM2(ring: LL[]): number {
  if (ring.length < 3) return 0;
  const k = kOf(ring[0]![0]);
  let s = 0;
  for (let i = 0; i < ring.length; i++) { const [a, b] = ring[i]!, [c, d] = ring[(i + 1) % ring.length]!; s += b * k * c * M - d * k * a * M; }
  return Math.abs(s) / 2;
}

/** Points added along each segment so none is longer than `stepM` (the line then hugs the ground). */
export function densify<T extends { lat: number; lng: number }>(pts: T[], stepM: number, closed = false): T[] {
  if (pts.length < 2) return pts;
  const out: T[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    const len = Math.hypot((b.lat - a.lat) * M, (b.lng - a.lng) * kOf(a.lat));
    const parts = Math.max(1, Math.ceil(len / stepM));
    for (let j = 0; j < parts; j++) { const t = j / parts; out.push({ ...a, lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }); }
  }
  if (closed) out.push({ ...pts[0]! }); else out.push(pts[pts.length - 1]!);
  return out;
}

/** The ring clipped to an axis-aligned box (Sutherland–Hodgman), in lat/lng. */
function clipBox(ring: LL[], minLat: number, maxLat: number, minLng: number, maxLng: number): LL[] {
  let poly = ring;
  const edges: Array<[(p: LL) => boolean, (a: LL, b: LL) => LL]> = [
    [(p) => p[0] >= minLat, (a, b) => { const t = (minLat - a[0]) / (b[0] - a[0]); return [minLat, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[0] <= maxLat, (a, b) => { const t = (maxLat - a[0]) / (b[0] - a[0]); return [maxLat, a[1] + (b[1] - a[1]) * t]; }],
    [(p) => p[1] >= minLng, (a, b) => { const t = (minLng - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, minLng]; }],
    [(p) => p[1] <= maxLng, (a, b) => { const t = (maxLng - a[1]) / (b[1] - a[1]); return [a[0] + (b[0] - a[0]) * t, maxLng]; }],
  ];
  for (const [inside, cut] of edges) {
    const next: LL[] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i]!, prev = poly[(i + poly.length - 1) % poly.length]!;
      if (inside(cur)) { if (!inside(prev)) next.push(cut(prev, cur)); next.push(cur); }
      else if (inside(prev)) next.push(cut(prev, cur));
    }
    poly = next;
    if (!poly.length) break;
  }
  return poly;
}

/**
 * The ring cut into tiles of about `cellM` metres (at most `maxTiles`, the cell growing to keep within it), each a
 * piece of the ring's own shape; a ring smaller than one cell comes back whole.
 */
export function tileRing(ring: LL[], cellM: number, maxTiles = 32): LL[][] {
  if (ring.length < 3) return [];
  const lats = ring.map((p) => p[0]), lngs = ring.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const k = kOf((minLat + maxLat) / 2);
  const hM = (maxLat - minLat) * M, wM = (maxLng - minLng) * k;
  let cell = Math.max(cellM, Math.sqrt((wM * hM) / maxTiles));
  if (wM <= cell && hM <= cell) return [ring];
  // Keep the count within the limit for long thin shapes too.
  while (Math.ceil(wM / cell) * Math.ceil(hM / cell) > maxTiles * 1.6) cell *= 1.2;
  const nx = Math.ceil(wM / cell), ny = Math.ceil(hM / cell);
  const dLat = (maxLat - minLat) / ny, dLng = (maxLng - minLng) / nx;
  const out: LL[][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const piece = clipBox(ring, minLat + j * dLat, minLat + (j + 1) * dLat, minLng + i * dLng, minLng + (i + 1) * dLng);
    if (piece.length >= 3 && ringM2(piece) > 0.05) out.push(piece);
  }
  return out;
}
