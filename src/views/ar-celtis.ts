import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { limb, rng } from "@/views/ar-pine";
import { drawn } from "@/views/ar-broadleaf";

/**
 * The hackberry (Celtis australis, "bagolaro") for the AR view, built in code with nothing to download: a stout trunk
 * of smooth elephant-grey bark, faintly fluted and swollen at the foot, that splits at about a third of the height into
 * a few limbs climbing like a vase, under a broad, rounded but uneven crown whose outer twigs droop a little — long
 * lance-shaped toothed leaves ending in a long curved point, dark green with grey-green undersides — and the small dark
 * purple fruits hanging on long stalks. Stands on y = 0, exactly h tall, the crown about w across. A seed varies limbs,
 * clumps and fruits.
 */

/** Elephant-grey bark: smooth, soft lighter and darker blotches, fine horizontal wrinkles and a few dark lenticels. */
const celtisBark = drawn("celtis-bark2", 128, 256, (g, r) => {
  g.fillStyle = "#8c8982"; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 46; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(200,197,190,${0.08 + r() * 0.12})` : `rgba(70,68,64,${0.08 + r() * 0.12})`;
    g.beginPath(); g.ellipse(r() * 128, r() * 256, 10 + r() * 30, 14 + r() * 40, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = "rgba(60,58,55,0.4)"; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y = r() * 256, x = r() * 110;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y + (r() - 0.5) * 3, x + 10 + r() * 22, y + (r() - 0.5) * 2); g.stroke();
  }
  for (let i = 0; i < 30; i++) { g.fillStyle = "rgba(45,42,38,0.55)"; g.fillRect(r() * 128, r() * 256, 3 + r() * 4, 1.2); }
}, true);

/** A twig of lance-shaped, toothed leaves with a long curved tip and an uneven base, alternate along it. */
const celtisLeaf = drawn("celtis-leaf2", 128, 128, (g, r) => {
  const leaf = (x: number, y: number, a: number, len: number) => {
    g.save(); g.translate(x, y); g.rotate(a);
    const w = len * 0.24, v = 172 + Math.floor(r() * 75), bend = (r() < 0.5 ? -1 : 1) * len * 0.12;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.moveTo(0, 0);
    // Right edge with small teeth, out to the long tip bending aside; back down the left, the base a little uneven.
    for (let i = 0; i <= 12; i++) { const t = i / 12, half = w * Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - t * 0.35); g.lineTo(half * (i % 2 ? 1.08 : 0.94) + bend * t * t, -len * t); }
    for (let i = 12; i >= 0; i--) { const t = i / 12, half = w * 0.88 * Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - t * 0.35); g.lineTo(-half * (i % 2 ? 1.08 : 0.94) + bend * t * t, -len * t); }
    g.fill();
    g.strokeStyle = "rgba(90,90,90,0.45)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, -1); g.quadraticCurveTo(bend * 0.25, -len * 0.5, bend, -len * 0.95); g.stroke();
    g.restore();
  };
  g.strokeStyle = "rgb(105,95,85)"; g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(64, 127); g.quadraticCurveTo(60, 70, 70, 10); g.stroke();
  for (let k = 0; k < 8; k++) {
    const t = 0.1 + k * 0.11, y = 127 - t * 117, side = k % 2 ? 1 : -1;
    leaf(64 + side * 2, y, side * (0.95 + r() * 0.35), 28 + r() * 10);
  }
  leaf(69, 12, (r() - 0.5) * 0.4, 30);
});

/** The crown's half-width at f (0 at its foot, 1 at its top): broad and rounded, widest a little below the middle. */
export function celtisRadius(f: number): number {
  if (f <= 0) return 0.62; if (f >= 1) return 0;
  const m = 0.42, d = (f - m) / (f < m ? 0.58 : 1 - m);
  return Math.max(f < m ? 0.62 : 0, Math.sqrt(Math.max(0, 1 - d * d)));
}

/** Flutes along a trunk: each ring pushed in and out a little round its centre, more near the foot. */
function flute(geo: THREE.BufferGeometry, axis: THREE.Curve<THREE.Vector3>, segs: number, lobes: number, depth: number) {
  const pos = geo.attributes["position"]!;
  const per = pos.count / (segs + 1);
  const c = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    axis.getPointAt(t, c);
    const foot = 1 + Math.max(0, 0.18 - t) * 2.2;
    for (let j = 0; j < per; j++) {
      const k = i * per + j;
      p.fromBufferAttribute(pos, k).sub(c);
      const ang = Math.atan2(p.z, p.x);
      p.multiplyScalar(foot * (1 + depth * (1 - t * 0.7) * Math.cos(ang * lobes))).add(c);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
}

export function realCeltis(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 811 + 37);
  const H = Math.max(2, def.h);
  const W = Math.min(H * 1.15, Math.max(H * 0.7, def.w || H * 0.9));
  const R = W / 2;
  const g = new THREE.Group();

  // Trunk: stout, slightly leaning, fluted, splitting at about a third of the height.
  const forkY = H * (0.28 + r() * 0.06);
  const crownFoot = forkY * 0.9;
  const depth = H - crownFoot;
  const trunkR = Math.max(0.1, H * 0.038);
  const la = r() * Math.PI * 2, lean = H * 0.03 * r();
  const trunkPts = [0, 0.35, 0.7, 1].map((t) => new THREE.Vector3(Math.cos(la) * lean * t, forkY * t, Math.sin(la) * lean * t));
  const trunk = limb(trunkPts, trunkR, trunkR * 0.85, 14, 16);
  flute(trunk, new THREE.CatmullRomCurve3(trunkPts), 14, 5, 0.07);
  const woodGeos: THREE.BufferGeometry[] = [trunk];
  const top = trunkPts[3]!.clone();

  // Limbs: 3–5 climbing like a vase, then each splitting in three towards the crown's outline.
  const clumps: { c: THREE.Vector3; cr: number }[] = [];
  const nLimbs = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nLimbs; i++) {
    const a = (i / nLimbs) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const fMid = 0.3 + r() * 0.12, yMid = crownFoot + fMid * depth;
    const outMid = R * celtisRadius(fMid) * (0.38 + r() * 0.12);
    const mid = new THREE.Vector3(top.x + Math.cos(a) * outMid, yMid, top.z + Math.sin(a) * outMid);
    woodGeos.push(limb([top.clone(), new THREE.Vector3(top.x + Math.cos(a) * outMid * 0.35, (forkY + yMid) / 2 + depth * 0.05, top.z + Math.sin(a) * outMid * 0.35), mid], trunkR * 0.55, trunkR * 0.3, 8, 10));
    for (let k = 0; k < 3; k++) {
      const b = a + (k - 1) * (0.5 + r() * 0.3);
      const f = Math.min(0.9, fMid + 0.12 + r() * 0.42);
      const out = R * celtisRadius(f) * (0.6 + r() * 0.2);
      const tip = new THREE.Vector3(top.x + Math.cos(b) * out, crownFoot + f * depth, top.z + Math.sin(b) * out);
      woodGeos.push(limb([mid.clone(), new THREE.Vector3((mid.x + tip.x) / 2, (mid.y + tip.y) / 2 + depth * 0.05, (mid.z + tip.z) / 2), tip], trunkR * 0.28, trunkR * 0.06, 6, 7));
      clumps.push({ c: tip, cr: Math.max(0.35, R * (0.28 + r() * 0.14)) });
    }
  }
  clumps.push({ c: new THREE.Vector3(top.x, crownFoot + depth * 0.82, top.z), cr: R * 0.38 });
  const bark = celtisBark().clone(); bark.needsUpdate = true; bark.repeat.set(1.5, Math.max(1, H / 4));
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.8 })));

  // Inner body of the crown, uneven: it is not a regular dome.
  const steps = 22, pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) { const f = i / steps; pts.push(new THREE.Vector2(Math.max(0.001, R * 0.55 * celtisRadius(f)), crownFoot + f * depth)); }
  const body = new THREE.LatheGeometry(pts, 20);
  const bp = body.attributes["position"]!;
  const v = new THREE.Vector3();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    const k = 1 + Math.sin(v.y * 1.1 + Math.atan2(v.z, v.x) * 3 + seed) * 0.14;
    bp.setXYZ(i, v.x * k + top.x, v.y, v.z * k + top.z);
  }
  body.computeVertexNormals();
  g.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: "#34502a", roughness: 1 })));

  // Leaves: 40 % over the crown, the rest in the clumps, and a fringe of drooping twigs round the lower rim.
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.35, 0);
  const twigGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const total = Math.min(4600, Math.round(700 + R * R * 95 + depth * 50));
  const twigs = new THREE.InstancedMesh(twigGeo, new THREE.MeshStandardMaterial({ map: celtisLeaf(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), total);
  twigs.frustumCulled = false;
  const d = new THREE.Object3D(), col = new THREE.Color();
  const size = Math.max(0.3, Math.min(1.2, R * 0.21));
  let used = 0;
  const leafAt = (x: number, y: number, z: number, hang = false) => {
    if (!hang) {
      const f = Math.max(0, Math.min(1, (y - crownFoot) / depth));
      const lim = R * (celtisRadius(f) * 1.05 + 0.04), dx = x - top.x, dz = z - top.z, dist = Math.hypot(dx, dz);
      if (dist > lim) { const k = lim / dist; x = top.x + dx * k; z = top.z + dz * k; }
    }
    d.position.set(x, Math.min(H, y), z);
    d.rotation.set(hang ? Math.PI * 0.75 + (r() - 0.5) * 0.5 : (r() - 0.5) * 1.2, r() * Math.PI, (r() - 0.5) * 1.2);
    const sz = size * (0.75 + r() * 0.5);
    d.scale.set(sz, sz, sz);
    d.updateMatrix();
    twigs.setMatrixAt(used, d.matrix);
    const pale = r() < 0.12;
    twigs.setColorAt(used, pale ? col.setHSL(0.22, 0.18, 0.46 + r() * 0.08) : col.setHSL(0.25 + r() * 0.04, 0.4 + r() * 0.14, 0.26 + r() * 0.09));
    used++;
  };
  const fringe = Math.round(total * 0.08);
  const onSurface = Math.round((total - fringe) * 0.5);
  for (let i = 0; i < onSurface; i++) {
    let f = 0;
    for (let tries = 0; tries < 6; tries++) { f = r(); if (r() < celtisRadius(f) + 0.1) break; }
    const a = r() * Math.PI * 2, rad = R * celtisRadius(f) * (0.82 + r() * 0.22);
    leafAt(top.x + Math.cos(a) * rad, crownFoot + f * depth, top.z + Math.sin(a) * rad);
  }
  const sumSq = clumps.reduce((s, cl) => s + cl.cr * cl.cr, 0);
  const inClumps = total - fringe - onSurface;
  let placed = 0;
  clumps.forEach(({ c, cr }, ci) => {
    const m = ci === clumps.length - 1 ? inClumps - placed : Math.round((inClumps * cr * cr) / sumSq);
    for (let k = 0; k < m; k++, placed++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const yy = u < -0.45 ? u * 0.55 : u, ss = Math.sqrt(1 - yy * yy), dd = cr * (0.6 + r() * 0.45);
      leafAt(c.x + Math.cos(a) * ss * dd, c.y + yy * dd * 0.8, c.z + Math.sin(a) * ss * dd);
    }
  });
  // Drooping twigs at the lower rim, hanging a little below the crown.
  for (let i = 0; i < fringe && used < total; i++) {
    const f = 0.06 + r() * 0.2, a = r() * Math.PI * 2, rad = R * celtisRadius(f) * (0.95 + r() * 0.1);
    leafAt(top.x + Math.cos(a) * rad, crownFoot + f * depth - r() * depth * 0.1, top.z + Math.sin(a) * rad, true);
  }
  twigs.count = used;
  g.add(twigs);

  // Fruits: small dark purple drupes on long stalks among the outer leaves.
  const nFruit = Math.min(140, Math.round(30 + R * 12));
  const fruit = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.45 }), nFruit);
  fruit.frustumCulled = false;
  const fr = Math.max(0.03, H * 0.0022);
  for (let i = 0; i < nFruit; i++) {
    const f = 0.15 + r() * 0.75, a = r() * Math.PI * 2, rad = R * celtisRadius(f) * (0.97 + r() * 0.08);
    d.position.set(top.x + Math.cos(a) * rad, crownFoot + f * depth - fr * 3, top.z + Math.sin(a) * rad);
    d.rotation.set(0, 0, 0); d.scale.setScalar(fr * (0.85 + r() * 0.3)); d.updateMatrix();
    fruit.setMatrixAt(i, d.matrix);
    fruit.setColorAt(i, col.setHSL(0.8 + r() * 0.05, 0.3, 0.14 + r() * 0.08));
  }
  g.add(fruit);

  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - Math.min(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}
