import { ringContains, type Ring } from "./place-area";

/**
 * What already stands in the drawn area, read from the open map data: existing trees, fountains and water, buildings
 * and kiosks, monuments and memorials. The piazza's interventions keep off them (area-layout piazzaLayout `real`), so
 * nothing new is put on top of a real tree, a fountain or a building.
 */
export type RealKind = "albero" | "fontana" | "edificio" | "monumento";
export type RealObject = { kind: RealKind; ring: Ring; name?: string };
/** Room kept round an object mapped as a single point (metres). */
export const POINT_RADIUS: Record<RealKind, number> = { albero: 3, fontana: 3.5, edificio: 3, monumento: 2 };
export const REAL_LABEL: Record<RealKind, [string, string]> = { albero: ["albero", "alberi"], fontana: ["fontana", "fontane"], edificio: ["edificio", "edifici"], monumento: ["monumento", "monumenti"] };

const bboxOf = (ring: Ring, padM = 6) => {
  const la = ring.map((p) => p[0]), ln = ring.map((p) => p[1]);
  const dLa = padM / 111_320, dLn = padM / (111_320 * Math.cos(((la[0] ?? 0) * Math.PI) / 180));
  return [Math.min(...la) - dLa, Math.min(...ln) - dLn, Math.max(...la) + dLa, Math.max(...ln) + dLn] as const;
};

/** One Overpass query for everything that stands in the area's box. */
export function realObjectsQuery(ring: Ring): string {
  const [s, w, n, e] = bboxOf(ring).map((v) => v.toFixed(6));
  const b = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:20];(node["natural"="tree"]${b};way["natural"="tree_row"]${b};nwr["amenity"="fountain"]${b};way["natural"="water"]${b};way["building"]${b};nwr["historic"~"^(monument|memorial)$"]${b};node["shop"="kiosk"]${b};);out geom 400;`;
}

type El = { type: string; lat?: number; lon?: number; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> };

const kindOf = (t: Record<string, string> = {}): RealKind | null =>
  t["natural"] === "tree" || t["natural"] === "tree_row" ? "albero"
    : t["amenity"] === "fountain" || t["natural"] === "water" ? "fontana"
    : t["historic"] === "monument" || t["historic"] === "memorial" ? "monumento"
    : t["building"] || t["shop"] === "kiosk" ? "edificio" : null;

/** A circle of `r` metres round a point, as a ring. */
export function circleRing(lat: number, lng: number, r: number, n = 12): Ring {
  const k = 111_320 * Math.cos((lat * Math.PI) / 180);
  return Array.from({ length: n }, (_, i) => [lat + (Math.sin((2 * Math.PI * i) / n) * r) / 111_320, lng + (Math.cos((2 * Math.PI * i) / n) * r) / k] as [number, number]);
}

/** The objects inside (or touching) the drawn area: points as circles, closed ways as their outline, tree rows as circles every 5 m. */
export function realObjectsFrom(elements: El[], area: Ring): RealObject[] {
  const touches = (r: Ring) => r.some(([a, b]) => ringContains(area, a, b)) || area.some(([a, b]) => ringContains(r, a, b));
  const out: RealObject[] = [];
  for (const el of elements) {
    const kind = kindOf(el.tags);
    if (!kind) continue;
    const name = el.tags?.["name"];
    if (el.type === "node" && el.lat != null && el.lon != null) {
      const r = circleRing(el.lat, el.lon, POINT_RADIUS[kind]);
      if (touches(r)) out.push({ kind, ring: r, ...(name ? { name } : {}) });
      continue;
    }
    const g = el.geometry ?? [];
    if (g.length < 2) continue;
    if (el.tags?.["natural"] === "tree_row") {
      // A row of trees: a crown every 5 m along it.
      for (let i = 0; i < g.length - 1; i++) {
        const a = g[i]!, b = g[i + 1]!, len = Math.hypot((b.lat - a.lat) * 111_320, (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
        for (let d = 0; d <= len; d += 5) { const t = len ? d / len : 0, r = circleRing(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t, POINT_RADIUS.albero); if (touches(r)) out.push({ kind, ring: r }); }
      }
      continue;
    }
    const ring = g.map((p) => [p.lat, p.lon] as [number, number]);
    if (ring.length >= 4 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]) ring.pop();
    if (ring.length >= 3 && touches(ring)) out.push({ kind, ring, ...(name ? { name } : {}) });
  }
  return out;
}

/** "3 alberi · 1 fontana", only the kinds there are. */
export function realCountText(objs: RealObject[]): string {
  const n = (k: RealKind) => objs.filter((o) => o.kind === k).length;
  return (["albero", "fontana", "monumento", "edificio"] as RealKind[]).filter((k) => n(k)).map((k) => `${n(k)} ${REAL_LABEL[k][n(k) === 1 ? 0 : 1]}`).join(" · ");
}
