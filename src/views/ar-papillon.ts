import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { canopyReach, papillonUnits, type PapillonUnit } from "@/models/area-layout";

/**
 * Round shades on a central pole for the AR view and the 3D maps, built in code with a designer's look: a slim round
 * anthracite pole tapering upwards on a flat round base, a thin satin ring near its foot, a sleek hub with a small
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

type Mats = { pole: THREE.Material; satin: THREE.Material; fabric: THREE.Material; trim: THREE.Material; led: THREE.Material; shadow: THREE.Material };

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

function unit(u: PapillonUnit, h: number, open: number, mats: Mats, out: THREE.Group, put: (m: THREE.Material, g: THREE.BufferGeometry) => void) {
  const H = h, x = u.x, z = u.z;
  // Base: a flat round plate; the pole, round and tapering upwards, with a satin ring near its foot.
  const base = new THREE.CylinderGeometry(0.26, 0.28, 0.035, 32); base.translate(x, 0.0175, z); put(mats.pole, base);
  const pole = new THREE.CylinderGeometry(0.045, 0.065, H, 24); pole.translate(x, H / 2 + 0.035, z); put(mats.pole, pole);
  const ring = new THREE.CylinderGeometry(0.068, 0.068, 0.04, 24); ring.translate(x, 0.3, z); put(mats.satin, ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28), mats.shadow); disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.004, z); out.add(disc);
  const hubY = H + 0.035;
  const o = Math.max(0, Math.min(1, open));
  if (o < 0.08) {
    // Closed: the canopy furled into a slim sleeve round the top of the pole, a satin band holding it.
    const len = Math.max(0.6, u.r * 0.9);
    const sleeve = new THREE.CylinderGeometry(0.07, 0.15, len, 16); sleeve.translate(x, hubY - len / 2, z); put(mats.fabric, sleeve);
    const band = new THREE.CylinderGeometry(0.12, 0.12, 0.035, 16); band.translate(x, hubY - len * 0.55, z); put(mats.satin, band);
    const top = new THREE.SphereGeometry(0.05, 12, 8); top.translate(x, hubY + 0.04, z); put(mats.satin, top);
    return;
  }
  // Open: the hub with its finial and LED ring, the canopy, its ribs with caps and the piping round the edge.
  const reach = canopyReach(u.r, o);
  const drop = DROP * u.r + (1 - o) * 0.55 * u.r;          // folding down towards the pole as it closes
  const hub = new THREE.CylinderGeometry(0.075, 0.09, 0.12, 24); hub.translate(x, hubY, z); put(mats.pole, hub);
  const finial = new THREE.SphereGeometry(0.045, 16, 10); finial.translate(x, hubY + 0.09, z); put(mats.satin, finial);
  const led = new THREE.TorusGeometry(0.11, 0.012, 8, 32); led.rotateX(Math.PI / 2); led.translate(x, hubY - 0.08, z); put(mats.led, led);
  const fabricHub = new THREE.Vector3(x, hubY + 0.05, z);
  const c = canopy(fabricHub, reach, drop);
  put(mats.fabric, c.geo);
  for (const line of c.ribs) {
    put(mats.pole, tube([fabricHub.clone().setY(fabricHub.y - 0.03), ...line], 0.011, 5));
    const tip = line[line.length - 1]!;
    const cap = new THREE.SphereGeometry(0.02, 10, 6); cap.translate(tip.x, tip.y, tip.z); put(mats.satin, cap);
    // A slim strut from the pole to the rib's middle, as a real canopy is held.
    const mid = line[Math.floor(line.length * 0.45)]!;
    put(mats.pole, tube([new THREE.Vector3(x, hubY - 0.55 - (1 - o) * 0.3, z), mid], 0.008, 4));
  }
  put(mats.trim, tube(c.edge, 0.009, 4, true));
}

export function realPapillons(def: { w: number; d: number; h?: number; open?: number }): THREE.Group {
  const out = new THREE.Group();
  const mats: Mats = {
    pole: new THREE.MeshStandardMaterial({ color: "#2b2f34", roughness: 0.42, metalness: 0.55 }),
    satin: new THREE.MeshStandardMaterial({ color: "#c9ced3", roughness: 0.28, metalness: 0.85 }),
    // emissive: daylight showing through the fabric from below.
    fabric: new THREE.MeshStandardMaterial({ color: "#f4efe6", emissive: "#8f8778", emissiveIntensity: 0.6, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: "#3a3d42", roughness: 0.6 }),
    led: new THREE.MeshStandardMaterial({ color: "#fff3d6", emissive: "#ffd39a", emissiveIntensity: 1.1, roughness: 0.4 }),
    shadow: new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.28, depthWrite: false }),
  };
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const n = g.index ? g.toNonIndexed() : g;
    const c = new THREE.BufferGeometry();
    c.setAttribute("position", n.getAttribute("position"));
    c.setAttribute("normal", n.getAttribute("normal"));
    const l = bins.get(m) ?? []; l.push(c); bins.set(m, l);
  };
  for (const u of papillonUnits(Math.max(1, def.w), Math.max(1, def.d))) unit(u, def.h ?? 3.2, def.open ?? 1, mats, out, put);
  for (const [mat, list] of bins) {
    const merged = mergeGeometries(list, false);
    if (merged) out.add(new THREE.Mesh(merged, mat));
  }
  return out;
}
