import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { limb, rng } from "@/views/ar-pine";

/**
 * The holm oak (Quercus ilex, "leccio") for the AR view, built in code with nothing to download: a short, stout trunk
 * of near-black bark cracked into small square plates, often leaning a little and splitting low into several limbs
 * (now and then two stems from the ground), under a very dense, rounded, evergreen dome that comes down low — small
 * leathery leaves, dark green above and felted grey beneath, so the crown is almost black with grey glints where the
 * wind turns them. Stands on y = 0, exactly h tall, the crown about w across. A seed varies limbs and clumps.
 */

let barkTex: THREE.Texture | null = null;
let leafTex: THREE.Texture | null = null;

/** Holm oak bark: dark grey-brown, cracked into small, roughly square plates. */
function barkTexture() {
  if (barkTex) return barkTex;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(1401);
  g.fillStyle = "#2c2925";
  g.fillRect(0, 0, c.width, c.height);
  // Plates: small rounded squares in dark greys and browns, a narrow black crack between each.
  for (let y = 0; y < 256; y += 13) {
    const shift = r() * 10;
    for (let x = -10; x < 128; x += 13) {
      const v = 58 + Math.floor(r() * 34);
      g.fillStyle = `rgb(${v + 6},${v + 2},${v - 4})`;
      g.beginPath();
      g.roundRect(x + shift + r() * 2, y + r() * 2, 10 + r() * 3, 10 + r() * 3, 2);
      g.fill();
      if (r() < 0.25) { g.fillStyle = "rgba(150,145,135,0.25)"; g.fillRect(x + shift + 2, y + 2, 5, 4); }
    }
  }
  barkTex = new THREE.CanvasTexture(c);
  barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  return barkTex;
}

/** A twig crowded with small oval leathery leaves, some with a few spiny teeth, white-ish so instances tint them. */
function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = rng(1501);
  const leaf = (x: number, y: number, a: number, len: number) => {
    g.save(); g.translate(x, y); g.rotate(a);
    const w = len * 0.42, v = 170 + Math.floor(r() * 75);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.moveTo(0, 0);
    // Oval with an occasional spiny tooth on the edge (young or shaded leaves).
    const spiny = r() < 0.35;
    g.bezierCurveTo(w, -len * 0.15, w, -len * 0.75, 0, -len);
    g.bezierCurveTo(-w, -len * 0.75, -w, -len * 0.15, 0, 0);
    g.fill();
    if (spiny) { for (const k of [0.3, 0.55]) { g.beginPath(); g.moveTo(w * 0.9, -len * k); g.lineTo(w * 1.25, -len * (k + 0.05)); g.lineTo(w * 0.85, -len * (k + 0.1)); g.fill(); } }
    g.strokeStyle = "rgba(100,100,100,0.45)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, -1); g.lineTo(0, -len * 0.9); g.stroke();
    g.restore();
  };
  for (let t = 0; t < 3; t++) {
    const x0 = 34 + t * 30, a0 = -Math.PI / 2 + (t - 1) * 0.35;
    const ex = x0 + Math.cos(a0) * 112, ey = 127 + Math.sin(a0) * 112;
    g.strokeStyle = "rgb(95,85,75)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, 127); g.lineTo(ex, ey); g.stroke();
    for (let k = 1; k <= 8; k++) {
      const f = k / 8.6, px = x0 + (ex - x0) * f, py = 127 + (ey - 127) * f;
      const side = k % 2 ? 1 : -1;
      leaf(px, py, a0 + Math.PI / 2 + side * (1 + r() * 0.4), 15 + r() * 7);
    }
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

/** The crown's half-width at f (0 at its foot, 1 at its top): a round dome, widest a little below the middle. */
export function holmRadius(f: number): number {
  if (f <= 0 || f >= 1) return f <= 0 ? 0.62 : 0;
  const m = 0.4;
  const d = (f - m) / (f < m ? 0.52 : 0.6);
  return Math.sqrt(Math.max(0, 1 - d * d));
}

export function realHolmOak(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 229 + 83);
  const H = Math.max(2, def.h);
  const W = Math.min(H * 1.2, Math.max(H * 0.7, def.w || H * 0.9));
  const R = W / 2;
  const g = new THREE.Group();

  // Trunk(s): short and stout, leaning a little; now and then two stems from the ground.
  const stems = r() < 0.3 ? 2 : 1;
  const forkY = H * (0.2 + r() * 0.06);
  const crownFoot = H * (0.17 + r() * 0.05);
  const depth = H - crownFoot;
  const trunkR = Math.max(0.1, H * 0.04) * (stems > 1 ? 0.75 : 1);
  const la = r() * Math.PI * 2, lean = H * 0.04;
  const woodGeos: THREE.BufferGeometry[] = [];
  const tops: THREE.Vector3[] = [];
  for (let s = 0; s < stems; s++) {
    const a = la + s * Math.PI * (0.8 + r() * 0.4), splay = stems > 1 ? R * 0.18 : 0;
    const pts = [0, 0.4, 0.75, 1].map((t) => new THREE.Vector3(Math.cos(la) * lean * t + Math.cos(a) * splay * t, forkY * t, Math.sin(la) * lean * t + Math.sin(a) * splay * t));
    woodGeos.push(limb(pts, trunkR, trunkR * 0.78, 10, 12));
    tops.push(pts[3]!.clone());
  }
  const foot = new THREE.CylinderGeometry(trunkR * 1.05, trunkR * 1.4, H * 0.025, 12);
  foot.translate(0, H * 0.012, 0);
  woodGeos.push(foot);
  const centre = tops.reduce((t, v) => t.add(v), new THREE.Vector3()).multiplyScalar(1 / tops.length);

  // Limbs: 3–5 per stem, climbing and spreading, each splitting in two; clumps at their ends.
  const clumps: { c: THREE.Vector3; cr: number }[] = [];
  for (const top of tops) {
    const nLimbs = 3 + Math.floor(r() * 3);
    for (let i = 0; i < nLimbs; i++) {
      const a = (i / nLimbs) * Math.PI * 2 + r() * 0.7;
      const fMid = 0.25 + r() * 0.15, yMid = crownFoot + fMid * depth;
      const outMid = R * holmRadius(fMid) * (0.4 + r() * 0.15);
      const mid = new THREE.Vector3(centre.x + Math.cos(a) * outMid, yMid, centre.z + Math.sin(a) * outMid);
      woodGeos.push(limb([top.clone(), new THREE.Vector3((top.x + mid.x) / 2, (top.y + yMid) / 2 + depth * 0.03, (top.z + mid.z) / 2), mid], trunkR * 0.5, trunkR * 0.25, 7, 8));
      for (let k = 0; k < 2; k++) {
        const b = a + (k ? 1 : -1) * (0.35 + r() * 0.3);
        const f = Math.min(0.9, fMid + 0.12 + r() * 0.4);
        const out = R * holmRadius(f) * (0.6 + r() * 0.2);
        const tip = new THREE.Vector3(centre.x + Math.cos(b) * out, crownFoot + f * depth, centre.z + Math.sin(b) * out);
        woodGeos.push(limb([mid.clone(), tip], trunkR * 0.24, trunkR * 0.07, 5, 6));
        clumps.push({ c: tip, cr: Math.max(0.35, R * (0.3 + r() * 0.1)) });
      }
    }
  }
  clumps.push({ c: new THREE.Vector3(centre.x, crownFoot + depth * 0.8, centre.z), cr: R * 0.4 });
  // The crown comes down low: a ring of clumps round its lower rim.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.4, f = 0.08 + r() * 0.1, env = R * holmRadius(f);
    clumps.push({ c: new THREE.Vector3(centre.x + Math.cos(a) * env * 0.8, crownFoot + f * depth, centre.z + Math.sin(a) * env * 0.8), cr: R * (0.24 + r() * 0.08) });
  }

  const bark = barkTexture().clone();
  bark.needsUpdate = true;
  bark.repeat.set(1.5, Math.max(1, H / 3));
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 })));

  // A dense dark body, almost as big as the crown: the holm oak shows no sky through it.
  const steps = 22, pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    pts.push(new THREE.Vector2(Math.max(0.001, R * 0.74 * holmRadius(f)), crownFoot + f * depth));
  }
  const body = new THREE.LatheGeometry(pts, 20);
  const bp = body.attributes["position"]!;
  const v = new THREE.Vector3();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    const k = 1 + Math.sin(v.y * 1.4 + Math.atan2(v.z, v.x) * 4 + seed) * 0.14;
    bp.setXYZ(i, v.x * k + centre.x, v.y, v.z * k + centre.z);
  }
  body.computeVertexNormals();
  g.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: "#1c2a17", roughness: 1 })));

  // Leaves: half over the dome, half in the clumps, kept within it; very dark green, about one in six grey (the underside).
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.35, 0);
  const twigGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const total = Math.min(4200, Math.round(650 + R * R * 90 + depth * 50));
  const twigs = new THREE.InstancedMesh(
    twigGeo,
    new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.55 }),
    total,
  );
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const size = Math.max(0.25, Math.min(1.1, R * 0.19));
  let used = 0;
  const leafAt = (x: number, y: number, z: number) => {
    const f = Math.max(0, Math.min(1, (y - crownFoot) / depth));
    const lim = R * (holmRadius(f) * 1.04 + 0.04), dx = x - centre.x, dz = z - centre.z, dist = Math.hypot(dx, dz);
    if (dist > lim) { const k = lim / dist; x = centre.x + dx * k; z = centre.z + dz * k; }
    dummy.position.set(x, Math.min(H, y), z);
    dummy.rotation.set((r() - 0.5) * 1.2, r() * Math.PI, (r() - 0.5) * 1.2);
    const sz = size * (0.75 + r() * 0.5);
    dummy.scale.set(sz, sz, sz);
    dummy.updateMatrix();
    twigs.setMatrixAt(used, dummy.matrix);
    const grey = r() < 0.1;
    twigs.setColorAt(used, grey ? col.setHSL(0.2, 0.07, 0.34 + r() * 0.08) : col.setHSL(0.28 + r() * 0.05, 0.38 + r() * 0.15, 0.12 + r() * 0.06));
    used++;
  };
  const onSurface = Math.round(total * 0.4);
  for (let i = 0; i < onSurface; i++) {
    let f = 0;
    for (let tries = 0; tries < 6; tries++) { f = r(); if (r() < holmRadius(f) + 0.1) break; }
    const a = r() * Math.PI * 2, rad = R * holmRadius(f) * (0.84 + r() * 0.2);
    leafAt(centre.x + Math.cos(a) * rad, crownFoot + f * depth, centre.z + Math.sin(a) * rad);
  }
  const sumSq = clumps.reduce((t, cl) => t + cl.cr * cl.cr, 0);
  const inClumps = total - onSurface;
  clumps.forEach(({ c, cr }, ci) => {
    const m = ci === clumps.length - 1 ? total - used : Math.round((inClumps * cr * cr) / sumSq);
    for (let t = 0; t < m && used < total; t++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const yy = u < -0.45 ? u * 0.55 : u, ss = Math.sqrt(1 - yy * yy), d = cr * (0.6 + r() * 0.45);
      leafAt(c.x + Math.cos(a) * ss * d, c.y + yy * d * 0.85, c.z + Math.sin(a) * ss * d);
    }
  });
  twigs.count = used;
  g.add(twigs);

  // Exactly the species' height, standing on y = 0.
  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - Math.min(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}
