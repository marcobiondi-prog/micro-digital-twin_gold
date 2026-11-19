import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { canopyReach, papillonUnits, type PapillonUnit } from "@/models/area-layout";

/**
 * Round shades on a leaning trunk over a round platform where one can stop and eat (after the side-pole shades the
 * user pointed to), for the AR view and the 3D maps, built in code: a low stone disc with a wooden deck, a round
 * bench along its edge and a round table in the middle; a slim round anthracite trunk tapering upwards rises from
 * a steel plate between the table and the bench, leaning so its top stands over the platform's middle, a satin
 * ring near its foot, a sleek hub with a small
 * finial on top and a warm LED ring under it, and a round canopy all round the pole — taut warm-white fabric sloping
 * gently down from the hub like a shallow dome (never a funnel), its edge cut in soft scallops between eight slim
 * round ribs and finished with a thin dark piping, each rib ending in a small satin cap. In a w×d rectangle centred
 * on 0 the poles stand in the middle of their cells (models/area-layout papillonUnits). `open` (0–1) is how far the
 * canopy is spread (motorised: open in the day's heat, closed at dusk, at night and in winter): it folds down
 * towards the pole, and closed it is a slim furled sleeve. Stands on y = 0; h is the hub's height.
 */

const RIBS = 8;          // ribs round the canopy
const SCALLOP = 0.07;    // the edge cut in between two ribs, share of the reach
const DROP = 0.16;       // the canopy's fall from hub to edge, share of the radius (a shallow dome)

type Mats = { pole: THREE.Material; satin: THREE.Material; wood: THREE.Material; stone: THREE.Material; fabric: THREE.Material; trim: THREE.Material; led: THREE.Material; shadow: THREE.Material };

function tube(points: THREE.Vector3[], r: number, radial = 6, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 2), r, radial, closed);
}

/** The canopy as one smooth surface round the hub: a shallow dome, scalloped between the ribs, dipping a little between them. */
function canopy(hub: THREE.Vector3, reach: number, drop: number) {
  const segA = RIBS * 8, segT = 10;
  const point = (k: number, t: number) => {
    const a = (2 * Math.PI * k) / segA;
    const f = ((k / segA) * RIBS) % 1;                       // where between two ribs
    const cut = Math.sin(Math.PI * f) ** 2;
    const rr = reach * (1 - SCALLOP * cut) * t;
    // Convex from above: flat near the hub, curving down towards the edge.
    return new THREE.Vector3(hub.x + Math.sin(a) * rr, hub.y - drop * t * t - 0.05 * cut * t, hub.z + Math.cos(a) * rr);
  };
  const pos: number[] = [], idx: number[] = [];
  for (let k = 0; k <= segA; k++) for (let j = 0; j <= segT; j++) { const p = point(k, j / segT); pos.push(p.x, p.y, p.z); }
  for (let k = 0; k < segA; k++) for (let j = 0; j < segT; j++) {
    const a = k * (segT + 1) + j, b = a + 1, c = a + segT + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ribs: THREE.Vector3[][] = [];
  for (let i = 0; i < RIBS; i++) {
    const line: THREE.Vector3[] = [];
    for (let j = 1; j <= segT; j++) { const p = point(i * 8, j / segT); p.y -= 0.018; line.push(p); }
    ribs.push(line);
  }
  const edge: THREE.Vector3[] = [];
  for (let k = 0; k < segA; k++) edge.push(point(k, 1));
  return { geo, ribs, edge };
}

/** A round rod (tapering r0 → r1) from a to b. */
function rodBetween(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, radial = 20): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial);
  geo.translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  geo.translate(a.x, a.y, a.z);
  return geo;
}

/** A solid ring (bench seat, table rim) between radii ri and ro, from y0 to y1. */
function ringSolid(x: number, z: number, ri: number, ro: number, y0: number, y1: number, seg = 48): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(ri, y0), new THREE.Vector2(ro, y0), new THREE.Vector2(ro, y1), new THREE.Vector2(ri, y1), new THREE.Vector2(ri, y0)];
  const geo = new THREE.LatheGeometry(pts, seg);
  geo.translate(x, 0, z);
  return geo;
}

/** The round seating platform under a canopy: radius for a canopy of reach r. */
export function platformRadius(r: number): number {
  return Math.max(1.1, Math.min(1.7, r * 0.55));
}

type Put = (m: THREE.Material, g: THREE.BufferGeometry) => void;

/** The unit's fixed parts (platform, table, bench, trunk, hub); returns what draws its canopy at a given openness. */
function unit(u: PapillonUnit, h: number, mats: Mats, out: THREE.Group, put: Put): (open: number, put: Put) => void {
  const H = h, x = u.x, z = u.z;
  // The round platform where one can stop and eat: a low stone disc with a wooden deck, a round bench along its
  // edge on slim legs and a round table in the middle on one pedestal.
  const rp = platformRadius(u.r);
  put(mats.stone, (() => { const g = new THREE.CylinderGeometry(rp + 0.06, rp + 0.1, 0.08, 48); g.translate(x, 0.04, z); return g; })());
  put(mats.wood, (() => { const g = new THREE.CylinderGeometry(rp, rp, 0.03, 48); g.translate(x, 0.095, z); return g; })());
  const bi = rp - 0.48, bo = rp - 0.08;
  put(mats.wood, ringSolid(x, z, bi, bo, 0.43, 0.48));
  for (let k = 0; k < 10; k++) {
    const a = (2 * Math.PI * k) / 10, rr = (bi + bo) / 2;
    const leg = new THREE.BoxGeometry(0.035, 0.33, 0.2); leg.rotateY(a); leg.translate(x + Math.sin(a) * rr, 0.11 + 0.165, z + Math.cos(a) * rr);
    put(mats.pole, leg);
  }
  const tableR = Math.max(0.45, Math.min(0.6, bi - 0.5));
  put(mats.wood, (() => { const g = new THREE.CylinderGeometry(tableR, tableR, 0.04, 40); g.translate(x, 0.74, z); return g; })());
  put(mats.satin, ringSolid(x, z, tableR - 0.005, tableR + 0.006, 0.718, 0.762));
  put(mats.pole, (() => { const g = new THREE.CylinderGeometry(0.045, 0.055, 0.62, 16); g.translate(x, 0.41, z); return g; })());
  put(mats.pole, (() => { const g = new THREE.CylinderGeometry(0.26, 0.28, 0.02, 32); g.translate(x, 0.12, z); return g; })());
  // The trunk: from a foot between the table and the bench it leans so the canopy stands over the platform's middle.
  const footR = Math.max(tableR + 0.25, bi - 0.14), fa = u.yaw + Math.PI;
  const foot = new THREE.Vector3(x + Math.sin(fa) * footR, 0.11, z + Math.cos(fa) * footR);
  const hubY = H + 0.035;
  const top = new THREE.Vector3(x, hubY - 0.06, z);
  put(mats.pole, rodBetween(foot, top, 0.07, 0.048));
  const plate = new THREE.CylinderGeometry(0.15, 0.16, 0.025, 24); plate.translate(foot.x, 0.123, foot.z); put(mats.pole, plate);
  const ring = new THREE.CylinderGeometry(0.075, 0.075, 0.045, 24);
  ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize()));
  const ringAt = foot.clone().lerp(top, 0.09); ring.translate(ringAt.x, ringAt.y, ringAt.z); put(mats.satin, ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(rp + 0.35, 40), mats.shadow); disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.004, z); out.add(disc);
  const along = (yy: number) => foot.clone().lerp(top, (yy - foot.y) / (top.y - foot.y));
  const hub = new THREE.CylinderGeometry(0.075, 0.09, 0.12, 24); hub.translate(x, hubY, z); put(mats.pole, hub);
  const finial = new THREE.SphereGeometry(0.045, 16, 10); finial.translate(x, hubY + 0.09, z); put(mats.satin, finial);
  return (open: number, put: Put) => {
    const o = Math.max(0, Math.min(1, open));
    if (o < 0.08) {
      // Closed: the canopy furled into a slim sleeve round the top of the trunk, a satin band holding it.
      const len = Math.max(0.6, Math.min(1.5, u.r * 0.5));
      const lo = along(hubY - len);
      put(mats.fabric, rodBetween(lo, top.clone().setY(hubY), 0.15, 0.07, 16));
      const band = along(hubY - len * 0.55);
      const b = new THREE.SphereGeometry(0.13, 16, 8); b.scale(1, 0.18, 1); b.translate(band.x, band.y, band.z); put(mats.satin, b);
      return;
    }
    // Open: the hub with its finial and LED ring, the canopy, its ribs with caps and the piping round the edge.
    const reach = canopyReach(u.r, o);
    const drop = DROP * u.r + (1 - o) * 0.55 * u.r;          // folding down towards the trunk as it closes
    const led = new THREE.TorusGeometry(0.11, 0.012, 8, 32); led.rotateX(Math.PI / 2); led.translate(x, hubY - 0.08, z); put(mats.led, led);
    const fabricHub = new THREE.Vector3(x, hubY + 0.05, z);
    const c = canopy(fabricHub, reach, drop);
    put(mats.fabric, c.geo);
    const strutFrom = along(hubY - 0.55 - (1 - o) * 0.3);
    for (const line of c.ribs) {
      put(mats.pole, tube([fabricHub.clone().setY(fabricHub.y - 0.03), ...line], 0.011, 5));
      const tip = line[line.length - 1]!;
      const cap = new THREE.SphereGeometry(0.02, 10, 6); cap.translate(tip.x, tip.y, tip.z); put(mats.satin, cap);
      // A slim strut from the trunk to the rib's middle, as a real canopy is held.
      put(mats.pole, tube([strutFrom, line[Math.floor(line.length * 0.45)]!], 0.008, 4));
    }
    put(mats.trim, tube(c.edge, 0.009, 4, true));
  };
}

const MERGE = (bins: Map<THREE.Material, THREE.BufferGeometry[]>, into: THREE.Group) => {
  for (const [mat, list] of bins) {
    const merged = mergeGeometries(list, false);
    if (merged) into.add(new THREE.Mesh(merged, mat));
  }
};
function binner(bins: Map<THREE.Material, THREE.BufferGeometry[]>): Put {
  return (m, g) => {
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const n = g.index ? g.toNonIndexed() : g;
    const c = new THREE.BufferGeometry();
    c.setAttribute("position", n.getAttribute("position"));
    c.setAttribute("normal", n.getAttribute("normal"));
    const l = bins.get(m) ?? []; l.push(c); bins.set(m, l);
  };
}

/** How fast the canopy moves when it opens or closes by itself: the whole way in about 4 s. */
const TRAVEL_S = 4;

type PapillonState = { open: number; built: number; target: number; build: (o: number) => void; onFrame?: (() => void) | undefined; last: number };

export function realPapillons(def: { w: number; d: number; h?: number; open?: number }): THREE.Group {
  const out = new THREE.Group();
  const mats: Mats = {
    pole: new THREE.MeshStandardMaterial({ color: "#2b2f34", roughness: 0.42, metalness: 0.55 }),
    satin: new THREE.MeshStandardMaterial({ color: "#c9ced3", roughness: 0.28, metalness: 0.85 }),
    wood: new THREE.MeshStandardMaterial({ color: "#a8784c", roughness: 0.62 }),
    stone: new THREE.MeshStandardMaterial({ color: "#cfc8bb", roughness: 0.9 }),
    // emissive: daylight showing through the fabric from below.
    fabric: new THREE.MeshStandardMaterial({ color: "#f4efe6", emissive: "#8f8778", emissiveIntensity: 0.6, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: "#3a3d42", roughness: 0.6 }),
    led: new THREE.MeshStandardMaterial({ color: "#fff3d6", emissive: "#ffd39a", emissiveIntensity: 1.1, roughness: 0.4 }),
    shadow: new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.28, depthWrite: false }),
  };
  const fixed = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const canopies = papillonUnits(Math.max(1, def.w), Math.max(1, def.d)).map((u) => unit(u, def.h ?? 3.2, mats, out, binner(fixed)));
  MERGE(fixed, out);
  // The canopies in a group of their own, drawn again when the openness changes (opening or closing by itself).
  const canopy = new THREE.Group();
  canopy.name = "papillon-canopy";
  out.add(canopy);
  const build = (o: number) => {
    for (const c of [...canopy.children]) { canopy.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = binner(bins);
    for (const draw of canopies) draw(o, put);
    MERGE(bins, canopy);
    // Shadows as the fixed parts were set to cast them (castShadows runs after the model is built).
    const cast = out.children.some((c) => c !== canopy && (c as THREE.Mesh).isMesh && c.castShadow && !((c as THREE.Mesh).material as THREE.Material).transparent);
    for (const c of canopy.children) c.castShadow = cast;
  };
  const start = Math.max(0, Math.min(1, def.open ?? 1));
  build(start);
  const state: PapillonState = { open: start, built: start, target: start, build, last: 0 };
  out.userData["papillon"] = state;
  // The animation steps itself whenever the model is drawn (the first fixed mesh's onBeforeRender), so any scene that
  // renders it — the AR view, the map's 3D — shows the canopy opening or closing without a loop of its own.
  const driver = out.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
  if (driver) driver.onBeforeRender = () => stepPapillon(state);
  return out;
}

function stepPapillon(s: PapillonState) {
  const now = performance.now();
  const dt = s.last ? Math.min(0.1, (now - s.last) / 1000) : 0;
  s.last = now;
  if (s.open === s.target) return;
  const step = dt / TRAVEL_S;
  s.open = s.open < s.target ? Math.min(s.target, s.open + step) : Math.max(s.target, s.open - step);
  if (Math.abs(s.open - s.built) >= 0.025 || s.open === s.target) { s.build(s.open); s.built = s.open; }
  s.onFrame?.();
}

/**
 * Makes every canopy under `root` open or close by itself towards `target` (0 closed – 1 open), moving smoothly
 * (about 4 s the whole way). onFrame is called at each step (the map's 3D asks for a repaint there).
 * Returns how many canopies will move.
 */
export function setShadeTarget(root: THREE.Object3D, target: number, onFrame?: () => void): number {
  let n = 0;
  const t = Math.max(0, Math.min(1, target));
  root.traverse((o) => {
    const s = o.userData?.["papillon"] as PapillonState | undefined;
    if (!s) return;
    if (Math.abs(s.target - t) > 1e-3 || Math.abs(s.open - t) > 1e-3) n++;
    s.target = t; s.onFrame = onFrame; s.last = 0;
    onFrame?.();
  });
  return n;
}

/** The canopies' openness under the real sun now over (lat, lng): open from 15° of sun, closed under 5° and in winter. */
export function realShadeOpen(lat: number, lng: number, date = new Date()): number {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const decl = 23.44 * rad * Math.sin(((2 * Math.PI) / 365) * (284 + day));
  const solar = date.getUTCHours() + date.getUTCMinutes() / 60 + lng / 15;
  const h = 15 * (solar - 12) * rad, phi = lat * rad;
  const sun = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(h)) / rad;
  const m = date.getMonth();
  const winter = lat >= 0 ? m === 11 || m <= 1 : m >= 5 && m <= 7;
  return winter ? 0 : Math.max(0, Math.min(1, (sun - 5) / 10));
}
