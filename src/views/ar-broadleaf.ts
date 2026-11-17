import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { limb, rng } from "@/views/ar-pine";

/**
 * The builder shared by the broadleaved trees and shrubs with a model of their own (views/ar-species): one or more
 * trunks bare up to the crown, scaffold branches climbing from them and arching out to the crown's outline where clumps
 * of leaves sit, an inner body of that outline so the crown never looks see-through, leaves spread over the outline and
 * in the clumps and kept within it, curtains of hanging leaves for a weeping crown, and the species' extras (flowers,
 * fruits). Everything a species differs by is in its BroadleafSpec: outline, proportions, trunk, branches, the bark and
 * leaf pictures it draws and its colours. Stands on y = 0, exactly h tall.
 */

export type HSL = [number, number, number];
export type BroadleafSpec = {
  /** The crown's half-width at f (0 at its foot, 1 at its top), 0…1. */
  radius: (f: number) => number;
  /** The crown's width / height: [least, most, without a measure]. */
  width: [number, number, number];
  /** Where the crown starts, as a share of the height: [least, most]. */
  clear: [number, number];
  trunk: { r: number; lean?: number; stems?: [number, number]; splay?: number; leader?: number; sway?: number; flare?: number };
  branches: { count: [number, number]; steep?: number; droop?: number };
  body: { scale: number; color: string };
  /** Share of the leaves spread evenly over the outline (the rest go in clumps). */
  surface: number;
  /** Leaves: how many (× the usual), how big (× the usual), how many hang in curtains (weeping). */
  leaves: { count?: number; size?: number; hanging?: number; roughness?: number };
  color: HSL;
  /** A second leaf colour (the paler underside, autumn tints, flowers among the leaves) and its share. */
  alt?: { color: HSL; share: number };
  bark: () => THREE.Texture;
  barkRepeat?: [number, number];
  leaf: () => THREE.Texture;
  /** Flowers or fruits added on the crown (candles of the horse chestnut, magnolia flowers, oleander flowers…). */
  extras?: (ctx: ExtrasContext) => void;
};
export type ExtrasContext = {
  g: THREE.Group; r: () => number; H: number; R: number; crownFoot: number; depth: number;
  centre: THREE.Vector3; clumps: { c: THREE.Vector3; cr: number }[];
  /** A point on the crown's outline at f and angle a, a share k out. */
  onOutline: (f: number, a: number, k: number) => THREE.Vector3;
};

export function buildBroadleaf(spec: BroadleafSpec, def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 307 + 19);
  const H = Math.max(0.5, def.h);
  const [wMin, wMax, wDef] = spec.width;
  const W = Math.min(H * wMax, Math.max(H * wMin, def.w || H * wDef));
  const R = W / 2;
  const g = new THREE.Group();

  // Trunk(s).
  const crownFoot = H * (spec.clear[0] + r() * (spec.clear[1] - spec.clear[0]));
  const depth = H - crownFoot;
  const t = spec.trunk;
  const nStems = t.stems ? t.stems[0] + Math.floor(r() * (t.stems[1] - t.stems[0] + 1)) : 1;
  const trunkR = Math.max(0.025, H * t.r) * (nStems > 1 ? 1 / Math.sqrt(nStems) : 1);
  const la = r() * Math.PI * 2, lean = H * (t.lean ?? 0) * r();
  const sw = t.sway ?? 0.006;
  const axisAt = (y: number) => ({ x: Math.cos(la) * lean * (y / H) ** 2 + Math.sin(y * 0.35 + seed) * H * sw, z: Math.sin(la) * lean * (y / H) ** 2 + Math.cos(y * 0.3 + seed) * H * sw });
  const leaderTop = crownFoot + depth * (t.leader ?? 0.7);
  const woodGeos: THREE.BufferGeometry[] = [];
  const tops: THREE.Vector3[] = [];
  for (let s = 0; s < nStems; s++) {
    const a = la + (s / nStems) * Math.PI * 2 + r() * 0.5;
    const splay = nStems > 1 ? R * (t.splay ?? 0.25) : 0;
    const pts = [0, 0.35, 0.7, 1].map((k) => { const y = leaderTop * k, ax = axisAt(y); return new THREE.Vector3(ax.x + Math.cos(a) * splay * Math.sqrt(k), y, ax.z + Math.sin(a) * splay * Math.sqrt(k)); });
    woodGeos.push(limb(pts, trunkR, trunkR * 0.3, 12, 10));
    tops.push(pts[3]!);
  }
  if ((t.flare ?? 1.4) > 1) {
    const foot = new THREE.CylinderGeometry(trunkR * 1.05, trunkR * (t.flare ?? 1.4), H * 0.025, 12);
    foot.translate(0, H * 0.012, 0);
    woodGeos.push(foot);
  }
  const centre = new THREE.Vector3(axisAt(crownFoot + depth * 0.5).x, 0, axisAt(crownFoot + depth * 0.5).z);
  const onOutline = (f: number, a: number, k: number) => {
    const y = crownFoot + f * depth, ax = axisAt(y), rad = R * spec.radius(f) * k;
    return new THREE.Vector3(ax.x + Math.cos(a) * rad, y, ax.z + Math.sin(a) * rad);
  };

  // Scaffold branches: from the trunk(s), climbing then arching out to the outline; a clump at each end and one on the way.
  const clumps: { c: THREE.Vector3; cr: number }[] = [];
  const [bMin, bMax] = spec.branches.count;
  const nb = Math.round(bMin + Math.min(bMax - bMin, R * 1.2));
  const steep = spec.branches.steep ?? 0.06, droop = spec.branches.droop ?? 0;
  for (let i = 0; i < nb; i++) {
    const stem = tops[i % tops.length]!;
    const f0 = 0.04 + (i / nb) * 0.62 + r() * 0.04;
    const y0 = Math.min(stem.y, crownFoot + f0 * depth), ax0 = axisAt(y0);
    const sx = nStems > 1 ? stem.x * (y0 / Math.max(0.01, stem.y)) : ax0.x, sz = nStems > 1 ? stem.z * (y0 / Math.max(0.01, stem.y)) : ax0.z;
    const a = i * 2.39996 + r() * 0.4;
    const fEnd = Math.min(0.9, f0 + 0.18 + r() * 0.12);
    const end = onOutline(fEnd, a, 0.66 + r() * 0.16);
    end.y -= droop * depth * r();
    const mid = new THREE.Vector3((sx + end.x) / 2 * 0.8 + sx * 0.2, (y0 + end.y) / 2 + depth * steep, (sz + end.z) / 2 * 0.8 + sz * 0.2);
    woodGeos.push(limb([new THREE.Vector3(sx, y0, sz), mid, end], trunkR * 0.42, trunkR * 0.1, 7, 7));
    clumps.push({ c: end, cr: Math.max(0.2, R * (0.32 + r() * 0.12)) });
    clumps.push({ c: new THREE.Vector3(mid.x * 1.1, mid.y + depth * 0.04, mid.z * 1.1), cr: Math.max(0.18, R * (0.24 + r() * 0.1)) });
  }
  const topAx = axisAt(crownFoot + depth * 0.86);
  clumps.push({ c: new THREE.Vector3(topAx.x, crownFoot + depth * 0.86, topAx.z), cr: R * 0.4 });
  for (let i = 0; i < 7; i++) {
    const p = onOutline(0.1 + r() * 0.08, (i / 7) * Math.PI * 2 + r() * 0.5, 0.82);
    p.y -= depth * 0.03;
    clumps.push({ c: p, cr: R * (0.22 + r() * 0.08) });
  }

  const bark = spec.bark().clone();
  bark.needsUpdate = true;
  const [bx, by] = spec.barkRepeat ?? [1.5, 3];
  bark.repeat.set(bx, Math.max(1, H / by));
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.92 })));

  // Inner body of the outline.
  const steps = 24, pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    pts.push(new THREE.Vector2(Math.max(0.001, R * spec.body.scale * spec.radius(f)), crownFoot + f * depth));
  }
  const body = new THREE.LatheGeometry(pts, 20);
  const bp = body.attributes["position"]!;
  const v = new THREE.Vector3();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    const k = 1 + Math.sin(v.y * 1.3 + Math.atan2(v.z, v.x) * 4 + seed) * 0.08;
    const ax = axisAt(v.y);
    bp.setXYZ(i, v.x * k + ax.x, v.y, v.z * k + ax.z);
  }
  body.computeVertexNormals();
  g.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: spec.body.color, roughness: 1 })));

  // Leaves.
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.35, 0);
  const twigGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const total = Math.min(4400, Math.round((600 + R * R * 90 + depth * 50) * (spec.leaves.count ?? 1)));
  const twigs = new THREE.InstancedMesh(
    twigGeo,
    new THREE.MeshStandardMaterial({ map: spec.leaf(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: spec.leaves.roughness ?? 0.8 }),
    total,
  );
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const size = Math.max(0.12, Math.min(1.2, Math.max(R, depth / 4) * 0.2 * (spec.leaves.size ?? 1)));
  const [h0, s0, l0] = spec.color;
  let used = 0;
  const leafAt = (x: number, y: number, z: number, hang = false) => {
    if (!hang) {
      const f = Math.max(0, Math.min(1, (y - crownFoot) / depth)), ax = axisAt(y);
      const lim = R * (spec.radius(f) * 1.04 + 0.04), dx = x - ax.x, dz = z - ax.z, dist = Math.hypot(dx, dz);
      if (dist > lim) { const k = lim / dist; x = ax.x + dx * k; z = ax.z + dz * k; }
    }
    dummy.position.set(x, Math.min(H, Math.max(0.05, y)), z);
    dummy.rotation.set(hang ? Math.PI + (r() - 0.5) * 0.4 : (r() - 0.5) * 1.2, r() * Math.PI, hang ? (r() - 0.5) * 0.3 : (r() - 0.5) * 1.2);
    const sz = size * (0.75 + r() * 0.5);
    dummy.scale.set(hang ? sz * 0.5 : sz, sz * (hang ? 1.6 : 1), hang ? sz * 0.5 : sz);
    dummy.updateMatrix();
    twigs.setMatrixAt(used, dummy.matrix);
    const alt = spec.alt && r() < spec.alt.share;
    if (alt) twigs.setColorAt(used, col.setHSL(spec.alt!.color[0] + (r() - 0.5) * 0.02, spec.alt!.color[1], spec.alt!.color[2] * (0.9 + r() * 0.2)));
    else twigs.setColorAt(used, col.setHSL(h0 + (r() - 0.5) * 0.04, Math.min(1, s0 * (0.85 + r() * 0.3)), l0 * (0.8 + r() * 0.4)));
    used++;
  };
  const hanging = Math.round(total * (spec.leaves.hanging ?? 0));
  const onSurface = Math.round((total - hanging) * spec.surface);
  for (let i = 0; i < onSurface; i++) {
    let f = 0;
    for (let tries = 0; tries < 6; tries++) { f = r(); if (r() < spec.radius(f) + 0.1) break; }
    const p = onOutline(f, r() * Math.PI * 2, 0.84 + r() * 0.2);
    leafAt(p.x, p.y, p.z);
  }
  const sumSq = clumps.reduce((s, cl) => s + cl.cr * cl.cr, 0);
  const inClumps = total - hanging - onSurface;
  let placed = 0;
  clumps.forEach(({ c, cr }, ci) => {
    const m = ci === clumps.length - 1 ? inClumps - placed : Math.round((inClumps * cr * cr) / sumSq);
    for (let k = 0; k < m && used < total - hanging; k++, placed++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const yy = u < -0.45 ? u * 0.55 : u, ss = Math.sqrt(1 - yy * yy), d = cr * (0.6 + r() * 0.45);
      leafAt(c.x + Math.cos(a) * ss * d, c.y + yy * d * 0.85, c.z + Math.sin(a) * ss * d);
    }
  });
  // Curtains hanging from the rim, mostly short, a few down to near the ground.
  while (used < total && hanging > 0) {
    // Like a fountain: from anywhere on the dome, falling and leaning a little outwards as they fall, ending unevenly.
    const f = 0.15 + Math.pow(r(), 0.7) * 0.7, a = r() * Math.PI * 2;
    const p = onOutline(f, a, 0.9 + r() * 0.12);
    const fall = Math.pow(r(), 1.2) * Math.max(0.3, p.y - H * (0.08 + r() * 0.1));
    const ax = axisAt(p.y - fall), out = 1 + 0.18 * (fall / Math.max(1, H));
    leafAt(ax.x + (p.x - ax.x) * out, p.y - fall, ax.z + (p.z - ax.z) * out, true);
  }
  twigs.count = used;
  g.add(twigs);

  spec.extras?.({ g, r, H, R, crownFoot, depth, centre, clumps, onOutline });

  // Exactly the species' height, standing on y = 0.
  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - Math.min(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}

/** Instanced small flowers or fruits (spheres or cones), coloured, at the given points. */
export function dots(g: THREE.Group, points: THREE.Vector3[], radius: number, color: string | ((i: number) => string), shape: "sphere" | "cone" = "sphere", stretch = 1) {
  if (!points.length) return;
  const geo = shape === "cone" ? new THREE.ConeGeometry(1, 2.4, 7).translate(0, 1.2, 0) : new THREE.IcosahedronGeometry(1, 1);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }), points.length);
  const d = new THREE.Object3D(), col = new THREE.Color();
  points.forEach((p, i) => {
    d.position.copy(p);
    d.rotation.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
    d.scale.set(radius, radius * stretch, radius);
    d.updateMatrix();
    m.setMatrixAt(i, d.matrix);
    m.setColorAt(i, col.set(typeof color === "function" ? color(i) : color));
  });
  g.add(m);
}

/** A canvas texture drawn once (cached by key). */
const cache = new Map<string, THREE.Texture>();
export function drawn(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void, repeat = false): () => THREE.Texture {
  return () => {
    const had = cache.get(key);
    if (had) return had;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d")!, rng(key.length * 131 + key.charCodeAt(0)));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    cache.set(key, t);
    return t;
  };
}
