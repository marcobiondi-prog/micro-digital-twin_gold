import type { ArKind } from "@/models/ar-focus";
import type { SubArea, ZoneKind } from "@/models/drawn-area";
import type { Ring } from "@/models/place-area";
import type { PlantForm, ScanSpecies } from "@/models/ar-scan-log";
import type { Specimen } from "@/models/plant-shape";

/**
 * What «Prova» can put in the real world, at real size (metres): the piazza's tree, pergola, flower bed and misting
 * pole and sprinkler, the vineyard's shade cloth, windbreak and drip line. Each one also says which zone of the simulation it becomes
 * when it is brought back to the map («Riporta sulla mappa»).
 */
export type ArObjectId = "albero" | "pergolato" | "aiuola" | "nebulizzatore" | "innaffiatoio" | "telo" | "frangivento" | "irrigazione" | "pianta";
export type ArObjectDef = {
  id: ArObjectId;
  label: string;
  /** Footprint on the ground: width (x) and depth (z), metres. */
  w: number;
  d: number;
  /** Height, metres. */
  h: number;
  zone: ZoneKind;
  /** A plant recognised by «Rileva»: its shape and leaves, drawn like the species (id "pianta"). */
  plant?: { form: PlantForm; evergreen: boolean; scientificName: string; specimen?: Specimen | null };
};

export const AR_OBJECTS: Record<ArKind, readonly ArObjectDef[]> = {
  urban: [
    { id: "albero", label: "Albero", w: 6.2, d: 6.2, h: 9, zone: "alberi" },
    { id: "pergolato", label: "Pergolato", w: 4, d: 4, h: 3.2, zone: "ombra" },
    { id: "aiuola", label: "Aiuola", w: 3, d: 1.2, h: 0.25, zone: "prato" },
    { id: "nebulizzatore", label: "Nebulizzatore", w: 0.3, d: 0.3, h: 3, zone: "nebulizzatori" },
    // A pop-up sprinkler: its footprint is the circle it waters (3 m round), brought back as green, permeable ground.
    { id: "innaffiatoio", label: "Innaffiatoio", w: 6, d: 6, h: 0.15, zone: "prato" },
  ],
  vineyard: [
    { id: "telo", label: "Telo d’ombra", w: 4, d: 2, h: 2.2, zone: "teli" },
    { id: "frangivento", label: "Frangivento", w: 4, d: 1.6, h: 3, zone: "frangivento" },
    { id: "irrigazione", label: "Irrigazione", w: 6, d: 0.4, h: 0.1, zone: "irrigazione" },
  ],
};
export const arObject = (kind: ArKind, id: ArObjectId) => AR_OBJECTS[kind].find((o) => o.id === id) ?? AR_OBJECTS[kind][0]!;

/** One object put in the AR scene: where on the floor (AR metres, x east-ish, z towards the viewer) and turned by yaw (rad). */
/** scale: the size the person gave it with two fingers (1 = real size). */
export type PlacedObject = { uid: string; id: ArObjectId; x: number; z: number; yaw: number; def?: ArObjectDef; scale?: number };

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
    const base = o.def ?? arObject(kind, o.id), k = o.scale ?? 1;
    const def = k === 1 ? base : { ...base, w: base.w * k, d: base.d * k, h: base.h * k };
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

/**
 * «Regola pavimento» in the preview without ARCore: the floor is guessed from the phone's tilt, so the person drags a
 * line onto the photo's horizon. Where the horizon falls on screen (0 top … 1 bottom) for a camera pitched by `pitchDeg`
 * (negative = looking down) with a vertical field of view `fovDeg`, and the pitch that puts it at `ny`.
 */
export function horizonAt(pitchDeg: number, fovDeg: number): number {
  return 0.5 + (0.5 * Math.tan((pitchDeg * Math.PI) / 180)) / Math.tan((fovDeg * Math.PI) / 360);
}
export function pitchForHorizon(ny: number, fovDeg: number): number {
  return (Math.atan((ny - 0.5) * 2 * Math.tan((fovDeg * Math.PI) / 360)) * 180) / Math.PI;
}

/**
 * The plant «Rileva» recognised, as an object «Prova» can put at real size: its own shape (a cone for a fir, a column
 * for a cypress, a round crown for a holm oak, an umbrella for a stone pine, a bush, a vine row), height and crown from
 * the species' typical sizes, kept within sane bounds; null for an older record without them. A shrub or vine becomes
 * the matching zone (aiuole in the piazza, irrigation in the vineyard is not a plant: vines stay trees' zone there).
 */
export function plantObject(kind: ArKind, sp: ScanSpecies): ArObjectDef | null {
  if (!sp.form || !Number.isFinite(sp.heightM) || !Number.isFinite(sp.crownM)) return null;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const h = clamp(sp.heightM!, 0.4, 40);
  const vine = sp.form === "vine";
  const crown = vine ? clamp(sp.crownM!, 0.6, 1.2) : clamp(sp.crownM!, 0.4, 25);
  const zone: ZoneKind = kind === "vineyard" ? (vine ? "lotto" : "frangivento") : sp.form === "shrub" ? "prato" : "alberi";
  return {
    id: "pianta", label: sp.commonName, w: vine ? 4 : crown, d: crown, h: vine ? clamp(h, 1.2, 2.2) : h, zone,
    plant: { form: sp.form, evergreen: sp.evergreen ?? true, scientificName: sp.scientificName, specimen: sp.specimen ?? null },
  };
}
/** The species recognised in a flow's scans, once each, newest first (at most `max`). */
export function recognisedPlants(kind: ArKind, species: ReadonlyArray<ScanSpecies | null>, max = 6): ArObjectDef[] {
  const seen = new Set<string>(), out: ArObjectDef[] = [];
  for (let i = species.length - 1; i >= 0 && out.length < max; i--) {
    const sp = species[i];
    if (!sp || seen.has(sp.scientificName)) continue;
    const def = plantObject(kind, sp);
    if (def) { seen.add(sp.scientificName); out.push(def); }
  }
  return out;
}

/**
 * The vibration when an object is put on the floor follows its weight: its bulk (footprint × height) on a log scale,
 * from a light tick for a misting pole to a firm double thud for a big tree.
 */
export function placeHaptic(def: Pick<ArObjectDef, "w" | "d" | "h">): number[] {
  const bulk = Math.max(0, def.w * def.d * def.h);
  const k = Math.max(0, Math.min(1, Math.log10(bulk + 1) / Math.log10(500)));
  const first = Math.round(18 + 52 * k);
  return k > 0.55 ? [first, 45, Math.round(30 + 70 * k)] : [first];
}
