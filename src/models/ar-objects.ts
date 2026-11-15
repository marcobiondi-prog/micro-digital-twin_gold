import type { ArKind } from "@/models/ar-focus";
import type { SubArea, ZoneKind } from "@/models/drawn-area";
import type { Ring } from "@/models/place-area";

/**
 * What «Prova» can put in the real world, at real size (metres): the piazza's tree, pergola, flower bed and misting
 * pole, the vineyard's shade cloth, windbreak and drip line. Each one also says which zone of the simulation it becomes
 * when it is brought back to the map («Riporta sulla mappa»).
 */
export type ArObjectId = "albero" | "pergolato" | "aiuola" | "nebulizzatore" | "telo" | "frangivento" | "irrigazione";
export type ArObjectDef = {
  id: ArObjectId;
  label: string;
  /** Footprint on the ground: width (x) and depth (z), metres. */
  w: number;
  d: number;
  /** Height, metres. */
  h: number;
  zone: ZoneKind;
};

export const AR_OBJECTS: Record<ArKind, readonly ArObjectDef[]> = {
  urban: [
    { id: "albero", label: "Albero", w: 6.2, d: 6.2, h: 9, zone: "alberi" },
    { id: "pergolato", label: "Pergolato", w: 4, d: 4, h: 3.2, zone: "ombra" },
    { id: "aiuola", label: "Aiuola", w: 3, d: 1.2, h: 0.25, zone: "prato" },
    { id: "nebulizzatore", label: "Nebulizzatore", w: 0.3, d: 0.3, h: 3, zone: "nebulizzatori" },
  ],
  vineyard: [
    { id: "telo", label: "Telo d’ombra", w: 4, d: 2, h: 2.2, zone: "teli" },
    { id: "frangivento", label: "Frangivento", w: 4, d: 1.6, h: 3, zone: "frangivento" },
    { id: "irrigazione", label: "Irrigazione", w: 6, d: 0.4, h: 0.1, zone: "irrigazione" },
  ],
};
export const arObject = (kind: ArKind, id: ArObjectId) => AR_OBJECTS[kind].find((o) => o.id === id) ?? AR_OBJECTS[kind][0]!;

/** One object put in the AR scene: where on the floor (AR metres, x east-ish, z towards the viewer) and turned by yaw (rad). */
export type PlacedObject = { uid: string; id: ArObjectId; x: number; z: number; yaw: number };

/** A point on the floor in a local metre frame: e = east, n = north. */
export type EN = { e: number; n: number };

/** Lat/lng → metres east/north of an origin (equirectangular: plenty for a piazza). */
export function toEN(lat: number, lng: number, o: { lat: number; lng: number }): EN {
  return { e: (lng - o.lng) * 111_320 * Math.cos((o.lat * Math.PI) / 180), n: (lat - o.lat) * 111_320 };
}
export function fromEN(p: EN, o: { lat: number; lng: number }): [number, number] {
  return [o.lat + p.n / 111_320, o.lng + p.e / (111_320 * Math.cos((o.lat * Math.PI) / 180))];
}

/**
 * The alignment between the AR floor and the map: AR uses x/z metres (WebXR: −z is where the phone looked at start),
 * the map east/north metres. Found from two points known in both (two corners of the drawn area touched on the real
 * floor): a rotation about the vertical axis plus a shift, no scale (both are metres).
 */
export type Alignment = { theta: number; tx: number; tz: number };

/** AR (x, z) of a map point (e, n): rotate the map's (e, −n) by theta, then shift. */
export function enToAr(p: EN, a: Alignment): { x: number; z: number } {
  const c = Math.cos(a.theta), s = Math.sin(a.theta);
  const x0 = p.e, z0 = -p.n;
  return { x: c * x0 - s * z0 + a.tx, z: s * x0 + c * z0 + a.tz };
}
export function arToEn(q: { x: number; z: number }, a: Alignment): EN {
  const c = Math.cos(a.theta), s = Math.sin(a.theta);
  const dx = q.x - a.tx, dz = q.z - a.tz;
  const x0 = c * dx + s * dz, z0 = -s * dx + c * dz;
  return { e: x0, n: -z0 };
}
/** The alignment that puts map points A and B on AR points a and b (the direction A→B wins; the length is kept). */
export function alignTwoPoints(A: EN, B: EN, a: { x: number; z: number }, b: { x: number; z: number }): Alignment {
  const mapAng = Math.atan2(-(B.n - A.n), B.e - A.e);
  const arAng = Math.atan2(b.z - a.z, b.x - a.x);
  const theta = arAng - mapAng;
  const c = Math.cos(theta), s = Math.sin(theta);
  const x0 = A.e, z0 = -A.n;
  return { theta, tx: a.x - (c * x0 - s * z0), tz: a.z - (s * x0 + c * z0) };
}
/**
 * Without the two corners: the alignment from the phone's own fix at the start of the session (its GPS position, its
 * compass heading): the session's origin sits on the fix, −z points along the heading. Metres of error from the GPS.
 */
export function alignFromFix(fixEN: EN, headingDeg: number): Alignment {
  // At the origin the phone looks along −z; the heading is clockwise from north. Map direction (e, n) of the heading
  // must become (0, −1) in AR.
  const h = (headingDeg * Math.PI) / 180;
  const theta = Math.atan2(-1, 0) - Math.atan2(-Math.cos(h), Math.sin(h));
  const c = Math.cos(theta), s = Math.sin(theta);
  const x0 = fixEN.e, z0 = -fixEN.n;
  return { theta, tx: -(c * x0 - s * z0), tz: -(s * x0 + c * z0) };
}

/** Distance between two AR floor points, metres. */
export const arDistance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export const metresText = (m: number) => `${m.toLocaleString("it-IT", { maximumFractionDigits: m < 10 ? 2 : 1, minimumFractionDigits: m < 10 ? 2 : 1 })} m`;

/** The footprint of a placed object on the map (lat/lng ring), through the alignment. */
export function footprintRing(o: PlacedObject, def: ArObjectDef, a: Alignment, origin: { lat: number; lng: number }): Ring {
  const hw = Math.max(def.w, 1) / 2, hd = Math.max(def.d, 1) / 2, c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => {
    const q = { x: o.x + c * u! - s * v!, z: o.z + s * u! + c * v! };
    return fromEN(arToEn(q, a), origin);
  });
}

/** «Riporta sulla mappa»: every placed object becomes a zone of its kind inside the area, as drawn by hand. */
export function objectsToZones(kind: ArKind, objs: readonly PlacedObject[], a: Alignment, origin: { lat: number; lng: number }, now = Date.now()): SubArea[] {
  return objs.map((o, i) => {
    const def = arObject(kind, o.id);
    return { id: `ar-${now.toString(36)}-${i}`, kind: def.zone, ring: footprintRing(o, def, a, origin) };
  });
}

/** Is a lat/lng point inside a ring (ray casting)? */
export function insideRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ai, bi] = ring[i]!, [aj, bj] = ring[j]!;
    if ((bi > lng) !== (bj > lng) && lat < ((aj - ai) * (lng - bi)) / (bj - bi) + ai) inside = !inside;
  }
  return inside;
}
/** The zones whose middle falls inside the drawn area, and how many were left out. */
export function zonesInside(zones: SubArea[], area: Ring): { kept: SubArea[]; out: number } {
  const kept = zones.filter((z) => {
    const lat = z.ring.reduce((s, p) => s + p[0], 0) / z.ring.length, lng = z.ring.reduce((s, p) => s + p[1], 0) / z.ring.length;
    return insideRing(lat, lng, area);
  });
  return { kept, out: zones.length - kept.length };
}
