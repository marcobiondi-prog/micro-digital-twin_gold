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
    { id: "pergolato", label: "Vela ombreggiante", w: 4, d: 4, h: 3.2, zone: "ombra" },
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
export type PlacedObject = { uid: string; id: ArObjectId; x: number; z: number; yaw: number; def?: ArObjectDef; scale?: number; /** The objects joined into this one (Annulla brings them back). */ from?: PlacedObject[] };

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

/** The «Modellino» scales offered: 1:n, n one of these. */
const MODEL_RATIOS = [2, 4, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200];

/**
 * The «Modellino»'s scale fitted to the space round the phone: the largest object (its widest side, its height) must
 * fit in about half of the space seen ahead — ARCore's depth when the phone gives it (`span`, metres to walls and
 * furniture), else twice the distance to the spot on the floor — and stand lower than the phone above that floor.
 * Never above 1:2, rounded down to a plain ratio (1:5, 1:10, 1:20…). Returns the scale (1/n).
 */
export function modelScaleFor(o: { size: number; tall: number; dist: number; eyeH: number; span?: number | null }): number {
  const room = Math.max(0.6, Math.min(30, o.span && o.span > 0 ? o.span : Math.max(0.3, o.dist) * 2));
  const byRoom = (0.45 * room) / Math.max(0.1, o.size);
  const byHeight = (0.8 * Math.max(0.3, o.eyeH)) / Math.max(0.1, o.tall);
  const s = Math.min(0.5, byRoom, byHeight);
  const n = MODEL_RATIOS.find((r) => 1 / r <= s) ?? MODEL_RATIOS[MODEL_RATIOS.length - 1]!;
  return 1 / n;
}

/** The nearest placed object to a point on the floor, within reach of its footprint. */
export function nearestPlaced<T extends { x: number; z: number; reach: number }>(list: T[], p: { x: number; z: number }): T | null {
  let best: T | null = null, bd = Infinity;
  for (const o of list) {
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    if (d <= o.reach && d < bd) { bd = d; best = o; }
  }
  return best;
}

/**
 * Joining pergolas and aiuole by bringing them close (AR). A footprint on the floor in the AR frame: centre, size and
 * the turn of the mesh (rot = its rotation.y; local x goes to (cos rot, −sin rot), local z to (sin rot, cos rot)).
 */
export type Foot = { x: number; z: number; w: number; d: number; rot: number };
type P = { x: number; z: number };
/** Objects of these kinds join with one of the same kind when brought within JOIN_GAP. */
export const JOINABLE: ReadonlySet<ArObjectId> = new Set<ArObjectId>(["pergolato", "aiuola"]);
/** Within this gap (metres) they join; within NEAR_GAP the feedback starts. */
export const JOIN_GAP = 0.6;
export const NEAR_GAP = 2.5;

export function footCorners(f: Foot): P[] {
  const c = Math.cos(f.rot), s = Math.sin(f.rot), hw = f.w / 2, hd = f.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => ({ x: f.x + u! * c + v! * s, z: f.z - u! * s + v! * c }));
}
function inside(p: P, poly: P[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const cr = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (Math.abs(cr) < 1e-12) continue;
    const sg = Math.sign(cr);
    if (sign && sg !== sign) return false;
    sign = sg;
  }
  return true;
}
function segDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}
function cross(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
/** The free gap between two footprints on the floor, metres (0 when they touch or overlap). */
export function footGap(a: Foot, b: Foot): number {
  const A = footCorners(a), B = footCorners(b);
  if (A.some((p) => inside(p, B)) || B.some((p) => inside(p, A))) return 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const a0 = A[i]!, a1 = A[(i + 1) % 4]!, b0 = B[j]!, b1 = B[(j + 1) % 4]!;
    if (cross(a0, a1, b0, b1)) return 0;
    best = Math.min(best, segDist(a0, b0, b1), segDist(b0, a0, a1));
  }
  return best;
}
/** One footprint covering both, turned like the larger one. */
export function joinFeet(a: Foot, b: Foot): Foot {
  const rot = a.w * a.d >= b.w * b.d ? a.rot : b.rot;
  const c = Math.cos(rot), s = Math.sin(rot);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of [...footCorners(a), ...footCorners(b)]) {
    const u = p.x * c - p.z * s, v = p.x * s + p.z * c;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  return { x: um * c + vm * s, z: -um * s + vm * c, w: u1 - u0, d: v1 - v0, rot };
}
/**
 * The adaptive feedback while bringing one close to another: nothing past NEAR_GAP; then a tick that comes faster and
 * stronger as the gap closes (every 700 → 140 ms, 8 → 24 ms long) and a closeness 0…1 for the colour; joined within
 * JOIN_GAP.
 */
export function nearFeedback(gap: number): { stage: "far" | "near" | "join"; every: number; pulse: number; t: number } {
  if (gap <= JOIN_GAP) return { stage: "join", every: 0, pulse: 0, t: 1 };
  if (gap >= NEAR_GAP) return { stage: "far", every: 0, pulse: 0, t: 0 };
  const t = 1 - (gap - JOIN_GAP) / (NEAR_GAP - JOIN_GAP);
  return { stage: "near", every: Math.round(700 - 560 * t), pulse: Math.round(8 + 16 * t), t };
}

/**
 * Detents while turning an object by hand (AR): how many 15° steps the turn crossed going from one angle to the
 * other (degrees, relative to where the turn began), and whether one of them is a quarter turn — a light tick per
 * step, a firmer one on 90°, 180°, 270°.
 */
export function turnDetents(prevDeg: number, nextDeg: number, step = 15): { steps: number; quarter: boolean } {
  const a = Math.floor(prevDeg / step), b = Math.floor(nextDeg / step);
  if (a === b) return { steps: 0, quarter: false };
  const lo = Math.min(a, b) + 1, hi = Math.max(a, b);
  let quarter = false;
  for (let k = lo; k <= hi; k++) if ((k * step) % 90 === 0 && k !== 0) quarter = true;
  return { steps: hi - lo + 1, quarter };
}

/** The tick felt while dragging an object by hand, every half metre: longer for a heavier object (8–22 ms). */
export function dragTick(def: Pick<ArObjectDef, "w" | "d" | "h">): number {
  const v = Math.max(0.01, def.w * def.d * Math.max(0.2, def.h));
  return Math.round(Math.max(8, Math.min(22, 8 + 3.2 * Math.log10(v * 10))));
}

/**
 * Whether a joined pergola or aiuola (its footprint in AR metres) lies whole inside one zone of its own kind drawn on
 * the map — a Pergolato zone for pergolas, an Aiuole zone for aiuole —: two of them join only then. "noalign" when the
 * AR is not aligned with the map (so the zones cannot be found on the floor), "nozone" when the area has no zone of that
 * kind, "out" when the joined one would reach past every such zone.
 */
export type JoinFit = "fits" | "out" | "nozone" | "noalign";
export function joinFitsZone(u: Foot, zoneKind: ZoneKind, zones: readonly SubArea[] | undefined, a: Alignment | null, origin: { lat: number; lng: number } | null): JoinFit {
  if (!a || !origin) return "noalign";
  const own = (zones ?? []).filter((z) => z.kind === zoneKind && z.ring.length >= 3);
  if (!own.length) return "nozone";
  const pts = footCorners(u).map((p) => fromEN(arToEn(p, a), origin));
  return own.some((z) => pts.every(([lat, lng]) => insideRing(lat, lng, z.ring))) ? "fits" : "out";
}
