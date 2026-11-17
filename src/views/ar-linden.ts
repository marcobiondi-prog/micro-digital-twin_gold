import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { limb, rng } from "@/views/ar-pine";

/**
 * The lime tree (Tilia, "tiglio") for the AR view, built in code with nothing to download: a tall straight trunk with
 * grey bark of fine interlacing ridges and a few burrs and suckers at its foot, bare up to about a quarter of the height,
 * then many scaffold branches climbing steeply and arching out, under a dense, regular egg-shaped crown whose lower rim
 * droops a little — overlapping clumps of heart-shaped, finely toothed leaves, mid green with lighter undersides here
 * and there. Stands on y = 0, exactly h tall, the crown about w across. A seed varies branches and clumps.
 */

let barkTex: THREE.Texture | null = null;
let leafTex: THREE.Texture | null = null;

/** Lime bark: grey, a network of fine long ridges that split and join (a stretched diamond pattern). */
function barkTexture() {
  if (barkTex) return barkTex;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(808);
  g.fillStyle = "#7f7b72";
  g.fillRect(0, 0, c.width, c.height);
  g.lineCap = "round";
  // Ridges: wavy lines that lean left and right, crossing into long diamonds.
  for (let i = 0; i < 34; i++) {
    const x0 = r() * 140 - 6, dir = r() < 0.5 ? -1 : 1;
    g.strokeStyle = r() < 0.5 ? `rgba(55,50,44,${0.45 + r() * 0.35})` : `rgba(160,155,145,${0.3 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 2.2;
    g.beginPath();
    let x = x0;
    g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 16) { x += dir * (1.5 + r() * 2) + (r() - 0.5) * 2; g.lineTo(x, y); }
    g.stroke();
  }
  barkTex = new THREE.CanvasTexture(c);
  barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  return barkTex;
}

/** A twig of heart-shaped leaves with a toothed edge and veins, alternate along it, white-ish so instances tint it. */
function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = rng(909);
  const heart = (x: number, y: number, a: number, s: number) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
    const v = 175 + Math.floor(r() * 70);
    g.fillStyle = `rgb(${v},${v},${v})`;
    // Heart: two lobes at the stalk, a pointed tip; the edge drawn as small teeth.
    g.beginPath();
    const pts: [number, number][] = [];
    for (let t = 0; t <= 1; t += 0.05) {
      const a2 = Math.PI * 2 * t;
      const rx = 16 * Math.sin(a2) ** 3, ry = -(13 * Math.cos(a2) - 5 * Math.cos(2 * a2) - 2 * Math.cos(3 * a2) - Math.cos(4 * a2));
      pts.push([rx, ry - 4]);
    }
    pts.forEach(([px, py], i) => {
      const tooth = i % 2 ? 1.06 : 0.97;
      if (i === 0) g.moveTo(px * tooth, py * tooth); else g.lineTo(px * tooth, py * tooth);
    });
    g.closePath(); g.fill();
    g.strokeStyle = "rgba(90,90,90,0.45)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, 6); g.lineTo(0, -20);
    for (const k of [0, 1, 2]) { const yy = 2 - k * 7; g.moveTo(0, yy); g.lineTo(9 - k * 2, yy - 6); g.moveTo(0, yy); g.lineTo(-9 + k * 2, yy - 6); }
    g.stroke();
    g.restore();
  };
  g.strokeStyle = "rgb(120,100,85)"; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(64, 127); g.quadraticCurveTo(58, 70, 66, 14); g.stroke();
  for (let k = 0; k < 6; k++) {
    const t = 0.12 + k * 0.15, y = 127 - t * 113, side = k % 2 ? 1 : -1;
    heart(64 + side * 18, y - 4, side * (0.6 + r() * 0.3), 0.85 + r() * 0.35);
  }
  heart(66, 16, (r() - 0.5) * 0.3, 1);
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

/** The crown's half-width at f (0 at its foot, 1 at its top): an egg, broadest a little below the middle. */
export function lindenRadius(f: number): number {
  if (f <= 0 || f >= 1) return f <= 0 ? 0.55 : 0;
  const m = 0.42;
  const d = (f - m) / (f < m ? 0.62 : 0.58);
  return Math.sqrt(Math.max(0, 1 - d * d));
}

export function realLinden(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 211 + 41);
  const H = Math.max(2, def.h);
  const W = Math.min(H * 0.9, Math.max(H * 0.45, def.w || H * 0.65));
  const R = W / 2;
  const g = new THREE.Group();

  // Trunk: straight with a slight sway, bare to about a quarter of the height, running on into the crown as a leader.
  const crownFoot = H * (0.22 + r() * 0.06);
  const depth = H - crownFoot;
  const trunkR = Math.max(0.08, H * 0.03);
  const sway = (y: number) => ({ x: Math.sin(y * 0.35 + seed) * H * 0.006, z: Math.cos(y * 0.3 + seed) * H * 0.006 });
  const leaderTop = crownFoot + depth * 0.75;
  const trunkPts = [0, 0.3, 0.6, 1].map((t) => { const y = leaderTop * t, s = sway(y); return new THREE.Vector3(s.x, y, s.z); });
  const woodGeos: THREE.BufferGeometry[] = [limb(trunkPts, trunkR, trunkR * 0.3, 14, 12)];
  // A flared foot with a few burrs and short suckers, as limes have.
  const foot = new THREE.CylinderGeometry(trunkR * 1.05, trunkR * 1.5, H * 0.03, 12);
  foot.translate(0, H * 0.015, 0);
  woodGeos.push(foot);
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2, y = H * (0.01 + r() * 0.05);
    const burr = new THREE.SphereGeometry(trunkR * (0.25 + r() * 0.2), 8, 6);
    burr.translate(Math.cos(a) * trunkR * 1.05, y, Math.sin(a) * trunkR * 1.05);
    woodGeos.push(burr);
    if (r() < 0.6) woodGeos.push(limb([new THREE.Vector3(Math.cos(a) * trunkR, y, Math.sin(a) * trunkR), new THREE.Vector3(Math.cos(a) * trunkR * 1.6, y + H * 0.04, Math.sin(a) * trunkR * 1.6)], trunkR * 0.08, trunkR * 0.03, 3, 5));
  }

  // Scaffold branches: climbing steeply from the trunk, then arching out to the egg's outline, where clumps sit.
  const clumps: { c: THREE.Vector3; cr: number }[] = [];
  const nb = Math.round(9 + Math.min(8, R * 1.2));
  for (let i = 0; i < nb; i++) {
    const f0 = 0.04 + (i / nb) * 0.62 + r() * 0.04;
    const y0 = crownFoot + f0 * depth, s0 = sway(y0);
    const a = i * 2.39996 + r() * 0.4;
    const fEnd = Math.min(0.9, f0 + 0.18 + r() * 0.12);
    const env = R * lindenRadius(fEnd);
    const out = env * (0.68 + r() * 0.15);
    const yEnd = crownFoot + fEnd * depth;
    const mid = new THREE.Vector3(s0.x + Math.cos(a) * out * 0.35, (y0 + yEnd) / 2 + depth * 0.06, s0.z + Math.sin(a) * out * 0.35);
    const end = new THREE.Vector3(s0.x + Math.cos(a) * out, yEnd, s0.z + Math.sin(a) * out);
    woodGeos.push(limb([new THREE.Vector3(s0.x, y0, s0.z), mid, end], trunkR * 0.42, trunkR * 0.1, 7, 7));
    clumps.push({ c: end, cr: Math.max(0.35, R * (0.34 + r() * 0.12)) });
    // A side clump on the way, so the crown is full inside too.
    const side = new THREE.Vector3(mid.x * 1.15, mid.y + depth * 0.05, mid.z * 1.15);
    clumps.push({ c: side, cr: Math.max(0.3, R * (0.26 + r() * 0.1)) });
  }
  // The leader's top and a ring of clumps round the lower rim, drooping a little.
  const top = sway(H);
  clumps.push({ c: new THREE.Vector3(top.x, crownFoot + depth * 0.86, top.z), cr: R * 0.42 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.5, f = 0.1 + r() * 0.08;
    const env = R * lindenRadius(f);
    clumps.push({ c: new THREE.Vector3(Math.cos(a) * env * 0.82, crownFoot + f * depth - depth * 0.04, Math.sin(a) * env * 0.82), cr: R * (0.24 + r() * 0.08) });
  }

  const bark = barkTexture().clone();
  bark.needsUpdate = true;
  bark.repeat.set(1.5, Math.max(1, H / 3));
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.92 })));

  // Leaves: a darker body in each clump, heart-leaf twigs all over it.
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.35, 0);
  const twigGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const total = Math.min(4200, Math.round(600 + R * R * 90 + depth * 50));
  const twigs = new THREE.InstancedMesh(
    twigGeo,
    new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }),
    total,
  );
  // One egg-shaped inner body (a lathe of the outline at 70 %), so the crown never looks see-through nor tiered.
  const steps = 24, pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    pts.push(new THREE.Vector2(Math.max(0.001, R * 0.7 * lindenRadius(f)), crownFoot + f * depth));
  }
  const body = new THREE.LatheGeometry(pts, 20);
  const bp = body.attributes["position"]!;
  const v = new THREE.Vector3();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    const k = 1 + Math.sin(v.y * 1.3 + Math.atan2(v.z, v.x) * 4 + seed) * 0.06;
    const s = sway(v.y);
    bp.setXYZ(i, v.x * k + s.x, v.y, v.z * k + s.z);
  }
  body.computeVertexNormals();
  g.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: "#36522a", roughness: 1 })));
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const sy = 0.85;
  const sumSq = clumps.reduce((t, cl) => t + cl.cr * cl.cr, 0);
  const size = Math.max(0.25, Math.min(1.1, R * 0.2));
  let used = 0;
  const leafAt = (x: number, y: number, z: number) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set((r() - 0.5) * 1.2, r() * Math.PI, (r() - 0.5) * 1.2);
    const sz = size * (0.75 + r() * 0.5);
    dummy.scale.set(sz, sz, sz);
    dummy.updateMatrix();
    twigs.setMatrixAt(used, dummy.matrix);
    // Mid green, a few lighter ones (the paler underside turned up).
    const pale = r() < 0.14;
    twigs.setColorAt(used, pale ? col.setHSL(0.24, 0.32, 0.5 + r() * 0.08) : col.setHSL(0.25 + r() * 0.04, 0.42 + r() * 0.15, 0.3 + r() * 0.1));
    used++;
  };
  // Half the leaves evenly over the egg's surface (none of it bare), half in the clumps (its lumps).
  const onSurface = Math.round(total * 0.5);
  for (let i = 0; i < onSurface; i++) {
    let f = 0;
    for (let tries = 0; tries < 6; tries++) { f = r(); if (r() < lindenRadius(f) + 0.1) break; }
    const a = r() * Math.PI * 2, y = crownFoot + f * depth, sw = sway(y);
    const rad = R * lindenRadius(f) * (0.84 + r() * 0.2);
    leafAt(sw.x + Math.cos(a) * rad, Math.min(H, y), sw.z + Math.sin(a) * rad);
  }
  const inClumps = total - onSurface;
  clumps.forEach(({ c, cr }, ci) => {
    const m = ci === clumps.length - 1 ? total - used : Math.round((inClumps * cr * cr) / sumSq);
    for (let t = 0; t < m && used < total; t++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const yy = u < -0.45 ? u * 0.55 : u, ss = Math.sqrt(1 - yy * yy), d = cr * (0.6 + r() * 0.45);
      let x = c.x + Math.cos(a) * ss * d, y = c.y + yy * d * sy, z = c.z + Math.sin(a) * ss * d;
      // Kept within the egg (a little past its outline at most), so the crown keeps its shape.
      const f = Math.max(0, Math.min(1, (y - crownFoot) / depth)), sw = sway(y);
      const lim = R * (lindenRadius(f) * 1.04 + 0.04), dx = x - sw.x, dz = z - sw.z, dist = Math.hypot(dx, dz);
      if (dist > lim) { const k = lim / dist; x = sw.x + dx * k; z = sw.z + dz * k; }
      if (y > H) y = H - r() * size;
      leafAt(x, y, z);
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
