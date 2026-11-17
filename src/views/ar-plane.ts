import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { limb, rng } from "@/views/ar-pine";

/**
 * The plane tree (Platanus, "platano") for the AR view, built in code with nothing to download: a massive straight
 * trunk in its camouflage bark (olive-grey, cream and greenish patches where the old bark has flaked off, paler higher
 * up), forking at about a third of the height into a few heavy pale limbs that radiate up and out, under a broad,
 * irregular dome — an airier crown than the lime's, so the pale limbs show between clumps of large palmate leaves —
 * with the round seed balls hanging on long stalks. Stands on y = 0, exactly h tall, the crown about w across.
 * A seed varies the limbs, the clumps and the balls.
 */

let barkTex: THREE.Texture | null = null;
let leafTex: THREE.Texture | null = null;

/** Camouflage bark: a grey-olive ground covered in rounded flaking patches of cream, ochre and green-grey. */
function barkTexture() {
  if (barkTex) return barkTex;
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(1201);
  g.fillStyle = "#7c7b66";
  g.fillRect(0, 0, c.width, c.height);
  const tones = ["rgba(222,214,182,", "rgba(196,184,140,", "rgba(150,158,120,", "rgba(110,112,92,", "rgba(232,226,204,"];
  for (let i = 0; i < 70; i++) {
    const t = tones[Math.floor(r() * tones.length)]!;
    g.fillStyle = `${t}${0.55 + r() * 0.4})`;
    g.beginPath();
    const x = r() * 256, y = r() * 256, rx = 10 + r() * 26, ry = 14 + r() * 34;
    // Irregular patch: an ellipse with a wobbly edge.
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2, w = 1 + (r() - 0.5) * 0.35;
      const px = x + Math.cos(a) * rx * w, py = y + Math.sin(a) * ry * w;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    // A thin darker rim on some, where the flake's edge lifts.
    if (r() < 0.4) { g.strokeStyle = "rgba(80,78,64,0.35)"; g.lineWidth = 1; g.stroke(); }
  }
  barkTex = new THREE.CanvasTexture(c);
  barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  return barkTex;
}

/** A twig of big palmate leaves (three to five pointed lobes, like a maple's), white-ish so instances tint it. */
function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = rng(1301);
  const palm = (x: number, y: number, a: number, s: number) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
    const v = 175 + Math.floor(r() * 70);
    g.fillStyle = `rgb(${v},${v},${v})`;
    // Five broad lobes with shallow sinuses: wide middle and side lobes, short basal ones, each ending in a point.
    const lobes = [[-1.5, 0.5], [-0.78, 0.9], [0, 1], [0.78, 0.9], [1.5, 0.5]] as const;
    g.beginPath();
    g.moveTo(0, 3);
    for (const [ang, len] of lobes) {
      const L = 26 * len, tipX = Math.sin(ang) * L, tipY = -Math.cos(ang) * L;
      const left = ang - 0.42, right = ang + 0.42;
      g.lineTo(Math.sin(left) * L * 0.62, -Math.cos(left) * L * 0.62);
      g.quadraticCurveTo(Math.sin(ang - 0.2) * L * 0.95, -Math.cos(ang - 0.2) * L * 0.95, tipX, tipY);
      g.quadraticCurveTo(Math.sin(ang + 0.2) * L * 0.95, -Math.cos(ang + 0.2) * L * 0.95, Math.sin(right) * L * 0.62, -Math.cos(right) * L * 0.62);
    }
    g.closePath(); g.fill();
    g.strokeStyle = "rgba(90,90,90,0.45)"; g.lineWidth = 0.9;
    g.beginPath();
    for (const [ang, len] of lobes) { g.moveTo(0, 1); g.lineTo(Math.sin(ang) * 22 * len, -Math.cos(ang) * 22 * len); }
    g.stroke();
    g.restore();
  };
  g.strokeStyle = "rgb(125,110,90)"; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(64, 127); g.quadraticCurveTo(70, 80, 62, 24); g.stroke();
  palm(36, 98, -0.8, 1.05 + r() * 0.15);
  palm(92, 84, 0.7, 1.05 + r() * 0.15);
  palm(38, 58, -0.5, 1 + r() * 0.15);
  palm(90, 44, 0.5, 1 + r() * 0.15);
  palm(63, 26, (r() - 0.5) * 0.3, 1.15);
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

/** The crown's half-width at f (0 at its foot, 1 at its top): a broad dome, widest about a third of the way up. */
export function planeRadius(f: number): number {
  if (f <= 0 || f >= 1) return f <= 0 ? 0.6 : 0;
  const m = 0.34;
  const d = (f - m) / (f < m ? 0.55 : 0.66);
  return Math.sqrt(Math.max(0, 1 - d * d));
}

export function realPlane(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 223 + 61);
  const H = Math.max(2, def.h);
  const W = Math.min(H * 1.15, Math.max(H * 0.6, def.w || H * 0.85));
  const R = W / 2;
  const g = new THREE.Group();

  // Trunk: massive and straight, forking at about a third of the height.
  const forkY = H * (0.3 + r() * 0.06);
  const crownFoot = forkY * 0.92;
  const depth = H - crownFoot;
  const trunkR = Math.max(0.1, H * 0.04);
  const trunkPts = [0, 0.4, 0.75, 1].map((t) => new THREE.Vector3((t > 0 && t < 1 ? (r() - 0.5) * trunkR * 0.4 : 0), forkY * t, (t > 0 && t < 1 ? (r() - 0.5) * trunkR * 0.4 : 0)));
  const woodGeos: THREE.BufferGeometry[] = [limb(trunkPts, trunkR, trunkR * 0.82, 12, 14)];
  const foot = new THREE.CylinderGeometry(trunkR * 1.02, trunkR * 1.35, H * 0.03, 14);
  foot.translate(0, H * 0.015, 0);
  woodGeos.push(foot);
  const top = trunkPts[3]!.clone();

  // Heavy limbs: 4–6 radiating up and out from the fork, each splitting twice; their ends carry the leaf clumps.
  const clumps: { c: THREE.Vector3; cr: number }[] = [];
  const nLimbs = 4 + Math.floor(r() * 3);
  for (let i = 0; i < nLimbs; i++) {
    const a = (i / nLimbs) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const fMid = 0.32 + r() * 0.12, yMid = crownFoot + fMid * depth;
    const outMid = R * planeRadius(fMid) * (0.42 + r() * 0.12);
    const mid = new THREE.Vector3(top.x + Math.cos(a) * outMid, yMid, top.z + Math.sin(a) * outMid);
    woodGeos.push(limb([top.clone(), new THREE.Vector3(top.x + Math.cos(a) * outMid * 0.45, (forkY + yMid) / 2 + depth * 0.04, top.z + Math.sin(a) * outMid * 0.45), mid], trunkR * 0.55, trunkR * 0.32, 8, 9));
    for (let k = 0; k < 3; k++) {
      const b = a + (k - 1) * (0.45 + r() * 0.3);
      const f = Math.min(0.88, fMid + 0.15 + r() * 0.35);
      const env = R * planeRadius(f);
      const out = env * (0.62 + r() * 0.18);
      const tip = new THREE.Vector3(top.x + Math.cos(b) * out, crownFoot + f * depth, top.z + Math.sin(b) * out);
      woodGeos.push(limb([mid.clone(), new THREE.Vector3((mid.x + tip.x) / 2, (mid.y + tip.y) / 2 + depth * 0.05, (mid.z + tip.z) / 2), tip], trunkR * 0.3, trunkR * 0.07, 6, 7));
      clumps.push({ c: tip, cr: Math.max(0.4, R * (0.3 + r() * 0.12)) });
    }
  }
  clumps.push({ c: new THREE.Vector3(top.x, crownFoot + depth * 0.82, top.z), cr: R * 0.36 });

  const bark = barkTexture().clone();
  bark.needsUpdate = true;
  bark.repeat.set(1.2, Math.max(1, H / 4));
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.85 })));

  // An inner dome, smaller than the lime's, so gaps open towards the pale limbs.
  const steps = 22, pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    pts.push(new THREE.Vector2(Math.max(0.001, R * 0.5 * planeRadius(f)), crownFoot + depth * 0.15 + f * depth * 0.78));
  }
  const body = new THREE.LatheGeometry(pts, 18);
  const bp = body.attributes["position"]!;
  const v = new THREE.Vector3();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    const k = 1 + Math.sin(v.y * 1.1 + Math.atan2(v.z, v.x) * 3 + seed) * 0.12;
    bp.setXYZ(i, v.x * k + top.x, v.y, v.z * k + top.z);
  }
  body.computeVertexNormals();
  g.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: "#2f4721", roughness: 1 })));

  // Leaves: a third over the dome's surface, two thirds in the clumps (an irregular, lumpy crown), kept inside the dome.
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.35, 0);
  const twigGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const total = Math.min(4000, Math.round(500 + R * R * 70 + depth * 40));
  const twigs = new THREE.InstancedMesh(
    twigGeo,
    new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
    total,
  );
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const size = Math.max(0.3, Math.min(1.3, R * 0.22));
  let used = 0;
  const leafAt = (x: number, y: number, z: number) => {
    const f = Math.max(0, Math.min(1, (y - crownFoot) / depth));
    const lim = R * (planeRadius(f) * 1.05 + 0.04), dx = x - top.x, dz = z - top.z, dist = Math.hypot(dx, dz);
    if (dist > lim) { const k = lim / dist; x = top.x + dx * k; z = top.z + dz * k; }
    dummy.position.set(x, Math.min(H, y), z);
    dummy.rotation.set((r() - 0.5) * 1.3, r() * Math.PI, (r() - 0.5) * 1.3);
    const sz = size * (0.75 + r() * 0.5);
    dummy.scale.set(sz, sz, sz);
    dummy.updateMatrix();
    twigs.setMatrixAt(used, dummy.matrix);
    const pale = r() < 0.12;
    twigs.setColorAt(used, pale ? col.setHSL(0.22, 0.3, 0.52 + r() * 0.08) : col.setHSL(0.24 + r() * 0.04, 0.4 + r() * 0.15, 0.32 + r() * 0.1));
    used++;
  };
  const onSurface = Math.round(total * 0.33);
  for (let i = 0; i < onSurface; i++) {
    let f = 0;
    for (let tries = 0; tries < 6; tries++) { f = r(); if (r() < planeRadius(f) + 0.1) break; }
    const a = r() * Math.PI * 2, rad = R * planeRadius(f) * (0.8 + r() * 0.24);
    leafAt(top.x + Math.cos(a) * rad, crownFoot + f * depth, top.z + Math.sin(a) * rad);
  }
  const sumSq = clumps.reduce((t, cl) => t + cl.cr * cl.cr, 0);
  const inClumps = total - onSurface;
  clumps.forEach(({ c, cr }, ci) => {
    const m = ci === clumps.length - 1 ? total - used : Math.round((inClumps * cr * cr) / sumSq);
    for (let t = 0; t < m && used < total; t++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const yy = u < -0.45 ? u * 0.55 : u, ss = Math.sqrt(1 - yy * yy), d = cr * (0.55 + r() * 0.5);
      leafAt(c.x + Math.cos(a) * ss * d, c.y + yy * d * 0.8, c.z + Math.sin(a) * ss * d);
    }
  });
  twigs.count = used;
  g.add(twigs);

  // Seed balls: brown spheres hanging in ones and twos on long stalks under the outer clumps.
  const nBalls = Math.min(70, Math.round(12 + R * 4));
  const ballGeo = new THREE.SphereGeometry(1, 10, 8);
  const balls = new THREE.InstancedMesh(ballGeo, new THREE.MeshStandardMaterial({ color: "#7a5a32", roughness: 0.9 }), nBalls);
  const stalkGeos: THREE.BufferGeometry[] = [];
  const ballR = Math.max(0.03, Math.min(0.06, H * 0.0025)) * 1.3;
  for (let i = 0; i < nBalls; i++) {
    const { c, cr } = clumps[Math.floor(r() * (clumps.length - 1))]!;
    const a = r() * Math.PI * 2, d = cr * (0.7 + r() * 0.3);
    const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, y0 = c.y - cr * 0.3, len = 0.12 + r() * 0.18;
    stalkGeos.push(new THREE.CylinderGeometry(0.006, 0.006, len, 3).translate(x, y0 - len / 2, z));
    dummy.position.set(x, y0 - len - ballR, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(ballR * (0.85 + r() * 0.3));
    dummy.updateMatrix();
    balls.setMatrixAt(i, dummy.matrix);
  }
  g.add(balls);
  if (stalkGeos.length) g.add(new THREE.Mesh(mergeGeometries(stalkGeos)!, new THREE.MeshStandardMaterial({ color: "#5a4a34", roughness: 1 })));

  // Exactly the species' height, standing on y = 0.
  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - Math.min(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}
