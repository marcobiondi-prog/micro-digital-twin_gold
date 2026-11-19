import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { papillonUnits, type PapillonUnit } from "@/models/area-layout";

/**
 * Shade sails on a side pole whose two fabric wings open horizontally like a butterfly's, for the AR view and the 3D
 * maps, built in code with a designer's look: a slim round anthracite pole tapering upwards on a flat round base, a
 * thin satin ring near its foot, a sleek capsule head, a slender tapered arm with a warm LED line under it, and two
 * wings of taut warm-white fabric that rise gently towards their tips like a gull's wing, their outer edge cut in a
 * soft scallop between the slim round ribs and finished with a thin dark piping, each rib ending in a small cap.
 * In a w×d rectangle centred on 0 the poles stand on one long edge (models/area-layout papillonUnits). `open` (0–1)
 * is how far the wings are spread (motorised: open in the day's heat, closed at dusk, at night and in winter);
 * closed, the fabric is a slim sleeve along the arm. Stands on y = 0; h is the fabric's height at the pole.
 */

const RIBS = 5;          // ribs a wing
const SCALLOP = 0.09;    // the edge cut in between two ribs, share of the reach
const LIFT = 0.13;       // the wing's rise at its tip, share of the reach

type Mats = { pole: THREE.Material; satin: THREE.Material; fabric: THREE.Material; trim: THREE.Material; led: THREE.Material; shadow: THREE.Material };

function tube(points: THREE.Vector3[], r: number, radial = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 2), r, radial, false);
}

/** A tapered slab between two points (the arm). */
function beam(a: THREE.Vector3, b: THREE.Vector3, w0: number, w1: number, h: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(w1 / 2, w0 / 2, len, 10, 1);
  geo.scale(1, 1, h / ((w0 + w1) / 2));
  geo.rotateX(Math.PI / 2);
  geo.applyMatrix4(new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0)));
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geo;
}

/** One wing as a smooth surface: rises towards the tip, scalloped between the ribs, dipping a little between them. */
function wing(head: THREE.Vector3, yaw: number, side: number, half: number, r: number) {
  const segA = RIBS * 6, segT = 9;
  const point = (k: number, t: number) => {
    const a = yaw + side * (half * k) / segA;
    const f = ((k / segA) * RIBS) % 1;                       // where between two ribs
    const cut = Math.sin(Math.PI * f) ** 2;           // soft scallops, rounded at the rib tips
    const reach = r * (1 - SCALLOP * cut) * t;
    return new THREE.Vector3(
      head.x + Math.sin(a) * reach,
      head.y + LIFT * r * Math.pow(t, 1.5) - 0.045 * cut * t,
      head.z + Math.cos(a) * reach,
    );
  };
  const pos: number[] = [], idx: number[] = [];
  for (let k = 0; k <= segA; k++) for (let j = 0; j <= segT; j++) { const p = point(k, j / segT); pos.push(p.x, p.y, p.z); }
  for (let k = 0; k < segA; k++) for (let j = 0; j < segT; j++) {
    const a = k * (segT + 1) + j, b = a + 1, c = a + segT + 1, d = c + 1;
    if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ribs: THREE.Vector3[][] = [];
  for (let i = 1; i <= RIBS; i++) {
    const k = i * 6, line: THREE.Vector3[] = [];
    for (let j = 1; j <= segT; j++) { const p = point(k, j / segT); p.y -= 0.018; line.push(p); }
    ribs.push(line);
  }
  const edge: THREE.Vector3[] = [];
  for (let k = 0; k <= segA; k++) edge.push(point(k, 1));
  return { geo, ribs, edge };
}

function unit(u: PapillonUnit, h: number, open: number, mats: Mats, out: THREE.Group, put: (m: THREE.Material, g: THREE.BufferGeometry) => void) {
  const H = h + 0.2, x = u.x, z = u.z;
  // Base: a flat round plate; the pole, round and tapering upwards, with a satin ring near its foot.
  const base = new THREE.CylinderGeometry(0.26, 0.28, 0.035, 32); base.translate(x, 0.0175, z); put(mats.pole, base);
  const pole = new THREE.CylinderGeometry(0.052, 0.07, H, 24); pole.translate(x, H / 2 + 0.035, z); put(mats.pole, pole);
  const ring = new THREE.CylinderGeometry(0.073, 0.073, 0.04, 24); ring.translate(x, 0.3, z); put(mats.satin, ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28), mats.shadow); disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.004, z); out.add(disc);
  // Head: a sleek capsule lying along the arm; the arm, slender and tapering, with a warm LED line under it.
  const dir = new THREE.Vector3(Math.sin(u.yaw), 0, Math.cos(u.yaw));
  const headY = H + 0.1;
  const hinge = new THREE.Vector3(x, headY, z);
  const cap = new THREE.CapsuleGeometry(0.075, 0.26, 6, 16);
  cap.rotateX(Math.PI / 2);
  cap.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)));
  cap.translate(x + dir.x * 0.06, headY, z + dir.z * 0.06);
  put(mats.pole, cap);
  const armEnd = hinge.clone().addScaledVector(dir, u.r * 0.97); armEnd.y += LIFT * u.r * 0.35;
  put(mats.pole, beam(hinge, armEnd, 0.07, 0.035, 0.05));
  const endCap = new THREE.SphereGeometry(0.026, 12, 8); endCap.translate(armEnd.x, armEnd.y, armEnd.z); put(mats.satin, endCap);
  const ledA = hinge.clone().addScaledVector(dir, 0.25); ledA.y -= 0.03;
  const ledB = armEnd.clone(); ledB.y -= 0.025;
  put(mats.led, beam(ledA, ledB, 0.02, 0.012, 0.008));
  const o = Math.max(0, Math.min(1, open));
  if (o < 0.08) {
    // Closed: the fabric folded into a slim sleeve along the arm.
    const a = hinge.clone().addScaledVector(dir, 0.3); a.y -= 0.09;
    const b = armEnd.clone(); b.y -= 0.08;
    put(mats.fabric, beam(a, b, 0.12, 0.07, 0.1));
    return;
  }
  // Open: the two wings, their ribs with small caps at the tips and a thin dark piping round the edge.
  const half = (Math.PI / 2) * o;
  const fabricHead = new THREE.Vector3(x, headY - 0.02, z);
  for (const side of [-1, 1]) {
    const w = wing(fabricHead, u.yaw, side, half, u.r);
    put(mats.fabric, w.geo);
    for (const line of w.ribs) {
      put(mats.pole, tube([fabricHead.clone().setY(fabricHead.y - 0.02), ...line], 0.011, 5));
      const tip = line[line.length - 1]!;
      const c = new THREE.SphereGeometry(0.02, 10, 6); c.translate(tip.x, tip.y, tip.z); put(mats.satin, c);
    }
    put(mats.trim, tube(w.edge, 0.009, 4));
  }
}

export function realPapillons(def: { w: number; d: number; h?: number; open?: number }): THREE.Group {
  const out = new THREE.Group();
  const mats: Mats = {
    pole: new THREE.MeshStandardMaterial({ color: "#2b2f34", roughness: 0.42, metalness: 0.55 }),
    satin: new THREE.MeshStandardMaterial({ color: "#c9ced3", roughness: 0.28, metalness: 0.85 }),
    fabric: new THREE.MeshStandardMaterial({ color: "#f4efe6", emissive: "#8f8778", emissiveIntensity: 0.6, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }), // emissive: daylight through the fabric
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
