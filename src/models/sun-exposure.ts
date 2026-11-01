/**
 * How much summer sun each spot of an area gets, for placing shade and trees where the heat hits most. A plain solar
 * model: the sun's height and direction every hour from 10 to 18 (solar time) on a midsummer day at the area's latitude,
 * and the buildings around the area taken as a wall BUILDING_M high standing STREET_M beyond its outline (a usual town
 * square). A spot is in the sun at an hour when, looking from it towards the sun, that wall stays below the sun.
 */
export const BUILDING_M = 12;
export const STREET_M = 8;
const rad = (d: number) => (d * Math.PI) / 180;

/** The sun every hour from 10 to 18 (solar time) on day `day` of the year: azimuth from north, clockwise, and height. */
export function sunPath(lat: number, day = 172, hours: number[] = [10, 11, 12, 13, 14, 15, 16, 17, 18]): Array<{ az: number; alt: number }> {
  const decl = rad(23.44) * Math.sin(((2 * Math.PI) / 365) * (284 + day));
  const phi = rad(lat);
  return hours.map((t) => {
    const h = rad(15 * (t - 12));
    const alt = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(h));
    // Azimuth from south (west positive), turned to from north.
    const azS = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi));
    return { az: azS + Math.PI, alt };
  }).filter((s) => s.alt > 0.05);
}

/** Distance from (x, y) to the outline (points in metres) along the direction (dx, dy); Infinity when it never meets it. */
function rayToEdge(pts: Array<[number, number]>, x: number, y: number, dx: number, dy: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[(i + 1) % pts.length]!;
    const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - x) * ey - (ay - y) * ex) / den, u = ((ax - x) * dy - (ay - y) * dx) / den;
    if (t > 1e-6 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

/** Share of the summer hours (0–1) the spot (x, y) is in the sun, inside the outline `pts` (metres, x east, y north). */
export function sunShare(pts: Array<[number, number]>, sun: Array<{ az: number; alt: number }>, x: number, y: number): number {
  if (!sun.length) return 0;
  let lit = 0;
  for (const s of sun) {
    const d = rayToEdge(pts, x, y, Math.sin(s.az), Math.cos(s.az));
    // The wall beyond the street, seen from here: lit when the sun stands higher than its top.
    if (!Number.isFinite(d) || Math.atan2(BUILDING_M, d + STREET_M) < s.alt) lit++;
  }
  return lit / sun.length;
}
