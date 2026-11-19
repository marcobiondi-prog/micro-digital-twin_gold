import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { papillonUnits, type PapillonUnit } from "@/models/area-layout";

/**
 * Shade sails on a side pole whose two fabric wings open horizontally like a butterfly's (the kind of shade the user
 * pointed to), for the AR view and the 3D maps, built in code: in a w×d rectangle centred on 0 the poles stand on one
 * long edge (models/area-layout papillonUnits), each a slim wood-clad pole on a steel plate and footing, an anthracite
 * head and arm reaching over the shade, ribs fanning out from the head on both sides and the fabric stretched between
 * them with a little sag, a warm LED strip under the arm. `open` (0–1) is how far the wings are spread (motorised:
 * open in the day's heat, closed at dusk, at night and in winter); closed, the fabric is gathered in a soft bundle
 * under the arm. Stands on y = 0; h is the fabric's height at the pole.
 */

const WINGS = ["#f0e9da", "#e6dcc6"];

function rod(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const geo = new THREE.BoxGeometry(w, h, len);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
  geo.applyMatrix4(m);
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geo.toNonIndexed();
}

/** One wing segment between two ribs: a fan from the head to an arc, sagging a little between the ribs. */
function wingSegment(head: THREE.Vector3, a0: number, a1: number, r: number, tipDrop: number, seg = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const at = (a: number, t: number) => {
    const sag = Math.sin(Math.PI * t) * 0.06 * r;
    return new THREE.Vector3(head.x + Math.sin(a) * r * t, head.y - tipDrop * t - sag * 0.25, head.z + Math.cos(a) * r * t);
  };
  const rings = 4;
  for (let k = 0; k < rings; k++) for (let i = 0; i < seg; i++) {
    const t0 = k / rings, t1 = (k + 1) / rings;
    const b0 = a0 + ((a1 - a0) * i) / seg, b1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    // The fabric dips a little between the ribs (most in the middle of the segment).
    const dip = (b: number, t: number) => { const p = at(b, t); p.y -= Math.sin((Math.PI * (b - a0)) / (a1 - a0 || 1)) * 0.07 * t; return p; };
    const q = [dip(b0, t0), dip(b1, t0), dip(b1, t1), dip(b0, t1)];
    for (const v of [q[0]!, q[1]!, q[2]!, q[0]!, q[2]!, q[3]!]) pos.push(v.x, v.y, v.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function unit(u: PapillonUnit, h: number, open: number, mats: { wood: THREE.Material; metal: THREE.Material; steel: THREE.Material; concrete: THREE.Material; led: THREE.Material; wings: THREE.Material[]; shadow: THREE.Material }, out: THREE.Group, bins: Map<THREE.Material, THREE.BufferGeometry[]>) {
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => { const l = bins.get(m) ?? []; l.push(g.index ? g.toNonIndexed() : g); bins.set(m, l); };
  const H = h + 0.25, x = u.x, z = u.z;
  // Pole: wood-clad square section on a steel plate over a concrete footing flush with the floor.
  const pole = new THREE.BoxGeometry(0.16, H, 0.16); pole.translate(x, H / 2 + 0.07, z); put(mats.wood, pole);
  const plate = new THREE.BoxGeometry(0.3, 0.02, 0.3); plate.translate(x, 0.07, z); put(mats.steel, plate);
  const foot = new THREE.BoxGeometry(0.42, 0.06, 0.42); foot.translate(x, 0.03, z); put(mats.concrete, foot);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), mats.shadow); disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0.004, z); out.add(disc);
  // Head and arm: an anthracite box on the pole and the arm reaching over the shade along the unit's direction.
  const headY = H + 0.07;
  const head = new THREE.BoxGeometry(0.26, 0.22, 0.26); head.translate(x, headY, z); put(mats.metal, head);
  const dir = new THREE.Vector3(Math.sin(u.yaw), 0, Math.cos(u.yaw));
  const hinge = new THREE.Vector3(x, headY - 0.02, z);
  const armEnd = hinge.clone().addScaledVector(dir, u.r * 0.96); armEnd.y -= 0.12;
  put(mats.metal, rod(hinge, armEnd, 0.09, 0.07));
  // The LED strip under the arm.
  const ledA = hinge.clone().addScaledVector(dir, 0.3); ledA.y -= 0.05;
  const ledB = armEnd.clone(); ledB.y -= 0.05;
  put(mats.led, rod(ledA, ledB, 0.03, 0.012));
  const o = Math.max(0, Math.min(1, open));
  if (o < 0.08) {
    // Closed: the fabric gathered in a soft bundle hanging under the arm.
    const len = hinge.distanceTo(armEnd) * 0.9;
    const bundle = new THREE.CapsuleGeometry(0.13, Math.max(0.1, len - 0.26), 4, 10);
    bundle.rotateX(Math.PI / 2);
    bundle.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)));
    const mid = hinge.clone().lerp(armEnd, 0.52); mid.y -= 0.2;
    bundle.translate(mid.x, mid.y, mid.z);
    put(mats.wings[0]!, bundle);
    return;
  }
  // Open: four ribs a wing fanning from the head, the fabric between them.
  const half = (Math.PI / 2) * o, ribs = 4, fabricY = headY - 0.08;
  const fabricHead = new THREE.Vector3(x, fabricY, z);
  for (const side of [-1, 1]) {
    for (let k = 0; k < ribs; k++) {
      const a0 = u.yaw + side * (half * k) / ribs, a1 = u.yaw + side * (half * (k + 1)) / ribs;
      const [lo, hi] = side < 0 ? [a1, a0] : [a0, a1];
      put(mats.wings[(k + (side < 0 ? 1 : 0)) % 2]!, wingSegment(fabricHead, lo, hi, u.r, 0.18));
      const ra = u.yaw + side * (half * (k + 1)) / ribs;
      const tip = new THREE.Vector3(x + Math.sin(ra) * u.r, fabricY - 0.2, z + Math.cos(ra) * u.r);
      put(mats.metal, rod(fabricHead.clone().setY(fabricY - 0.02), tip, 0.03, 0.025));
    }
  }
}

export function realPapillons(def: { w: number; d: number; h?: number; open?: number }): THREE.Group {
  const out = new THREE.Group();
  const mats = {
    wood: new THREE.MeshStandardMaterial({ color: "#8a6646", roughness: 0.7 }),
    metal: new THREE.MeshStandardMaterial({ color: "#3a3f45", roughness: 0.45, metalness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: "#a3acb4", roughness: 0.4, metalness: 0.7 }),
    concrete: new THREE.MeshStandardMaterial({ color: "#a7a39b", roughness: 0.95 }),
    led: new THREE.MeshStandardMaterial({ color: "#fff3d6", emissive: "#ffd9a0", emissiveIntensity: 0.9, roughness: 0.4 }),
    wings: WINGS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide })),
    shadow: new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.3, depthWrite: false }),
  };
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const u of papillonUnits(Math.max(1, def.w), Math.max(1, def.d))) unit(u, def.h ?? 3.2, def.open ?? 1, mats, out, bins);
  for (const [mat, list] of bins) {
    // Every piece of a material in one mesh (normals and uvs dropped where some pieces lack them).
    const clean = list.map((g) => { const c = new THREE.BufferGeometry(); c.setAttribute("position", g.getAttribute("position")); return c; });
    const merged = mergeGeometries(clean, false);
    if (merged) { merged.computeVertexNormals(); out.add(new THREE.Mesh(merged, mat)); }
  }
  return out;
}
